"""Router de Ordens de Serviço — US-003 a US-010.

Endpoints:
  POST   /api/ordens                   — Criar nova ordem (secretaria)
  GET    /api/ordens                   — Listar ordens com filtros e paginação
  GET    /api/ordens/{ordem_id}        — Detalhe completo da ordem com histórico
  PUT    /api/ordens/{ordem_id}        — Editar ordem devolvida (secretaria)
  PATCH  /api/ordens/{ordem_id}/acao  — Executar ação de workflow (RBAC por ação)
"""

import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user, require_role
from app.core.database import get_db
from app.models.enums import FormaPagamentoEnum
from app.models.user import RoleEnum, User
from app.schemas.ordem import (
    AtesteRequest,
    EmpenhoRequest,
    LiquidacaoRequest,
    OrdemCreate,
    OrdemDetailResponse,
    OrdemListResponse,
    OrdemResponse,
    OrdemUpdate,
    PagamentoRequest,
)
from app.services.ordem_service import ordem_service
from app.services.workflow_engine import workflow_engine

router = APIRouter(prefix="/api/ordens", tags=["Ordens"])

# Dependency reutilizável: exige perfil secretaria
SecretariaRequired = Annotated[User, Depends(require_role(RoleEnum.secretaria))]
# Qualquer usuário autenticado
AnyAuthenticated = Annotated[User, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Utilitário interno
# ---------------------------------------------------------------------------


def _date_to_datetime(d: date) -> datetime:
    """Converte date → datetime UTC para campos TIMESTAMPTZ do banco."""
    return datetime.combine(d, time.min).replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# POST /api/ordens
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=OrdemResponse,
    status_code=201,
    responses={
        403: {"description": "Perfil sem permissão — somente secretaria"},
        404: {"description": "Secretaria do usuário não encontrada"},
        422: {"description": "Secretaria desativada ou dados inválidos"},
    },
)
async def create_ordem(
    payload: OrdemCreate,
    current_user: SecretariaRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
    client_ip: Annotated[str | None, Depends(get_client_ip)],
) -> OrdemResponse:
    """Cria nova ordem de serviço, compra ou obra.

    US-003: somente o perfil 'secretaria' pode criar ordens.
    US-003 RN-13: protocolo gerado automaticamente no padrão OS-ANO-SEQUENCIAL.
    US-003 RN-15: secretaria vinculada automaticamente ao usuário criador.
    US-003 RN-20: status inicial = AGUARDANDO_GABINETE.
    """
    return await ordem_service.create_ordem(
        db=db,
        data=payload,
        user=current_user,
        ip_address=client_ip,
    )


# ---------------------------------------------------------------------------
# GET /api/ordens
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=OrdemListResponse,
    status_code=200,
)
async def list_ordens(
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1, description="Página (1-based)")] = 1,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Registros por página (máx. 100)")
    ] = 20,
    status: Annotated[
        str | None,
        Query(description="Filtrar por status exato (ex.: AGUARDANDO_GABINETE)"),
    ] = None,
    protocolo: Annotated[
        str | None,
        Query(description="Busca EXATA por número de protocolo (US-004 RN-25)"),
    ] = None,
    secretaria_id: Annotated[
        uuid.UUID | None,
        Query(description="Filtrar por UUID de secretaria (perfis globais)"),
    ] = None,
) -> OrdemListResponse:
    """Lista ordens com RBAC scoping, filtros e paginação.

    US-004 RN-21: perfil 'secretaria' vê apenas ordens da própria secretaria.
    US-004 RN-24: paginação padrão de 20 registros por página.
    US-004 RN-25: busca por protocolo é exata (não parcial).
    """
    return await ordem_service.list_ordens(
        db=db,
        user=current_user,
        page=page,
        limit=limit,
        status_filter=status,
        protocolo_filter=protocolo,
        secretaria_filter=secretaria_id,
    )


# ---------------------------------------------------------------------------
# GET /api/ordens/{ordem_id}
# ---------------------------------------------------------------------------


