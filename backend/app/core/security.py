from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    """Gera o hash bcrypt de uma senha em texto plano.

    Args:
        password: senha em texto plano fornecida pelo usuário.

    Returns:
        Hash bcrypt da senha pronto para armazenamento no banco.
    """
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica se uma senha em texto plano corresponde ao hash armazenado.

    Args:
        plain: senha em texto plano fornecida no login.
        hashed: hash bcrypt armazenado no banco de dados.

    Returns:
        True se a senha corresponder ao hash, False caso contrário.
    """
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict) -> str:
    """Gera um JWT de acesso com expiração definida em JWT_EXPIRATION_HOURS.

    Args:
        data: payload a ser codificado no token (ex.: {"sub": user_id, "role": role}).

    Returns:
        Token JWT assinado como string.
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
    payload.update({"exp": expire, "type": "access"})
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Gera um JWT de refresh com expiração definida em JWT_REFRESH_EXPIRATION_HOURS.

    Args:
        data: payload a ser codificado no token (ex.: {"sub": user_id}).

    Returns:
        Token JWT de refresh assinado como string.
    """
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_REFRESH_EXPIRATION_HOURS)
    payload.update({"exp": expire, "type": "refresh"})
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decodifica e valida um JWT, retornando o payload.

    Args:
        token: token JWT a ser decodificado e validado.

    Returns:
        Payload decodificado do token.

    Raises:
        HTTPException 401: se o token for inválido, expirado ou malformado.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
