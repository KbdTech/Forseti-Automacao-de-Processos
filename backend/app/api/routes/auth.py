"""Router de autenticação — US-001.

Endpoints:
  POST /api/auth/login          — Login com e-mail e senha
  POST /api/auth/refresh        — Renovar access_token via refresh_token
  POST /api/auth/logout         — Invalidar sessão (append-only em audit_logs)
  GET  /api/auth/me             — Dados do usuário autenticado
  POST /api/auth/change-password — Troca de senha (obrigatório no first_login)
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordPayload,
    LoginRequest,
    RefreshRequest,
    RefreshTokenResponse,
    TokenResponse,
)
from app.schemas.user import UserResponse
from app.services.auth_service import auth_service

router = APIRouter(prefix="/api/auth", tags=["Autenticação"])


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=200,
    responses={
        401: {"description": "E-mail ou senha incorretos"},
        403: {"description": "Conta desativada"},
        423: {"description": "Conta bloqueada temporariamente (máx. 5 tentativas)"},
    },
)
async def login(
    payload: LoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    client_ip: Annotated[str | None, Depends(get_client_ip)],
) -> TokenResponse:
    """Autentica o usuário e retorna access_token + refresh_token.

    US-001 Cenário 1: login com credenciais válidas.
    US-001 Cenário 2: credenciais inválidas incrementam contador.
    US-001 Cenário 3: bloqueio após 5 tentativas por 15 minutos.
    US-001 RN-6: toda tentativa registrada em audit_logs.
    """
    user_agent = request.headers.get("user-agent")
    return await auth_service.authenticate(
        email=payload.email,
        password=payload.password,
        db=db,
        ip_address=client_ip,
        user_agent=user_agent,
    )


# ---------------------------------------------------------------------------
# POST /api/auth/refresh
# ---------------------------------------------------------------------------


@router.post("/refresh", response_model=RefreshTokenResponse, status_code=200)
async def refresh(
    payload: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RefreshTokenResponse:
    """Renova o access_token usando um refresh_token válido.

    US-001 Cenário 6: interceptor Axios chama este endpoint automaticamente.
    US-001 RN-3: refresh_token tem validade de 24h.
    """
    return await auth_service.refresh_token(
        refresh_token_str=payload.refresh_token,
        db=db,
    )


# ---------------------------------------------------------------------------
# POST /api/auth/logout
# ---------------------------------------------------------------------------


@router.post("/logout", status_code=200)
async def logout(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    client_ip: Annotated[str | None, Depends(get_client_ip)],
) -> dict:
    """Registra o logout em audit_logs e confirma ao cliente.

    US-001 Cenário 7: evento LOGOUT registrado.
    A invalidação do token é responsabilidade do cliente (authStore).
    """
    user_agent = request.headers.get("user-agent")
    return await auth_service.logout(
        user=current_user,
        db=db,
        ip_address=client_ip,
        user_agent=user_agent,
    )


# ---------------------------------------------------------------------------
# GET /api/auth/me
# ---------------------------------------------------------------------------


@router.get("/me", response_model=UserResponse, status_code=200)
async def me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Retorna os dados do usuário autenticado.

    US-001: base para o front-end popular o authStore após reload de página.
    """
    return current_user


# ---------------------------------------------------------------------------
# POST /api/auth/change-password
# ---------------------------------------------------------------------------


@router.post("/change-password", status_code=200)
async def change_password(
    payload: ChangePasswordPayload,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Altera a senha do usuário autenticado.

    US-001 RN-5: obrigatório no primeiro acesso (first_login = True).
    US-001 RN-4: nova senha validada no schema (min 8 chars, letras + números).
    """
    return await auth_service.change_password(
        user=current_user,
        payload=payload,
        db=db,
    )
