"""Router de Auditoria — US-012.

Endpoints:
  GET /api/ordens/{ordem_id}/historico — Histórico de tramitação da ordem.
  GET /api/audit-logs                  — Log global de auditoria (admin only).

US-012 RN-60: audit_logs e ordem_historico são append-only.
US-012 RN-61: cada entrada contém campos completos de auditoria.
US-012 RN-62: histórico: admin, gabinete, controladoria, secretaria (scoped).
US-012 RN-64: logs de acesso separados de ordem_historico.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.audit import AuditLog
from app.models.ordem import Ordem
from app.models.ordem_historico import OrdemHistorico
from app.models.user import RoleEnum, User
from app.schemas.ordem import OrdemHistoricoResponse

router = APIRouter(prefix="/api", tags=["Auditoria"])

# ---------------------------------------------------------------------------
# Dependências
# ---------------------------------------------------------------------------

AdminRequired = Annotated[User, Depends(require_role(RoleEnum.admin))]
AnyAuthenticated = Annotated[User, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Schemas de resposta
# ---------------------------------------------------------------------------


class AuditLogResponse(BaseModel):
    """Item do log global de auditoria.

    US-012 RN-61: campos completos de auditoria.
    US-012 RN-64: separado de ordem_historico.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    user_nome: str | None = Field(None, description="Nome completo do usuário.")
    action: str = Field(description="Ação auditada (LOGIN, LOGOUT, LOGIN_FAILED, etc.).")
    ip_address: str | None
    user_agent: str | None
    created_at: datetime


class PaginatedAuditLogResponse(BaseModel):
    """Resposta paginada do log de auditoria."""

    items: list[AuditLogResponse]
    total: int
    page: int
    limit: int
    pages: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _enum_val(v: object) -> str | None:
    """Converte instância de enum Python para string; retorna None se None."""
    if v is None:
        return None
    return v.value if hasattr(v, "value") else str(v)


# ---------------------------------------------------------------------------
# GET /api/ordens/{ordem_id}/historico
# ---------------------------------------------------------------------------


