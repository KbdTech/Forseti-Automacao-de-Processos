"""Schemas Pydantic v2 para autenticação — US-001.

Segue a especificação do CLAUDE.md seção 9:
  POST /api/auth/login   → response: { token, refresh_token, user }
  POST /api/auth/refresh → response: { token }

Nomes de campos seguem a spec da API:
  token        (não access_token)
  refresh_token
  user         (UserResponse — com nome e must_change_password)
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.user import UserResponse


# ---------------------------------------------------------------------------
# Schemas de entrada (request)
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    """Payload do POST /api/auth/login.

    US-001 RN-4: password validado aqui e no front-end (mín. 8 chars).
    """

    model_config = ConfigDict(from_attributes=True)

    email: Annotated[
        EmailStr,
        Field(
            description="E-mail institucional do servidor.",
            json_schema_extra={"example": "usuario@prefeitura.gov.br"},
        ),
    ]
    password: Annotated[
        str,
        Field(
            min_length=8,
            description="Senha do usuário (mínimo 8 caracteres).",
            json_schema_extra={"example": "Senha123"},
        ),
    ]


class RefreshRequest(BaseModel):
    """Payload do POST /api/auth/refresh.

    US-001 Cenário 6: enviado pelo interceptor Axios automaticamente.
    """

    model_config = ConfigDict(from_attributes=True)

    refresh_token: Annotated[
        str,
        Field(description="JWT de refresh recebido no login (validade 24h)."),
    ]


class ChangePasswordPayload(BaseModel):
    """Payload do POST /api/auth/change-password.

    US-001 RN-4: nova senha mínimo 8 chars, letras e números.
    US-001 RN-5: obrigatório no primeiro acesso (must_change_password = true).
    """

    model_config = ConfigDict(from_attributes=True)

    old_password: Annotated[
        str,
        Field(description="Senha atual do usuário (provisória no primeiro acesso)."),
    ]
    new_password: Annotated[
        str,
        Field(
            min_length=8,
            description="Nova senha (mínimo 8 caracteres, deve conter letras e números).",
            json_schema_extra={"example": "NovaSenha456"},
        ),
    ]
    confirm_password: Annotated[
        str,
        Field(description="Confirmação da nova senha (deve ser idêntica a new_password)."),
    ]

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """US-001 RN-4: mínimo 8 chars, ao menos 1 letra e 1 número."""
        if not any(c.isalpha() for c in v):
            raise ValueError("A nova senha deve conter ao menos uma letra.")
        if not any(c.isdigit() for c in v):
            raise ValueError("A nova senha deve conter ao menos um número.")
        return v

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("A confirmação de senha não confere.")
        return v


# ---------------------------------------------------------------------------
# Schemas de saída (response)
# ---------------------------------------------------------------------------


class TokenResponse(BaseModel):
    """Resposta de sucesso do POST /api/auth/login.

    US-001 RN-2: token expira em 8 horas (jornada de trabalho).
    US-001 RN-3: refresh_token expira em 24 horas.
    US-001 RN-8: user contém id, nome, role e secretaria_id.
    """

    model_config = ConfigDict(from_attributes=True)

    token: Annotated[
        str,
        Field(description="JWT de acesso (válido por 8h). Enviar como Bearer no header Authorization."),
    ]
    refresh_token: Annotated[
        str,
        Field(description="JWT de refresh (válido por 24h). Usar em POST /api/auth/refresh."),
    ]
    user: Annotated[
        UserResponse,
        Field(description="Dados do usuário autenticado (sem password_hash)."),
    ]


class RefreshTokenResponse(BaseModel):
    """Resposta do POST /api/auth/refresh.

    US-001 Cenário 6: retorna apenas o novo token de acesso.
    """

    model_config = ConfigDict(from_attributes=True)

    token: Annotated[
        str,
        Field(description="Novo JWT de acesso (válido por 8h)."),
    ]
