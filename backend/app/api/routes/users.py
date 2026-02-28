"""Router de usuários — US-002.

Endpoints:
  GET  /api/users            — Listar usuários com filtros e paginação (admin)
  POST /api/users            — Criar novo usuário (admin)
  PUT  /api/users/{user_id}  — Editar dados do usuário (admin)
  PUT  /api/users/{user_id}/role — Alterar perfil do usuário (admin)

US-002 RN-12: back-end valida role em CADA requisição via require_role.
US-002 RN-9:  admin não pode remover seu próprio perfil de admin.
US-002 RN-10: alterações de perfil registradas em role_change_log.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleEnum, User
from app.schemas.user import (
    UserCreate,
    UserListResponse,
    UserResponse,
    UserRoleUpdate,
    UserUpdate,
)
from app.services.user_service import user_service

router = APIRouter(prefix="/api/users", tags=["Usuários"])

# Dependency reutilizável: exige perfil admin em todos os endpoints deste router
AdminRequired = Annotated[User, Depends(require_role(RoleEnum.admin))]


# ---------------------------------------------------------------------------
# GET /api/users
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=UserListResponse,
    status_code=200,
    responses={
        403: {"description": "Acesso negado — perfil admin obrigatório"},
    },
)
async def list_users(
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1, description="Página (1-based)")] = 1,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Registros por página (máx. 100)")
    ] = 20,
    role: Annotated[
        str | None,
        Query(description="Filtrar por perfil (secretaria, gabinete, admin…)"),
    ] = None,
    secretaria_id: Annotated[
        uuid.UUID | None,
        Query(description="Filtrar por UUID da secretaria"),
    ] = None,
) -> UserListResponse:
    """Lista todos os usuários com filtros opcionais e paginação.

    US-002: visibilidade total dos usuários exclusiva para admin.
    US-004 RN-24: paginação padrão de 20 registros por página.
    """
    return await user_service.list_users(
        db=db,
        page=page,
        limit=limit,
        role_filter=role,
        secretaria_filter=secretaria_id,
    )


# ---------------------------------------------------------------------------
# POST /api/users
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=UserResponse,
    status_code=201,
    responses={
        409: {"description": "E-mail já cadastrado"},
        404: {"description": "Secretaria não encontrada"},
        422: {"description": "Secretaria desativada"},
    },
)
async def create_user(
    payload: UserCreate,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Cria um novo usuário no sistema.

    US-002: exclusivo para admin.
    US-001 RN-5: first_login=True → troca de senha obrigatória no primeiro acesso.
    US-002 RN-7: secretaria_id obrigatório para perfil 'secretaria'.
    """
    return await user_service.create_user(
        db=db,
        data=payload,
        created_by=current_user.id,
    )


# ---------------------------------------------------------------------------
# PUT /api/users/{user_id}
# ---------------------------------------------------------------------------


@router.put(
    "/{user_id}",
    response_model=UserResponse,
    status_code=200,
    responses={
        404: {"description": "Usuário não encontrado"},
        409: {"description": "E-mail já cadastrado"},
    },
)
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Atualiza dados de um usuário existente (PATCH semântico — campos opcionais).

    Apenas os campos fornecidos são atualizados.
    Para alterar o perfil, utilize PUT /{user_id}/role.

    US-002: exclusivo para admin.
    """
    return await user_service.update_user(
        db=db,
        user_id=user_id,
        data=payload,
        updated_by=current_user.id,
    )


# ---------------------------------------------------------------------------
# PUT /api/users/{user_id}/role
# ---------------------------------------------------------------------------


@router.put(
    "/{user_id}/role",
    response_model=UserResponse,
    status_code=200,
    responses={
        404: {"description": "Usuário não encontrado"},
        422: {"description": "Admin não pode remover seu próprio perfil de administrador"},
    },
)
async def update_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    """Altera o perfil de acesso de um usuário.

    US-002 RN-9: admin não pode remover seu próprio perfil de administrador.
    US-002 RN-10: alteração registrada em role_change_log (append-only).
    """
    return await user_service.update_role(
        db=db,
        user_id=user_id,
        new_role=payload.role,
        updated_by=current_user.id,
    )
