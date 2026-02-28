"""Serviço de Dashboard Executivo — US-011.

Responsabilidades:
  - Calcular KPIs do período: total_ordens, valor_total, em_aberto, pagas,
    taxa_reprovacao, tempo_medio_dias
  - Fornecer dados para gráficos: por_etapa, por_secretaria, status_por_secretaria
  - Detectar gargalos: ordens paradas > 5 dias na mesma etapa
  - Detectar secretarias com atenção: taxa devolução/irregularidade > 20%

CLAUDE.md §11 (US-011):
  RN-55: KPIs calculados no banco (queries agregadas) — NUNCA no front-end.
  RN-56: gargalos = ordens paradas > 5 dias úteis (usamos dias corridos para simplicidade).
  RN-57: secretarias com taxa > 20% geram alerta.
  RN-58: endpoint agregado — não calcular no front-end.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StatusOrdemEnum
from app.models.ordem import Ordem
from app.models.ordem_historico import OrdemHistorico
from app.models.secretaria import Secretaria

# ---------------------------------------------------------------------------
# Constantes de negócio
# ---------------------------------------------------------------------------

# Status que representam ordens ainda em aberto (não terminais)
STATUS_ABERTOS: list[StatusOrdemEnum] = [
    StatusOrdemEnum.AGUARDANDO_GABINETE,
    StatusOrdemEnum.AGUARDANDO_CONTROLADORIA,
    StatusOrdemEnum.DEVOLVIDA_PARA_ALTERACAO,
    StatusOrdemEnum.COM_IRREGULARIDADE,
    StatusOrdemEnum.AGUARDANDO_DOCUMENTACAO,
    StatusOrdemEnum.AGUARDANDO_EMPENHO,
    StatusOrdemEnum.AGUARDANDO_EXECUCAO,
    StatusOrdemEnum.AGUARDANDO_ATESTO,
    StatusOrdemEnum.EXECUCAO_COM_PENDENCIA,
    StatusOrdemEnum.AGUARDANDO_LIQUIDACAO,
    StatusOrdemEnum.AGUARDANDO_PAGAMENTO,
]

# Status terminais — excluídos de "em aberto"
STATUS_TERMINAIS: list[StatusOrdemEnum] = [
    StatusOrdemEnum.PAGA,
    StatusOrdemEnum.CANCELADA,
]

# Status que indicam problema de conformidade (taxa_reprovacao / secretarias_atencao)
STATUS_PROBLEMA: list[StatusOrdemEnum] = [
    StatusOrdemEnum.DEVOLVIDA_PARA_ALTERACAO,
    StatusOrdemEnum.COM_IRREGULARIDADE,
]

# Alerta de gargalo: > 5 dias corridos na mesma etapa (US-011 RN-56)
DIAS_GARGALO = 5

# Taxa de atenção para secretarias (US-011 RN-57)
TAXA_ATENCAO_PERCENTUAL = 20.0


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------


def _dt_inicio(d: date) -> datetime:
    """Converte date para datetime UTC início do dia."""
    return datetime.combine(d, time.min).replace(tzinfo=timezone.utc)


def _dt_fim(d: date) -> datetime:
    """Converte date para datetime UTC fim do dia."""
    return datetime.combine(d, time.max).replace(tzinfo=timezone.utc)


def _safe_float(value: Any) -> float:
    """Converte Decimal ou None para float seguro."""
    if value is None:
        return 0.0
    return float(value)


# ---------------------------------------------------------------------------
# DashboardService
# ---------------------------------------------------------------------------


class DashboardService:
    """Serviço de queries agregadas para o dashboard executivo."""

    # -----------------------------------------------------------------------
    # GET /api/dashboard/summary
    # -----------------------------------------------------------------------

    async def get_summary(
        self,
        db: AsyncSession,
        data_inicio: date,
        data_fim: date,
        secretaria_id: uuid.UUID | None = None,
    ) -> dict[str, Any]:
        """Retorna KPIs e dados para gráficos do período informado.

        Args:
            db: Sessão assíncrona do banco.
            data_inicio: Início do período (inclusivo).
            data_fim: Fim do período (inclusivo).
            secretaria_id: Quando informado, limita os dados à secretaria.

        Returns:
            Dict com kpis, por_etapa, por_secretaria, status_por_secretaria.
        """
        dt_ini = _dt_inicio(data_inicio)
        dt_fim = _dt_fim(data_fim)

        # Condições base de filtro por período
        base_filters = [
            Ordem.created_at >= dt_ini,
            Ordem.created_at <= dt_fim,
        ]
        if secretaria_id is not None:
            base_filters.append(Ordem.secretaria_id == secretaria_id)

        # ----------------------------------------------------------------
        # Subquery: ordem_ids que já passaram por status de problema
        # (para taxa_reprovacao e secretarias_atencao)
        # ----------------------------------------------------------------
        problema_sq = (
            select(OrdemHistorico.ordem_id)
            .where(OrdemHistorico.status_novo.in_(STATUS_PROBLEMA))
            .distinct()
            .subquery()
        )

        # ----------------------------------------------------------------
        # KPI: total_ordens
        # ----------------------------------------------------------------
        r_total = await db.execute(
            select(func.count(Ordem.id)).where(*base_filters)
        )
        total_ordens: int = r_total.scalar_one() or 0

        # ----------------------------------------------------------------
        # KPI: valor_total (SUM valor_estimado)
        # ----------------------------------------------------------------
        r_valor = await db.execute(
            select(func.coalesce(func.sum(Ordem.valor_estimado), 0)).where(*base_filters)
        )
        valor_total: float = _safe_float(r_valor.scalar_one())

        # ----------------------------------------------------------------
        # KPI: em_aberto (status não terminal)
        # ----------------------------------------------------------------
        r_aberto = await db.execute(
            select(func.count(Ordem.id))
            .where(*base_filters)
            .where(Ordem.status.in_(STATUS_ABERTOS))
        )
        em_aberto: int = r_aberto.scalar_one() or 0

        # ----------------------------------------------------------------
        # KPI: pagas (status PAGA)
        # ----------------------------------------------------------------
        r_pagas = await db.execute(
            select(func.count(Ordem.id))
            .where(*base_filters)
            .where(Ordem.status == StatusOrdemEnum.PAGA)
        )
        pagas: int = r_pagas.scalar_one() or 0

        # ----------------------------------------------------------------
        # KPI: taxa_reprovacao (% ordens com problema / total)
        # ----------------------------------------------------------------
        r_prob = await db.execute(
            select(func.count(Ordem.id))
            .where(*base_filters)
            .where(Ordem.id.in_(select(problema_sq.c.ordem_id)))
        )
        count_problema: int = r_prob.scalar_one() or 0
        taxa_reprovacao: float = (
            round(count_problema * 100.0 / total_ordens, 2) if total_ordens > 0 else 0.0
        )

        # ----------------------------------------------------------------
        # KPI: tempo_medio_dias (AVG dias entre created_at e data_pagamento)
        # ----------------------------------------------------------------
        r_tempo = await db.execute(
            select(
                func.avg(
                    func.extract("epoch", Ordem.data_pagamento - Ordem.created_at)
                    / 86400
                )
            )
            .where(*base_filters)
            .where(Ordem.status == StatusOrdemEnum.PAGA)
            .where(Ordem.data_pagamento.isnot(None))
        )
        tempo_raw = r_tempo.scalar_one()
        tempo_medio_dias: float = round(_safe_float(tempo_raw), 1)

        # ----------------------------------------------------------------
        # Gráfico: por_etapa — COUNT por status
        # ----------------------------------------------------------------
        r_etapa = await db.execute(
            select(Ordem.status, func.count(Ordem.id).label("count"))
            .where(*base_filters)
            .group_by(Ordem.status)
            .order_by(func.count(Ordem.id).desc())
        )
        por_etapa = [
            {"status": row.status.value, "count": row.count}
            for row in r_etapa.all()
        ]

        # ----------------------------------------------------------------
        # Gráfico: por_secretaria — valor_estimado e valor_pago por secretaria
        # ----------------------------------------------------------------
        r_sec = await db.execute(
            select(
                Secretaria.nome.label("secretaria_nome"),
                func.coalesce(func.sum(Ordem.valor_estimado), 0).label(
                    "valor_estimado_total"
                ),
                func.coalesce(func.sum(Ordem.valor_pago), 0).label("valor_pago_total"),
            )
            .select_from(Ordem)
            .join(Secretaria, Ordem.secretaria_id == Secretaria.id)
            .where(*base_filters)
            .group_by(Secretaria.id, Secretaria.nome)
            .order_by(func.sum(Ordem.valor_estimado).desc())
        )
        por_secretaria = [
            {
                "secretaria_nome": row.secretaria_nome,
                "valor_estimado_total": _safe_float(row.valor_estimado_total),
                "valor_pago_total": _safe_float(row.valor_pago_total),
            }
            for row in r_sec.all()
        ]

        # ----------------------------------------------------------------
        # Gráfico: status_por_secretaria — count por (secretaria, status)
        # ----------------------------------------------------------------
        r_sps = await db.execute(
            select(
                Secretaria.nome.label("secretaria_nome"),
                Ordem.status,
                func.count(Ordem.id).label("count"),
            )
            .select_from(Ordem)
            .join(Secretaria, Ordem.secretaria_id == Secretaria.id)
            .where(*base_filters)
            .group_by(Secretaria.id, Secretaria.nome, Ordem.status)
            .order_by(Secretaria.nome, Ordem.status)
        )
        status_por_secretaria = [
            {
                "secretaria_nome": row.secretaria_nome,
                "status": row.status.value,
                "count": row.count,
            }
            for row in r_sps.all()
        ]

        return {
            "kpis": {
                "total_ordens": total_ordens,
                "valor_total": valor_total,
                "em_aberto": em_aberto,
                "pagas": pagas,
                "taxa_reprovacao": taxa_reprovacao,
                "tempo_medio_dias": tempo_medio_dias,
            },
            "por_etapa": por_etapa,
            "por_secretaria": por_secretaria,
            "status_por_secretaria": status_por_secretaria,
        }

    # -----------------------------------------------------------------------
    # GET /api/dashboard/alertas
    # -----------------------------------------------------------------------

    async def get_alertas(
        self, db: AsyncSession
    ) -> dict[str, Any]:
        """Retorna gargalos e secretarias que precisam de atenção.

        Returns:
            Dict com:
              gargalos: ordens paradas > DIAS_GARGALO dias corridos.
              secretarias_atencao: secretarias com taxa de problema > 20%.
        """

        # ----------------------------------------------------------------
        # Gargalos: último evento de histórico por ordem, calcular dias
        # ----------------------------------------------------------------
        last_hist_sq = (
            select(
                OrdemHistorico.ordem_id,
                func.max(OrdemHistorico.created_at).label("last_at"),
            )
            .group_by(OrdemHistorico.ordem_id)
            .subquery()
        )

        dias_expr = func.extract("day", func.now() - last_hist_sq.c.last_at)

        r_garg = await db.execute(
            select(
                Ordem.id.label("ordem_id"),
                Ordem.protocolo,
                Secretaria.nome.label("secretaria_nome"),
                Ordem.status,
                dias_expr.label("dias_na_etapa"),
            )
            .select_from(Ordem)
            .join(Secretaria, Ordem.secretaria_id == Secretaria.id)
            .join(last_hist_sq, Ordem.id == last_hist_sq.c.ordem_id)
            .where(Ordem.status.not_in(STATUS_TERMINAIS))
            .where(dias_expr > DIAS_GARGALO)
            .order_by(dias_expr.desc())
            .limit(100)
        )
        gargalos = [
            {
                "ordem_id": str(row.ordem_id),
                "protocolo": row.protocolo,
                "secretaria_nome": row.secretaria_nome,
                "status": row.status.value,
                "dias_na_etapa": int(row.dias_na_etapa or 0),
            }
            for row in r_garg.all()
        ]

        # ----------------------------------------------------------------
        # Secretarias com atenção: taxa de problema > TAXA_ATENCAO_PERCENTUAL
        # ----------------------------------------------------------------
        # Subquery: ordens com problema (já passaram por DEVOLVIDA ou COM_IRREG)
        problema_sq = (
            select(OrdemHistorico.ordem_id)
            .where(OrdemHistorico.status_novo.in_(STATUS_PROBLEMA))
            .distinct()
            .subquery()
        )

        # Outer join: ordens da secretaria LEFT JOIN ordens_com_problema
        # COUNT(problema_sq.c.ordem_id) conta apenas os que fazem match (não NULL)
        total_col = func.count(Ordem.id).label("total")
        problema_col = func.count(problema_sq.c.ordem_id).label("com_problema")
        percentual_col = (
            func.count(problema_sq.c.ordem_id)
            * 100.0
            / func.nullif(func.count(Ordem.id), 0)
        ).label("percentual")

        r_atencao = await db.execute(
            select(
                Secretaria.nome.label("secretaria_nome"),
                total_col,
                problema_col,
                percentual_col,
            )
            .select_from(Ordem)
            .join(Secretaria, Ordem.secretaria_id == Secretaria.id)
            .outerjoin(problema_sq, Ordem.id == problema_sq.c.ordem_id)
            .group_by(Secretaria.id, Secretaria.nome)
            .having(
                func.count(problema_sq.c.ordem_id)
                * 100.0
                / func.nullif(func.count(Ordem.id), 0)
                > TAXA_ATENCAO_PERCENTUAL
            )
            .order_by(
                (
                    func.count(problema_sq.c.ordem_id)
                    * 100.0
                    / func.nullif(func.count(Ordem.id), 0)
                ).desc()
            )
        )
        secretarias_atencao = [
            {
                "secretaria_nome": row.secretaria_nome,
                "total_ordens": row.total,
                "com_problema": row.com_problema,
                "percentual": round(_safe_float(row.percentual), 2),
            }
            for row in r_atencao.all()
        ]

        return {
            "gargalos": gargalos,
            "secretarias_atencao": secretarias_atencao,
        }


# Singleton — instância única para uso nos routers
dashboard_service = DashboardService()
