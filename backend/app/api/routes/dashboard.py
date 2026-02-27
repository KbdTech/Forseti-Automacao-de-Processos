"""Router do Dashboard Executivo — US-011.

Endpoints:
  GET /api/dashboard/summary  — KPIs e dados de gráficos do período informado.
  GET /api/dashboard/alertas  — Gargalos e secretarias que requerem atenção.

US-011 RN-55: KPIs calculados no banco (queries agregadas) — NUNCA no front-end.
US-011 RN-56: gargalos = ordens paradas > 5 dias corridos (DIAS_GARGALO).
US-011 RN-57: secretarias com taxa > 20% geram alerta.
US-011 RN-58: endpoint agregado — não calcular no front-end.
US-011 RN-59: atualização a cada 5 minutos ou via refresh manual.

Acesso:
  - GET /summary: gabinete, admin (e secretaria → scoped à própria secretaria_id)
  - GET /alertas: gabinete, admin
"""

from __future__ import annotations

import calendar
import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleEnum, User
from app.services.dashboard_service import dashboard_service

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

# ---------------------------------------------------------------------------
# Tipo de usuário autenticado com perfil restrito
# ---------------------------------------------------------------------------

# Perfis que podem acessar o dashboard (gabinete e admin)
DashboardUser = Annotated[
    User,
    Depends(require_role(RoleEnum.gabinete, RoleEnum.admin)),
]

# Qualquer autenticado (para /summary — secretaria também acessa scoped)
AnyAuthenticated = Annotated[User, Depends(get_current_user)]

# Máximo de meses permitidos por consulta (US-011: período máximo 12 meses)
MAX_PERIODO_MESES = 12


# ---------------------------------------------------------------------------
# Helpers de validação de período
# ---------------------------------------------------------------------------


def _add_months(d: date, months: int) -> date:
    """Adiciona N meses a uma date, sem dependências externas."""
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return d.replace(year=year, month=month, day=day)


def _validar_periodo(data_inicio: date, data_fim: date) -> None:
    """Valida que data_inicio <= data_fim e período <= 12 meses.

    US-011: Período máximo de 12 meses para evitar queries longas.

    Raises:
        HTTPException 422: quando as datas são inválidas.
    """
    if data_inicio > data_fim:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="data_inicio não pode ser posterior a data_fim.",
        )

    limite = _add_months(data_inicio, MAX_PERIODO_MESES)
    if data_fim > limite:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Período máximo é de {MAX_PERIODO_MESES} meses.",
        )


# ---------------------------------------------------------------------------
# GET /api/dashboard/summary
# ---------------------------------------------------------------------------


@router.get(
    "/summary",
    summary="KPIs e gráficos do dashboard executivo",
    response_model=None,  # retorna dict livre — schema rico demais para Pydantic aqui
)
async def get_summary(
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
    data_inicio: date = Query(
        ...,
        description="Início do período (YYYY-MM-DD, inclusivo)",
        examples=["2026-01-01"],
    ),
    data_fim: date = Query(
        ...,
        description="Fim do período (YYYY-MM-DD, inclusivo)",
        examples=["2026-12-31"],
    ),
    secretaria_id: uuid.UUID | None = Query(
        None,
        description="Filtrar por secretaria (apenas admin e gabinete podem filtrar por qualquer secretaria)",
    ),
) -> dict[str, Any]:
    """Retorna KPIs e dados dos gráficos do período informado.

    Perfis autorizados:
      - admin: acesso total, pode filtrar por qualquer secretaria_id.
      - gabinete: acesso total, pode filtrar por qualquer secretaria_id.
      - secretaria: acesso limitado à própria secretaria (secretaria_id é forçado).

    Regras:
      - US-011 RN-55: todos os cálculos feitos no banco via queries agregadas.
      - US-011 RN-58: dados retornados como payload único — não calcular no front-end.
      - Período máximo: 12 meses.

    Raises:
        403: perfil não autorizado.
        422: datas inválidas ou período maior que 12 meses.
    """
    # US-002 RN-12: validar perfil — secretaria pode acessar mas scoped à própria secretaria
    perfis_autorizados = {RoleEnum.gabinete, RoleEnum.admin, RoleEnum.secretaria}
    if current_user.role not in perfis_autorizados:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Perfil necessário: gabinete, admin ou secretaria.",
        )

    _validar_periodo(data_inicio, data_fim)

    # Secretaria: força filtro para a própria secretaria_id — ignora parâmetro externo
    if current_user.role == RoleEnum.secretaria:
        secretaria_id = current_user.secretaria_id
    # admin/gabinete: usa secretaria_id do query param (pode ser None = todos)

    return await dashboard_service.get_summary(
        db=db,
        data_inicio=data_inicio,
        data_fim=data_fim,
        secretaria_id=secretaria_id,
    )


# ---------------------------------------------------------------------------
# GET /api/dashboard/alertas
# ---------------------------------------------------------------------------


@router.get(
    "/alertas",
    summary="Gargalos e secretarias que requerem atenção",
    response_model=None,
)
async def get_alertas(
    current_user: DashboardUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Retorna gargalos e secretarias que precisam de atenção.

    Perfis autorizados: gabinete, admin.

    Retorna:
      - gargalos: ordens paradas > 5 dias corridos na mesma etapa (US-011 RN-56).
      - secretarias_atencao: secretarias com taxa de devolução/irregularidade > 20%
        (US-011 RN-57).

    Raises:
        403: perfil não autorizado.
    """
    return await dashboard_service.get_alertas(db=db)
