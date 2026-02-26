"""Testes HTTP de autenticação — US-001.

Cobre os endpoints do router /api/auth/* via httpx.AsyncClient + ASGITransport.
Cada teste mocka auth_service para controlar o comportamento do service layer;
os testes de service puro (lock expiry, attempts reset) ficam em seção dedicada
usando mock_db diretamente para maior fidelidade.

US-001 Cenários 1–7.
US-001 RNs 1–6.
"""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.main import app
from app.models.user import RoleEnum, User
from app.schemas.auth import RefreshTokenResponse, TokenResponse
from app.schemas.user import UserResponse
from app.services.auth_service import auth_service


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_user_response(user: MagicMock) -> UserResponse:
    """Constrói um UserResponse a partir de um mock User."""
    return UserResponse(
        id=user.id,
        email=user.email,
        nome=user.nome_completo,            # populate_by_name=True
        role=user.role.value,
        secretaria_id=user.secretaria_id,
        is_active=user.is_active,
        must_change_password=user.first_login,  # populate_by_name=True
        created_at=user.created_at,
    )


def make_token_response(user: MagicMock, access_token: str) -> TokenResponse:
    """Constrói um TokenResponse para uso em mocks de auth_service."""
    return TokenResponse(
        token=access_token,
        refresh_token="refresh.token.mock",
        user=make_user_response(user),
    )


def make_db_mock(user: MagicMock | None, mock_db: AsyncMock) -> None:
    """Configura mock_db.execute para retornar o usuário especificado."""
    scalar_mock = MagicMock()
    scalar_mock.scalar_one_or_none.return_value = user
    mock_db.execute = AsyncMock(return_value=scalar_mock)


AUTH = "app.api.routes.auth.auth_service"


# ===========================================================================
# POST /api/auth/login
# ===========================================================================


async def test_login_success(
    client: AsyncClient,
    admin_user: MagicMock,
    admin_token: str,
) -> None:
    """US-001 Cenário 1: credenciais válidas → 200 com token, refresh_token e user."""
    expected = make_token_response(admin_user, admin_token)

    with patch(f"{AUTH}.authenticate", new_callable=AsyncMock, return_value=expected):
        response = await client.post(
            "/api/auth/login",
            json={"email": "admin@prefeitura.gov.br", "password": "Admin123"},
        )

    assert response.status_code == 200
    body = response.json()
    assert "token" in body
    assert "refresh_token" in body
    assert body["user"]["email"] == "admin@prefeitura.gov.br"
    assert body["user"]["role"] == "admin"


async def test_login_wrong_email(client: AsyncClient) -> None:
    """US-001 Cenário 2: e-mail inexistente → 401 com mensagem genérica."""
    with patch(
        f"{AUTH}.authenticate",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=401, detail="E-mail ou senha incorretos."),
    ):
        response = await client.post(
            "/api/auth/login",
            json={"email": "fantasma@prefeitura.gov.br", "password": "Senha123"},
        )

    assert response.status_code == 401
    assert "incorretos" in response.json()["detail"].lower()


async def test_login_wrong_password(client: AsyncClient) -> None:
    """US-001 Cenário 2: senha incorreta → 401 com mesma mensagem genérica (não revela tentativas)."""
    with patch(
        f"{AUTH}.authenticate",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=401, detail="E-mail ou senha incorretos."),
    ):
        response = await client.post(
            "/api/auth/login",
            json={"email": "admin@prefeitura.gov.br", "password": "SenhaErrada99"},
        )

    assert response.status_code == 401
    # Mensagem genérica — não revela tentativas restantes (US-001 RN-1)
    body = response.json()
    assert "incorretos" in body["detail"].lower()
    assert "tentativa" not in body["detail"].lower()


async def test_login_account_locked(client: AsyncClient) -> None:
    """US-001 Cenário 3: conta bloqueada → 423 com mensagem de bloqueio."""
    with patch(
        f"{AUTH}.authenticate",
        new_callable=AsyncMock,
        side_effect=HTTPException(
            status_code=423,
            detail="Conta bloqueada temporariamente. Tente novamente em 15 minutos.",
        ),
    ):
        response = await client.post(
            "/api/auth/login",
            json={"email": "admin@prefeitura.gov.br", "password": "SenhaErrada99"},
        )

    assert response.status_code == 423
    assert "bloqueada" in response.json()["detail"].lower()


