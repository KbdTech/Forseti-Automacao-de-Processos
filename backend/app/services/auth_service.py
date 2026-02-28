"""Service de autenticação — lógica de negócio da US-001.

Responsabilidades:
  - Validar credenciais com bcrypt
  - Aplicar bloqueio por tentativas (US-001 RN-1)
  - Gerar access + refresh tokens JWT (US-001 RN-2, RN-3)
  - Registrar eventos em audit_logs (US-001 RN-6)
  - Troca de senha no primeiro acesso (US-001 RN-5)
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.auth import ChangePasswordPayload, RefreshTokenResponse, TokenResponse
from app.schemas.user import UserResponse


# ---------------------------------------------------------------------------
# Helpers internos (module-level privados)
# ---------------------------------------------------------------------------


async def _get_user_by_email(email: str, db: AsyncSession) -> Optional[User]:
    """Busca usuário por e-mail (case-insensitive) — retorna None se não encontrado."""
    result = await db.execute(
        select(User).where(func.lower(User.email) == email.lower())
    )
    return result.scalar_one_or_none()


async def _get_user_by_id(user_id: UUID, db: AsyncSession) -> Optional[User]:
    """Busca usuário por UUID — retorna None se não encontrado."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def _register_audit(
    db: AsyncSession,
    action: str,
    user_id: Optional[UUID] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """Insere um registro append-only em audit_logs.

    US-001 RN-6: toda tentativa de login deve ser registrada.
    CRÍTICO: nunca chamar UPDATE ou DELETE nesta tabela.
    """
    log = AuditLog(
        user_id=user_id,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log)
    await db.flush()  # persiste dentro da transação atual sem commit


def _build_token_payload(user: User) -> dict:
    """Monta o payload base que vai dentro do JWT.

    US-001 RN-8: token contém sub (user_id), role e secretaria_id.
    """
    return {
        "sub": str(user.id),
        "role": user.role.value,
        "secretaria_id": str(user.secretaria_id) if user.secretaria_id else None,
    }


def _build_token_response(user: User) -> TokenResponse:
    """Gera access + refresh tokens e monta o TokenResponse completo."""
    payload = _build_token_payload(user)
    return TokenResponse(
        token=create_access_token(payload),
        refresh_token=create_refresh_token(payload),
        user=UserResponse.model_validate(user),
    )


# ---------------------------------------------------------------------------
# AuthService — classe principal
# ---------------------------------------------------------------------------


class AuthService:
    """Encapsula toda a lógica de autenticação e autorização da US-001."""

    async def authenticate(
        self,
        db: AsyncSession,
        email: str,
        password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> TokenResponse:
        """Autentica um usuário com e-mail e senha.

        Fluxo:
          1. Localiza o usuário pelo e-mail (case-insensitive)
          2. Verifica se conta está ativa — HTTP 403 se inativa
          3. Verifica se conta está bloqueada (US-001 RN-1)
          4. Verifica a senha com bcrypt
          5. Em falha: incrementa contador; bloqueia após MAX_LOGIN_ATTEMPTS
          6. Em sucesso: zera contador, gera tokens, registra login_success

        Returns:
            TokenResponse com access_token, refresh_token e dados do usuário.

        Raises:
            HTTPException 401: credenciais inválidas (e-mail não encontrado ou senha errada).
            HTTPException 403: conta desativada.
            HTTPException 423: conta bloqueada temporariamente.
        """
        user = await _get_user_by_email(email, db)

        # --- E-mail não encontrado: registra audit sem user_id (US-001 RN-6) ---
        if user is None:
            await _register_audit(
                db,
                "login_failed_unknown_email",
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="E-mail ou senha incorretos.",
            )

        # --- Conta desativada — HTTP 403 (e-mail válido mas conta inativa) ---
        if not user.is_active:
            await _register_audit(
                db,
                "login_failed_inactive_account",
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Conta desativada. Contate o administrador.",
            )

        # --- US-001 RN-1: verifica se conta está bloqueada ---
        now = datetime.now(timezone.utc)
        if user.locked_until is not None:
            locked_until = user.locked_until
            # Garante que locked_until seja timezone-aware
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > now:
                remaining = int((locked_until - now).total_seconds() / 60) + 1
                await _register_audit(
                    db,
                    "login_failed_wrong_password",
                    user_id=user.id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
                await db.commit()
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail=f"Conta bloqueada temporariamente. Tente novamente em {remaining} minuto(s).",
                )
            else:
                # Bloqueio expirou — zera contadores
                user.locked_until = None
                user.login_attempts = 0

        # --- Verifica senha ---
        if not verify_password(password, user.password_hash):
            user.login_attempts += 1

            if user.login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
                # US-001 RN-1: bloqueia por LOCKOUT_DURATION_MINUTES
                user.locked_until = now + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
                await _register_audit(
                    db,
                    "login_failed_wrong_password",
                    user_id=user.id,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
                await db.commit()
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail=f"Conta bloqueada temporariamente. Tente novamente em {settings.LOCKOUT_DURATION_MINUTES} minutos.",
                )

            await _register_audit(
                db,
                "login_failed_wrong_password",
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            await db.commit()
            # US-001 RN: mensagem genérica — não revela tentativas restantes
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="E-mail ou senha incorretos.",
            )

        # --- Login bem-sucedido ---
        user.login_attempts = 0
        user.locked_until = None
        user.updated_at = now

        await _register_audit(
            db,
            "login_success",
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await db.commit()
        await db.refresh(user)

        return _build_token_response(user)

    async def refresh_token(
        self, db: AsyncSession, refresh_token_str: str
    ) -> RefreshTokenResponse:
        """Gera novo access_token a partir de um refresh_token válido.

        US-001 RN-3: refresh token tem validade de 24h.
        Retorna apenas RefreshTokenResponse(token=...) — não o TokenResponse completo.

        Raises:
            HTTPException 401: token inválido, expirado ou do tipo errado.
        """
        payload = decode_token(refresh_token_str)

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido. Utilize o refresh_token correto.",
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido.",
            )

        user = await _get_user_by_id(UUID(user_id), db)
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuário não encontrado ou conta desativada.",
            )

        token_payload = _build_token_payload(user)
        return RefreshTokenResponse(token=create_access_token(token_payload))

    async def get_current_user(self, db: AsyncSession, token: str) -> User:
        """Decodifica o access_token e retorna o usuário autenticado.

        Nota: deps.py mantém implementação independente via oauth2_scheme do FastAPI.
        Este método está disponível para uso direto em serviços internos.

        Raises:
            HTTPException 401: token inválido, expirado ou usuário inativo.
        """
        payload = decode_token(token)

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token de acesso inválido.",
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido.",
            )

        user = await _get_user_by_id(UUID(user_id), db)
        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuário não encontrado ou conta desativada.",
            )

        return user

    async def logout(
        self,
        db: AsyncSession,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict:
        """Registra o logout do usuário em audit_logs.

        US-001 Cenário 7: evento LOGOUT deve ser registrado.
        Invalidação do token é responsabilidade do cliente (remove do authStore).

        Returns:
            Mensagem de confirmação.
        """
        await _register_audit(
            db, "LOGOUT", user_id=user.id, ip_address=ip_address, user_agent=user_agent
        )
        await db.commit()
        return {"detail": "Logout realizado com sucesso."}

    async def change_password(
        self,
        db: AsyncSession,
        user: User,
        payload: ChangePasswordPayload,
    ) -> dict:
        """Altera a senha do usuário autenticado.

        US-001 RN-5: primeiro acesso exige troca de senha (first_login = True).
        US-001 RN-4: nova senha deve ter mínimo 8 chars, letras e números
                     (validado no schema ChangePasswordPayload).

        Raises:
            HTTPException 400: senha atual incorreta.
        """
        if not verify_password(payload.old_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Senha atual incorreta.",
            )

        user.password_hash = hash_password(payload.new_password)
        user.first_login = False  # US-001 RN-5: marca que o primeiro acesso foi concluído
        user.updated_at = datetime.now(timezone.utc)

        await _register_audit(db, "PASSWORD_CHANGED", user_id=user.id)
        await db.commit()
        return {"detail": "Senha alterada com sucesso."}


# ---------------------------------------------------------------------------
# Singleton — instância única para uso nos routers
# ---------------------------------------------------------------------------

auth_service = AuthService()