@router.get(
    "/{ordem_id}",
    response_model=OrdemDetailResponse,
    status_code=200,
    responses={
        403: {"description": "Secretaria tentando acessar ordem de outra secretaria"},
        404: {"description": "Ordem não encontrada"},
    },
)
async def get_ordem(
    ordem_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrdemDetailResponse:
    """Retorna detalhe completo da ordem com histórico de tramitação.

    US-004 RN-22: histórico em ordem cronológica (created_at ASC).
    US-012 RN-61: campos auditáveis completos no histórico.
    """
    return await ordem_service.get_ordem_detail(
        db=db,
        ordem_id=ordem_id,
        user=current_user,
    )


# ---------------------------------------------------------------------------
# PUT /api/ordens/{ordem_id}
# ---------------------------------------------------------------------------


@router.put(
    "/{ordem_id}",
    response_model=OrdemResponse,
    status_code=200,
    responses={
        403: {"description": "Secretaria sem permissão para editar esta ordem"},
        404: {"description": "Ordem não encontrada"},
        422: {"description": "Ordem não está em DEVOLVIDA_PARA_ALTERACAO"},
    },
)
async def update_ordem(
    ordem_id: uuid.UUID,
    payload: OrdemUpdate,
    current_user: SecretariaRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrdemResponse:
    """Edita uma ordem devolvida para alteração (PATCH semântico).

    US-006 RN-32: somente ordens DEVOLVIDA_PARA_ALTERACAO podem ser editadas.
    US-006 RN-33: protocolo e secretaria permanecem inalterados.
    """
    return await ordem_service.update_ordem(
        db=db,
        ordem_id=ordem_id,
        data=payload,
        user=current_user,
    )


# ---------------------------------------------------------------------------
# PATCH /api/ordens/{ordem_id}/acao
# ---------------------------------------------------------------------------


@router.patch(
    "/{ordem_id}/acao",
    response_model=OrdemResponse,
    status_code=200,
    responses={
        403: {"description": "Perfil sem permissão para esta ação"},
        404: {"description": "Ordem não encontrada"},
        422: {"description": "Ação inválida para o status atual ou dados obrigatórios ausentes"},
    },
)
async def executar_acao(
    ordem_id: uuid.UUID,
    body: Annotated[dict[str, Any], Body()],
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
    client_ip: Annotated[str | None, Depends(get_client_ip)],
) -> OrdemResponse:
    """Executa uma ação de workflow sobre uma ordem.

    O campo 'acao' determina a transição de status e os dados extras exigidos:
      - autorizar, solicitar_alteracao, cancelar: Gabinete
      - reenviar, enviar_documentacao, iniciar_atesto, atestar, recusar_atesto: Secretaria
      - aprovar, irregularidade, solicitar_documentacao: Controladoria
      - empenhar (numero_empenho, valor_empenhado): Contabilidade
      - liquidar (valor_liquidado, data_liquidacao): Contabilidade
      - pagar (valor_pago, data_pagamento, forma_pagamento): Tesouraria

    US-005 a US-010: transições gerenciadas pelo WorkflowEngine.
    US-012 RN-60: toda transição registrada em ordem_historico (append-only).
    """
    acao: str | None = body.get("acao")
    if not acao:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Campo 'acao' é obrigatório.",
        )

    observacao: str | None = body.get("observacao")

    # Extrai e valida dados_extras conforme a ação (usando schemas Pydantic)
    dados_extras: dict[str, Any] | None = None

    try:
        if acao == "empenhar":
            parsed = EmpenhoRequest.model_validate(body)
            dados_extras = {
                "numero_empenho": parsed.numero_empenho,
                "valor_empenhado": parsed.valor_empenhado,
            }

        elif acao == "atestar":
            parsed = AtesteRequest.model_validate(body)
            dados_extras = {
                "numero_nf": parsed.numero_nf,
            }

        elif acao == "liquidar":
            parsed = LiquidacaoRequest.model_validate(body)
            dados_extras = {
                "valor_liquidado": parsed.valor_liquidado,
                # Converte date → datetime UTC (campo TIMESTAMPTZ no banco)
                "data_liquidacao": _date_to_datetime(parsed.data_liquidacao),
            }

        elif acao == "pagar":
            parsed = PagamentoRequest.model_validate(body)
            dados_extras = {
                "valor_pago": parsed.valor_pago,
                "data_pagamento": _date_to_datetime(parsed.data_pagamento),
                "forma_pagamento": FormaPagamentoEnum(parsed.forma_pagamento),
            }

    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Dados inválidos para a ação '{acao}': {exc}",
        ) from exc

    ordem = await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem_id,
        acao=acao,
        user=current_user,
        observacao=observacao,
        ip_address=client_ip,
        dados_extras=dados_extras,
    )

    # Recarrega com relacionamentos para montar OrdemResponse
    from app.services.ordem_service import OrdemService
    svc = OrdemService()
    ordem_com_rel = await svc._load_with_relations(db, ordem.id)
    return svc._build_response(ordem_com_rel)  # type: ignore[arg-type]
