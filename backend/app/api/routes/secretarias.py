"""Router de Secretarias Municipais — US-013.

Endpoints:
  GET    /api/secretarias          — Listar secretarias (qualquer autenticado)
  POST   /api/secretarias          — Criar secretaria (admin)
  PUT    /api/secretarias/{id}     — Editar secretaria (admin)
  PATCH  /api/secretarias/{id}/status — Ativar/desativar secretaria (admin)

US-013 RN-65: nome e sigla únicos no sistema.
US-013 RN-66: secretaria desativada mantém histórico — não pode receber novas ordens.
US-013 RN-68: não é possível excluir — apenas desativar.
"""

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.secretaria import Secretaria
from app.models.user import RoleEnum, User
from app.schemas.secretaria import SecretariaCreate, SecretariaResponse, SecretariaUpdate

router = APIRouter(prefix="/api/secretarias", tags=["Secretarias"])

# Dependency reutilizável: exige perfil admin
AdminRequired = Annotated[User, Depends(require_role(RoleEnum.admin))]
AnyAuthenticated = Annotated[User, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# GET /api/secretarias
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=list[SecretariaResponse],
    status_code=200,
)
async def list_secretarias(
    _current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SecretariaResponse]:
    """Lista todas as secretarias (ativas e inativas).

    Disponível para qualquer usuário autenticado — necessário para popular
    selects de filtro e criação de ordens.
    US-013: secretarias ordenadas por nome ASC.
    """
    result = await db.execute(
        select(Secretaria).order_by(Secretaria.nome.asc())
    )
    secretarias = result.scalars().all()
    return [SecretariaResponse.model_validate(s) for s in secretarias]


# ---------------------------------------------------------------------------
# POST /api/secretarias
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=SecretariaResponse,
    status_code=201,
    responses={
        409: {"description": "Nome ou sigla já cadastrados"},
        403: {"description": "Acesso negado — perfil admin obrigatório"},
    },
)
async def create_secretaria(
    payload: SecretariaCreate,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SecretariaResponse:
    """Cria uma nova secretaria municipal.

    US-013 RN-65: nome e sigla devem ser únicos no sistema.
    """
    # Verifica unicidade de nome (case-insensitive)
    dup_nome = await db.execute(
        select(Secretaria).where(
            func.lower(Secretaria.nome) == payload.nome.lower()
        )
    )
    if dup_nome.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma secretaria com este nome.",
        )

    # Verifica unicidade de sigla (já normalizada para maiúsculas pelo validator)
    dup_sigla = await db.execute(
        select(Secretaria).where(Secretaria.sigla == payload.sigla)
    )
    if dup_sigla.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma secretaria com esta sigla.",
        )

    secretaria = Secretaria(
        nome=payload.nome,
        sigla=payload.sigla,
        orcamento_anual=payload.orcamento_anual,
        ativo=True,
    )
    db.add(secretaria)
    await db.commit()
    await db.refresh(secretaria)
    return SecretariaResponse.model_validate(secretaria)


# ---------------------------------------------------------------------------
# PUT /api/secretarias/{secretaria_id}
# ---------------------------------------------------------------------------


@router.put(
    "/{secretaria_id}",
    response_model=SecretariaResponse,
    status_code=200,
    responses={
        404: {"description": "Secretaria não encontrada"},
        409: {"description": "Nome ou sigla já em uso por outra secretaria"},
    },
)
async def update_secretaria(
    secretaria_id: uuid.UUID,
    payload: SecretariaUpdate,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SecretariaResponse:
    """Atualiza dados de uma secretaria (PATCH semântico — campos opcionais).

    US-013 RN-65: nome e sigla continuam devendo ser únicos se alterados.
    US-013 RN-68: para desativar, usar PATCH /{id}/status.
    """
    result = await db.execute(
        select(Secretaria).where(Secretaria.id == secretaria_id)
    )
    secretaria = result.scalar_one_or_none()

    if secretaria is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Secretaria não encontrada.",
        )

    # Verifica unicidade de nome se alterado
    if payload.nome is not None and payload.nome.lower() != secretaria.nome.lower():
        dup = await db.execute(
            select(Secretaria).where(
                func.lower(Secretaria.nome) == payload.nome.lower()
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe uma secretaria com este nome.",
            )
        secretaria.nome = payload.nome

    # Verifica unicidade de sigla se alterada (já normalizada pelo validator)
    if payload.sigla is not None and payload.sigla != secretaria.sigla:
        dup = await db.execute(
            select(Secretaria).where(Secretaria.sigla == payload.sigla)
        )
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe uma secretaria com esta sigla.",
            )
        secretaria.sigla = payload.sigla

    if payload.orcamento_anual is not None:
        secretaria.orcamento_anual = payload.orcamento_anual

    secretaria.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(secretaria)
    return SecretariaResponse.model_validate(secretaria)


# ---------------------------------------------------------------------------
# PATCH /api/secretarias/{secretaria_id}/status
# ---------------------------------------------------------------------------


@router.patch(
    "/{secretaria_id}/status",
    response_model=SecretariaResponse,
    status_code=200,
    responses={
        404: {"description": "Secretaria não encontrada"},
    },
)
async def toggle_status(
    secretaria_id: uuid.UUID,
    current_user: AdminRequired,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SecretariaResponse:
    """Ativa ou desativa uma secretaria (toggle).

    US-013 RN-66: secretaria desativada mantém histórico de ordens.
    US-013 RN-68: exclusão não é permitida — apenas desativação.
    """
    result = await db.execute(
        select(Secretaria).where(Secretaria.id == secretaria_id)
    )
    secretaria = result.scalar_one_or_none()

    if secretaria is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Secretaria não encontrada.",
        )

    secretaria.ativo = not secretaria.ativo
    secretaria.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(secretaria)
    return SecretariaResponse.model_validate(secretaria)
