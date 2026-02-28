"""Testes de get_current_user e require_role — US-001 e US-002.

Cobre as dependências de autenticação e autorização em app/api/deps.py:
  - get_current_user com token de acesso válido → retorna User
  - get_current_user com token do tipo refresh → 401
  - get_current_user com token inválido/malformado → 401
  - get_current_user com usuário inativo → 401
  - get_current_user com usuário inexistente no banco → 401
  - require_role com perfil correto → permite acesso
  - require_role com perfil incorreto → 403
  - require_role com múltiplos perfis aceitos → permite qualquer um
  - require_role com múltiplos perfis e perfil ausente → 403

US-001 RN-8: token JWT contém sub (user_id), role, secretaria_id.
US-002 RN-12: back-end valida perfil em CADA requisição.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api.deps import get_current_user, require_role
from app.core.security import create_access_token, create_refresh_token
from app.models.user import RoleEnum, User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_user(
    *,
    is_active: bool = True,
    role: RoleEnum = RoleEnum.secretaria,
) -> MagicMock:
    """Cria um mock de User com atributos mínimos para deps."""
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.role = role
    user.is_active = is_active
    return user


def make_db_with_user(user: MagicMock | None) -> AsyncMock:
    """Cria um mock de AsyncSession que retorna o user fornecido."""
    db = AsyncMock()
    scalar_mock = MagicMock()
    scalar_mock.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=scalar_mock)
    return db


def make_access_token(user: MagicMock) -> str:
    """Gera um access_token real para o user mock."""
    return create_access_token(
        {"sub": str(user.id), "role": user.role.value, "secretaria_id": None}
    )


# ---------------------------------------------------------------------------
# get_current_user — US-001 RN-8
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_current_user_valid_token_returns_user() -> None:
    """US-001 RN-8: access_token válido retorna o User autenticado do banco."""
    user = make_user()
    db = make_db_with_user(user)
    token = make_access_token(user)

    result = await get_current_user(token=token, db=db)

    assert result is user


@pytest.mark.asyncio
async def test_get_current_user_refresh_token_type_raises_401() -> None:
    """US-001: token do tipo 'refresh' não pode ser usado como access token → 401."""
    user = make_user()
    db = make_db_with_user(user)
    # Gera refresh_token em vez de access_token
    token = create_refresh_token(
        {"sub": str(user.id), "role": "secretaria", "secretaria_id": None}
    )

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=db)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_invalid_token_raises_401() -> None:
    """Token malformado ou adulterado retorna 401."""
    db = make_db_with_user(None)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token="token.invalido.adulterado", db=db)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_inactive_user_raises_401() -> None:
    """US-001: conta desativada (is_active=False) retorna 401 mesmo com token válido."""
    user = make_user(is_active=False)
    db = make_db_with_user(user)
    token = make_access_token(user)

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=db)

    assert exc_info.value.status_code == 401
    assert "desativada" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_get_current_user_user_not_found_raises_401() -> None:
    """Token válido mas user_id inexistente no banco retorna 401."""
    db = make_db_with_user(None)  # banco não encontra nenhum usuário
    fake_id = str(uuid.uuid4())
    token = create_access_token(
        {"sub": fake_id, "role": "secretaria", "secretaria_id": None}
    )

    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(token=token, db=db)

    assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# require_role — US-002 RN-12
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_role_matching_role_returns_user() -> None:
    """US-002 RN-12: perfil correto → acesso permitido, retorna o User."""
    user = make_user(role=RoleEnum.admin)

    checker = require_role(RoleEnum.admin)
    result = await checker(current_user=user)

    assert result is user


@pytest.mark.asyncio
async def test_require_role_wrong_role_raises_403() -> None:
    """US-002 RN-12: perfil incorreto → 403 (não 401 — usuário está autenticado)."""
    user = make_user(role=RoleEnum.secretaria)

    checker = require_role(RoleEnum.admin)

    with pytest.raises(HTTPException) as exc_info:
        await checker(current_user=user)

    assert exc_info.value.status_code == 403
    assert "Acesso negado" in exc_info.value.detail


@pytest.mark.asyncio
async def test_require_role_multiple_roles_allows_any_matching() -> None:
    """require_role aceita lista de perfis — qualquer um dos listados é suficiente."""
    user = make_user(role=RoleEnum.controladoria)

    checker = require_role(RoleEnum.admin, RoleEnum.controladoria)
    result = await checker(current_user=user)

    assert result is user


@pytest.mark.asyncio
async def test_require_role_multiple_roles_rejects_non_matching() -> None:
    """Lista de perfis não contém o perfil do usuário → 403."""
    user = make_user(role=RoleEnum.tesouraria)

    checker = require_role(RoleEnum.admin, RoleEnum.gabinete)

    with pytest.raises(HTTPException) as exc_info:
        await checker(current_user=user)

    assert exc_info.value.status_code == 403
