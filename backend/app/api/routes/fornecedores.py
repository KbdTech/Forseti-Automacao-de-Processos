"""Router de Fornecedores — S11.1.

Endpoints:
  GET    /api/fornecedores          — Listar fornecedores (qualquer autenticado, com scoping)
  POST   /api/fornecedores          — Criar fornecedor (admin)
  GET    /api/fornecedores/{id}     — Detalhar fornecedor (qualquer autenticado, com scoping)
  PUT    /api/fornecedores/{id}     — Editar fornecedor (admin)
  PATCH  /api/fornecedores/{id}/status — Ativar/Desativar fornecedor (admin)

S11.1 Cenário 9: POST/PUT/PATCH exigem perfil admin (HTTP 403 para outros).
S11.1 Cenário 5/6: scoping RBAC na listagem aplicado no service.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleEnum, User
from app.schemas.fornecedor import (
    FornecedorCreate,
    FornecedorListResponse,
    FornecedorResponse,
    FornecedorStatusUpdate,
    FornecedorUpdate,
)
from app.services.fornecedor_service import fornecedor_service

router = APIRouter(prefix="/api/fornecedores", tags=["Fornecedores"])

# Dependency aliases
AdminRequired = Annotated[User, Depends(require_role(RoleEnum.admin))]
AnyAuthenticated = Annotated[User, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# GET /api/fornecedores
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=FornecedorListResponse,
    status_code=200,
)
async def list_fornecedores(
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1, description="Página (1-based).")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Registros por página.")] = 20,
    q: Annotated[str | None, Query(description="Busca por razão social ou CNPJ.")] = None,
    secretaria_id: Annotated[
        uuid.UUID | None, Query(description="Filtrar por secretaria.")
    ] = None,
    is_active: Annotated[
        bool | None, Query(description="Filtrar por status ativo/inativo.")
    ] = None,
) -> FornecedorListResponse:
    """Lista fornecedores com scoping RBAC, filtros e paginação.

    Perfil secretaria vê apenas fornecedores da própria secretaria + globais.
    Demais perfis veem todos os fornecedores.
    """
    return await fornecedor_service.list_fornecedores(
        db=db,
        user=current_user,
        page=page,
        limit=limit,
        q=q,
        secretaria_id=secretaria_id,
        is_active=is_active,
    )


# ---------------------------------------------------------------------------
# POST /api/fornecedores
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=FornecedorResponse,
    status_code=201,
    responses={
        409: {"description": "CNPJ já cadastrado"},
        403: {"description": "Acesso negado — perfil admin obrigatório"},
    },
)
async def create_fornecedor(
    payload: FornecedorCreate,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResponse:
    """Cria novo fornecedor vencedor de licitação.

    Apenas administradores podem criar fornecedores.
    CNPJ deve ser único no sistema.
    """
    return await fornecedor_service.create_fornecedor(db=db, data=payload, user=current_user)


# ---------------------------------------------------------------------------
# GET /api/fornecedores/{id}
# ---------------------------------------------------------------------------


@router.get(
    "/{fornecedor_id}",
    response_model=FornecedorResponse,
    status_code=200,
    responses={
        404: {"description": "Fornecedor não encontrado"},
    },
)
async def get_fornecedor(
    fornecedor_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResponse:
    """Retorna detalhes de um fornecedor pelo ID.

    Perfil secretaria só acessa fornecedores da própria secretaria ou globais.
    """
    return await fornecedor_service.get_fornecedor(
        db=db, fornecedor_id=fornecedor_id, user=current_user
    )


# ---------------------------------------------------------------------------
# PUT /api/fornecedores/{id}
# ---------------------------------------------------------------------------


@router.put(
    "/{fornecedor_id}",
    response_model=FornecedorResponse,
    status_code=200,
    responses={
        404: {"description": "Fornecedor não encontrado"},
        403: {"description": "Acesso negado — perfil admin obrigatório"},
    },
)
async def update_fornecedor(
    fornecedor_id: uuid.UUID,
    payload: FornecedorUpdate,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResponse:
    """Atualiza dados de um fornecedor.

    CNPJ não é editável após criação.
    Apenas administradores podem editar fornecedores.
    """
    return await fornecedor_service.update_fornecedor(
        db=db, fornecedor_id=fornecedor_id, data=payload, user=current_user
    )


# ---------------------------------------------------------------------------
# PATCH /api/fornecedores/{id}/status
# ---------------------------------------------------------------------------


@router.patch(
    "/{fornecedor_id}/status",
    response_model=FornecedorResponse,
    status_code=200,
    responses={
        404: {"description": "Fornecedor não encontrado"},
        403: {"description": "Acesso negado — perfil admin obrigatório"},
    },
)
async def toggle_status(
    fornecedor_id: uuid.UUID,
    payload: FornecedorStatusUpdate,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResponse:
    """Ativa ou desativa um fornecedor.

    Fornecedor inativo não aparece nas listagens de seleção em novas ordens.
    Apenas administradores podem alterar o status.
    """
    return await fornecedor_service.toggle_status(
        db=db, fornecedor_id=fornecedor_id, is_active=payload.is_active, user=current_user
    )
