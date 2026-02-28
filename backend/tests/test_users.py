"""Testes HTTP de gestão de usuários — US-002.

Cobre os endpoints do router /api/users/* via httpx.AsyncClient + ASGITransport.
Cada teste mocka user_service para controlar o comportamento do service layer
e sobrescreve get_current_user via dependency_overrides para evitar consulta real
ao banco de dados.

US-002 Cenários 1–7.
US-002 RNs 9, 10, 12.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.main import app
from app.schemas.user import UserListResponse, UserResponse


# ---------------------------------------------------------------------------
# Constantes e helpers
# ---------------------------------------------------------------------------

USERS = "app.api.routes.users.user_service"


def make_user_response(user, role_override: str | None = None) -> UserResponse:
    """Constrói um UserResponse a partir de um mock User."""
    return UserResponse(
        id=user.id,
        email=user.email,
        nome=user.nome_completo,          # populate_by_name=True
        role=role_override or user.role.value,
        secretaria_id=user.secretaria_id,
        is_active=user.is_active,
        must_change_password=user.first_login,  # populate_by_name=True
        created_at=user.created_at,
    )


def make_user_list(user) -> UserListResponse:
    """Constrói um UserListResponse com um único usuário."""
    return UserListResponse(
        items=[make_user_response(user)],
        total=1,
        page=1,
        limit=20,
    )


# ===========================================================================
# GET /api/users/
# ===========================================================================


async def test_list_users_as_admin(
    client: AsyncClient,
    admin_user,
    admin_token: str,
) -> None:
    """US-002: admin consegue listar usuários — 200 com itens e paginação."""
    expected = make_user_list(admin_user)

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        with patch(f"{USERS}.list_users", new_callable=AsyncMock, return_value=expected):
            response = await client.get(
                "/api/users/",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["page"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["email"] == admin_user.email


async def test_list_users_as_secretaria(
    client: AsyncClient,
    secretaria_user,
    secretaria_token: str,
) -> None:
    """US-002 RN-12: perfil 'secretaria' não pode listar usuários → 403."""
    app.dependency_overrides[get_current_user] = lambda: secretaria_user
    try:
        response = await client.get(
            "/api/users/",
            headers={"Authorization": f"Bearer {secretaria_token}"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403
    assert "acesso negado" in response.json()["detail"].lower()


# ===========================================================================
# POST /api/users/
# ===========================================================================


async def test_create_user_as_admin(
    client: AsyncClient,
    admin_user,
    admin_token: str,
) -> None:
    """US-002: admin cria usuário com sucesso — 201 com dados do novo usuário."""
    new_id = uuid.uuid4()
    created = UserResponse(
        id=new_id,
        email="novo.servidor@prefeitura.gov.br",
        nome="Novo Servidor",
        role="gabinete",
        secretaria_id=None,
        is_active=True,
        must_change_password=True,   # US-001 RN-5: first_login=True
        created_at=datetime.now(timezone.utc),
    )

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        with patch(f"{USERS}.create_user", new_callable=AsyncMock, return_value=created):
            response = await client.post(
                "/api/users/",
                json={
                    "email": "novo.servidor@prefeitura.gov.br",
                    "nome": "Novo Servidor",
                    "password": "Senha123",
                    "role": "gabinete",
                },
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "novo.servidor@prefeitura.gov.br"
    assert body["role"] == "gabinete"
    assert body["must_change_password"] is True   # US-001 RN-5


async def test_create_user_duplicate_email(
    client: AsyncClient,
    admin_user,
    admin_token: str,
) -> None:
    """US-002: e-mail duplicado retorna 409 Conflict."""
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        with patch(
            f"{USERS}.create_user",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=409, detail="E-mail já cadastrado."),
        ):
            response = await client.post(
                "/api/users/",
                json={
                    "email": "admin@prefeitura.gov.br",
                    "nome": "Duplicado",
                    "password": "Senha123",
                    "role": "gabinete",
                },
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 409
    assert "cadastrado" in response.json()["detail"].lower()


# ===========================================================================
# PUT /api/users/{user_id}/role
# ===========================================================================


async def test_update_role_as_admin(
    client: AsyncClient,
    admin_user,
    admin_token: str,
    secretaria_user,
) -> None:
    """US-002 RN-10: admin altera perfil de outro usuário com sucesso → 200."""
    updated = UserResponse(
        id=secretaria_user.id,
        email=secretaria_user.email,
        nome=secretaria_user.nome_completo,
        role="gabinete",               # perfil alterado
        secretaria_id=None,            # limpo para perfis transversais
        is_active=True,
        must_change_password=False,
        created_at=secretaria_user.created_at,
    )

    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        with patch(f"{USERS}.update_role", new_callable=AsyncMock, return_value=updated):
            response = await client.put(
                f"/api/users/{secretaria_user.id}/role",
                json={"role": "gabinete"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "gabinete"
    assert body["secretaria_id"] is None


async def test_admin_cannot_remove_own_admin(
    client: AsyncClient,
    admin_user,
    admin_token: str,
) -> None:
    """US-002 RN-9: admin não pode remover seu próprio perfil de administrador → 422."""
    app.dependency_overrides[get_current_user] = lambda: admin_user
    try:
        with patch(
            f"{USERS}.update_role",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=422,
                detail="Não é possível remover seu próprio perfil de administrador.",
            ),
        ):
            response = await client.put(
                f"/api/users/{admin_user.id}/role",
                json={"role": "secretaria"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 422
    assert "administrador" in response.json()["detail"].lower()


# ===========================================================================
# require_role — bloqueio de perfil não autorizado
# ===========================================================================


async def test_require_role_blocks_unauthorized(
    client: AsyncClient,
    secretaria_user,
    secretaria_token: str,
) -> None:
    """US-002 RN-12: require_role bloqueia perfil sem permissão — 403 em rota admin."""
    # Nenhum override de user_service necessário: o require_role rejeita antes
    app.dependency_overrides[get_current_user] = lambda: secretaria_user
    try:
        # POST /api/users/ requer perfil admin — secretaria deve ser bloqueada
        response = await client.post(
            "/api/users/",
            json={
                "email": "qualquer@prefeitura.gov.br",
                "nome": "Qualquer",
                "password": "Senha123",
                "role": "gabinete",
            },
            headers={"Authorization": f"Bearer {secretaria_token}"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403
    # Mensagem do require_role: "Acesso negado. Perfil necessário: admin"
    assert "acesso negado" in response.json()["detail"].lower()