async def test_login_lock_expires(
    client: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """US-001 Cenário 4: bloqueio expirado → login bem-sucedido + tentativas zeradas.

    Usa o auth_service real com mock_db que retorna usuário com locked_until no passado.
    """
    past = datetime.now(timezone.utc) - timedelta(minutes=20)
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "expirado@prefeitura.gov.br"
    user.nome_completo = "Usuário Desbloqueado"
    user.password_hash = hash_password("Senha123")
    user.role = RoleEnum.secretaria
    user.is_active = True
    user.first_login = False
    user.login_attempts = 5
    user.locked_until = past           # bloqueio expirado
    user.secretaria_id = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)

    make_db_mock(user, mock_db)

    response = await client.post(
        "/api/auth/login",
        json={"email": "expirado@prefeitura.gov.br", "password": "Senha123"},
    )

    assert response.status_code == 200
    assert user.login_attempts == 0
    assert user.locked_until is None


async def test_login_resets_attempts(
    client: AsyncClient,
    mock_db: AsyncMock,
) -> None:
    """US-001 RN-1: login bem-sucedido após tentativas erradas reseta o contador.

    Usa o auth_service real com mock_db que retorna usuário com 3 tentativas registradas.
    """
    user = MagicMock(spec=User)
    user.id = uuid.uuid4()
    user.email = "com3tentativas@prefeitura.gov.br"
    user.nome_completo = "Usuário Teste"
    user.password_hash = hash_password("Senha123")
    user.role = RoleEnum.gabinete
    user.is_active = True
    user.first_login = False
    user.login_attempts = 3           # 3 tentativas anteriores
    user.locked_until = None
    user.secretaria_id = None
    user.created_at = datetime.now(timezone.utc)
    user.updated_at = datetime.now(timezone.utc)

    make_db_mock(user, mock_db)

    response = await client.post(
        "/api/auth/login",
        json={"email": "com3tentativas@prefeitura.gov.br", "password": "Senha123"},
    )

    assert response.status_code == 200
    assert user.login_attempts == 0    # contador zerado após login bem-sucedido


# ===========================================================================
# POST /api/auth/refresh
# ===========================================================================


async def test_refresh_token_valid(
    client: AsyncClient,
    admin_token: str,
) -> None:
    """US-001 Cenário 6: refresh_token válido retorna novo access_token."""
    with patch(
        f"{AUTH}.refresh_token",
        new_callable=AsyncMock,
        return_value=RefreshTokenResponse(token=admin_token),
    ):
        response = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": "valid.refresh.token"},
        )

    assert response.status_code == 200
    body = response.json()
    assert "token" in body
    assert body["token"] == admin_token


async def test_refresh_token_invalid(client: AsyncClient) -> None:
    """US-001 Cenário 6: refresh_token inválido ou expirado → 401."""
    with patch(
        f"{AUTH}.refresh_token",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=401, detail="Token inválido ou expirado."),
    ):
        response = await client.post(
            "/api/auth/refresh",
            json={"refresh_token": "token.invalido.adulterado"},
        )

    assert response.status_code == 401


# ===========================================================================
# GET /api/auth/me
# ===========================================================================


async def test_get_me_authenticated(
    client: AsyncClient,
    admin_user: MagicMock,
    admin_token: str,
) -> None:
    """GET /me com token válido retorna dados do usuário autenticado."""
    # Sobrescreve get_current_user para retornar admin_user sem consultar o banco
    app.dependency_overrides[get_current_user] = lambda: admin_user

    try:
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "admin@prefeitura.gov.br"
    assert body["role"] == "admin"


async def test_get_me_unauthenticated(client: AsyncClient) -> None:
    """GET /me sem token retorna 401 — oauth2_scheme rejeita a requisição."""
    response = await client.get("/api/auth/me")

    assert response.status_code == 401