@router.get(
    "/ordens/{ordem_id}/historico",
    response_model=list[OrdemHistoricoResponse],
    summary="Histórico de tramitação de uma ordem",
)
async def get_historico(
    ordem_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrdemHistoricoResponse]:
    """Retorna o histórico completo de tramitação em ordem cronológica.

    Perfis autorizados (US-012 RN-62):
      - admin: acesso total.
      - gabinete: acesso total (somente-leitura US-005 RN-31).
      - controladoria: acesso total (US-007 RN-40).
      - secretaria: somente da própria secretaria (US-004 RN-21).

    Raises:
        403: perfil sem permissão ou secretaria tentando acessar outra secretaria.
        404: ordem não encontrada.
    """
    # US-012 RN-62: perfis autorizados
    perfis_autorizados = {
        RoleEnum.admin,
        RoleEnum.gabinete,
        RoleEnum.controladoria,
        RoleEnum.secretaria,
    }
    if current_user.role not in perfis_autorizados:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Perfil sem permissão para visualizar o histórico.",
        )

    # Verificar existência da ordem
    ordem_result = await db.execute(select(Ordem).where(Ordem.id == ordem_id))
    ordem = ordem_result.scalar_one_or_none()
    if ordem is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ordem não encontrada.",
        )

    # Secretaria: apenas da própria secretaria (US-004 RN-21)
    if current_user.role == RoleEnum.secretaria:
        if ordem.secretaria_id != current_user.secretaria_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Acesso negado. "
                    "Você só pode visualizar histórico de ordens da sua secretaria."
                ),
            )

    # Buscar histórico com JOIN em users para obter nome do responsável
    stmt = (
        select(OrdemHistorico, User.nome_completo.label("usuario_nome"))
        .join(User, OrdemHistorico.usuario_id == User.id)
        .where(OrdemHistorico.ordem_id == ordem_id)
        .order_by(OrdemHistorico.created_at.asc())  # US-004 RN-22: cronológico ASC
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Construir resposta explicitamente (resultado de JOIN não é mapeável diretamente)
    return [
        OrdemHistoricoResponse(
            id=row.OrdemHistorico.id,
            acao=row.OrdemHistorico.acao,
            status_anterior=_enum_val(row.OrdemHistorico.status_anterior),
            status_novo=_enum_val(row.OrdemHistorico.status_novo),  # type: ignore[arg-type]
            observacao=row.OrdemHistorico.observacao,
            usuario_nome=row.usuario_nome,
            perfil=row.OrdemHistorico.perfil,  # já String(50) — sem enum
            created_at=row.OrdemHistorico.created_at,
        )
        for row in rows
    ]


# ---------------------------------------------------------------------------
# GET /api/audit-logs
# ---------------------------------------------------------------------------


@router.get(
    "/audit-logs",
    response_model=PaginatedAuditLogResponse,
    summary="Log global de auditoria do sistema (admin)",
)
async def get_audit_logs(
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
    usuario_id: uuid.UUID | None = Query(None, description="Filtrar por ID do usuário."),
    acao: str | None = Query(
        None,
        description="Filtrar por ação (login_success, logout, login_failed_*, etc.).",
    ),
    data_inicio: date | None = Query(
        None,
        description="Data de início do período (YYYY-MM-DD, inclusivo).",
    ),
    data_fim: date | None = Query(
        None,
        description="Data de fim do período (YYYY-MM-DD, inclusivo).",
    ),
    secretaria_id: uuid.UUID | None = Query(
        None,
        description="Filtrar por secretaria do usuário (join em users).",
    ),
    page: int = Query(1, ge=1, description="Página (1-based)."),
    limit: int = Query(20, ge=1, le=100, description="Registros por página (máx 100)."),
) -> PaginatedAuditLogResponse:
    """Retorna o log global de auditoria com filtros e paginação.

    Acesso exclusivo para administradores (US-012 RN-62).
    US-012 RN-60: log append-only — nenhum registro é alterado ou deletado.
    US-012 RN-64: logs de acesso separados de ordem_historico.

    Parâmetros de filtro:
      - usuario_id: UUID do usuário.
      - acao: nome exato da ação (login_success, logout, etc.).
      - data_inicio / data_fim: intervalo de datas (YYYY-MM-DD).
      - secretaria_id: secretaria do usuário (join em users.secretaria_id).
      - page / limit: paginação (padrão: 20 por página).
    """
    # Montar filtros dinamicamente
    filters = []
    if usuario_id:
        filters.append(AuditLog.user_id == usuario_id)
    if acao:
        filters.append(AuditLog.action == acao)
    if data_inicio:
        filters.append(func.date(AuditLog.created_at) >= data_inicio)
    if data_fim:
        filters.append(func.date(AuditLog.created_at) <= data_fim)
    if secretaria_id:
        # Filtra por secretaria do usuário (join necessário)
        filters.append(User.secretaria_id == secretaria_id)

    # --- Count total ---
    count_stmt = select(func.count(AuditLog.id)).outerjoin(
        User, AuditLog.user_id == User.id
    )
    if filters:
        count_stmt = count_stmt.where(and_(*filters))

    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # --- Busca paginada com LEFT JOIN em users ---
    # LEFT JOIN: user_id pode ser NULL (LOGIN_FAILED sem usuário)
    stmt = (
        select(AuditLog, User.nome_completo.label("user_nome"))
        .outerjoin(User, AuditLog.user_id == User.id)
    )
    if filters:
        stmt = stmt.where(and_(*filters))

    offset = (page - 1) * limit
    stmt = stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    rows = result.all()

    items = [
        AuditLogResponse(
            id=row.AuditLog.id,
            user_id=row.AuditLog.user_id,
            user_nome=row.user_nome,
            action=row.AuditLog.action,
            # INET do PostgreSQL pode retornar como string ou objeto — normalizar
            ip_address=str(row.AuditLog.ip_address) if row.AuditLog.ip_address else None,
            user_agent=row.AuditLog.user_agent,
            created_at=row.AuditLog.created_at,
        )
        for row in rows
    ]

    pages = max(1, (total + limit - 1) // limit)

    return PaginatedAuditLogResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )
