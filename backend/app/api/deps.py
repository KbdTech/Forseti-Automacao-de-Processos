"""Dependencies de autenticação e autorização — US-001 e US-002.

Fornece:
  - get_current_user: extrai e valida o Bearer token, retorna o User do banco.
  - require_role: factory que cria uma dependency restrita a perfis específicos.

US-001 RN-8: token JWT contém sub (user_id), role, secretaria_id.
US-002 RN-12: back-end valida o perfil em CADA requisição via get_current_user.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import RoleEnum, User

# Define o esquema OAuth2 com o endpoint de login como tokenUrl
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_client_ip(request: Request) -> str | None:
    """Extrai o IP real do cliente considerando proxies reversos.

    US-001 RN-6: registrar IP em audit_logs.
    Verifica X-Forwarded-For primeiro (load balancer/proxy), depois request.client.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Extrai o Bearer token, valida o JWT e retorna o User autenticado.

    US-001 RN-8: lê sub (user_id), role e secretaria_id do payload.
    US-002 RN-12: validação ocorre em TODA requisição protegida.

    Raises:
        HTTPException 401: token inválido, expirado ou usuário não encontrado.
        HTTPException 401: conta desativada (is_active = False).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não autenticado. Faça login para continuar.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)  # lança 401 se inválido/expirado

    if payload.get("type") != "access":
        raise credentials_exception

    user_id_str: str | None = payload.get("sub")
    if not user_id_str:
        raise credentials_exception

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user: User | None = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Conta desativada. Entre em contato com o administrador.",
        )

    return user


def require_role(*roles: RoleEnum):
    """Factory de dependency que restringe acesso por perfil.

    US-002 RN-12: validação de role em cada requisição no back-end.

    Uso:
        @router.get("/admin-only")
        async def admin_route(user: User = Depends(require_role(RoleEnum.admin))):
            ...

    Raises:
        HTTPException 403: usuário autenticado mas sem o perfil exigido.
    """

    async def _check_role(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role not in roles:
            roles_str = ", ".join(r.value for r in roles)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso negado. Perfil necessário: {roles_str}",
            )
        return current_user

    return _check_role
