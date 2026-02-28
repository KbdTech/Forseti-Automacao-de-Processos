"""Fixtures compartilhadas — Sprint 1 (US-001 e US-002).

Fornece para test_auth.py e test_users.py:
  - admin_user, secretaria_user : mocks de User com atributos completos
  - admin_token, secretaria_token: JWTs válidos via create_access_token
  - mock_db  : AsyncSession mockada para injeção via dependency_overrides
  - client   : httpx.AsyncClient com ASGITransport → app FastAPI

O override de get_db é instalado no fixture `client` e removido ao final,
preservando quaisquer overrides previamente configurados.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator, AsyncIterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.user import RoleEnum, User


# ---------------------------------------------------------------------------
# Usuários de teste
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_user() -> MagicMock:
    """Usuário administrador mockado — sem conexão real ao banco."""
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "admin@prefeitura.gov.br"
    user.nome_completo = "Administrador do Sistema"
    user.password_hash = "hash_bcrypt"
    user.role = RoleEnum.admin
    user.is_active = True
    user.first_login = False
    user.login_attempts = 0
    user.locked_until = None
    user.secretaria_id = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


@pytest.fixture
def secretaria_user() -> MagicMock:
    """Usuário com perfil secretaria mockado."""
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "secretaria@prefeitura.gov.br"
    user.nome_completo = "Servidor da Secretaria"
    user.password_hash = "hash_bcrypt"
    user.role = RoleEnum.secretaria
    user.is_active = True
    user.first_login = False
    user.login_attempts = 0
    user.locked_until = None
    user.secretaria_id = uuid.uuid4()
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)
    return user


# ---------------------------------------------------------------------------
# Tokens JWT de teste
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_token(admin_user: MagicMock) -> str:
    """JWT de acesso (access_token) válido para o perfil admin."""
    return create_access_token({
        "sub": str(admin_user.id),
        "role": admin_user.role.value,
        "secretaria_id": None,
    })


@pytest.fixture
def secretaria_token(secretaria_user: MagicMock) -> str:
    """JWT de acesso (access_token) válido para o perfil secretaria."""
    return create_access_token({
        "sub": str(secretaria_user.id),
        "role": secretaria_user.role.value,
        "secretaria_id": str(secretaria_user.secretaria_id),
    })


# ---------------------------------------------------------------------------
# Mock de banco de dados
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db() -> AsyncMock:
    """Mock de AsyncSession para injeção via dependency_overrides.

    Métodos mockados: execute, flush, commit, refresh, add, rollback.
    Cada teste pode configurar mock_db.execute.return_value conforme necessário.
    """
    db = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    db.rollback = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# Cliente HTTP de teste
# ---------------------------------------------------------------------------


@pytest.fixture
async def client(mock_db: AsyncMock) -> AsyncIterator[AsyncClient]:
    """httpx.AsyncClient com ASGI transport apontando para o app FastAPI.

    - Override get_db → mock_db (evita conexão real ao PostgreSQL)
    - Restaura os overrides originais ao finalizar (não limpa outros overrides)
    """
    overrides_backup = app.dependency_overrides.copy()

    async def _override_get_db() -> AsyncGenerator[AsyncMock, None]:
        yield mock_db

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides = overrides_backup
