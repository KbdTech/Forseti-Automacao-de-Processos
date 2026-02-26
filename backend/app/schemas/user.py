"""Schemas Pydantic v2 para o recurso User — US-001 e US-002.

Mapeamento de nomes ORM → API:
  nome_completo (DB) → nome              (API)  via validation_alias
  first_login   (DB) → must_change_password (API)  via validation_alias

RoleLiteral é o único source-of-truth dos perfis no nível de schema.
Sincronizado com RoleEnum em app/models/user.py.
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Tipo auxiliar: perfis disponíveis — sincronizado com RoleEnum do banco
# ---------------------------------------------------------------------------

RoleLiteral = Literal[
    "secretaria",
    "gabinete",
    "controladoria",
    "contabilidade",
    "tesouraria",
    "admin",
]


# ---------------------------------------------------------------------------
# UserResponse
# ---------------------------------------------------------------------------


class UserResponse(BaseModel):
    """Representação pública do usuário retornada pela API.

    Nunca expõe password_hash nem campos sensíveis.

    Usa validation_alias para desacoplar nomes do ORM dos nomes da API:
      - nome_completo  (ORM) → nome               (JSON response)
      - first_login    (ORM) → must_change_password (JSON response)

    populate_by_name=True permite instanciar passando nome= ou must_change_password=
    diretamente (útil em testes unitários).
    """

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: Annotated[
        uuid.UUID,
        Field(
            description="Identificador único (UUID v4).",
            json_schema_extra={"example": "550e8400-e29b-41d4-a716-446655440000"},
        ),
    ]
    email: Annotated[
        str,
        Field(
            description="E-mail institucional do servidor.",
            json_schema_extra={"example": "servidor@prefeitura.gov.br"},
        ),
    ]
    nome: Annotated[
        str,
        Field(
            validation_alias="nome_completo",
            description="Nome completo do servidor municipal.",
            json_schema_extra={"example": "João da Silva"},
        ),
    ]
    role: Annotated[
        str,
        Field(
            description="Perfil de acesso ativo do usuário.",
            json_schema_extra={"example": "secretaria"},
        ),
    ]
    secretaria_id: Annotated[
        uuid.UUID | None,
        Field(
            description="UUID da secretaria (null para perfis transversais: admin, gabinete, etc.).",
            json_schema_extra={"example": None},
        ),
    ]
    is_active: Annotated[
        bool,
        Field(
            description="Indica se a conta está ativa no sistema.",
            json_schema_extra={"example": True},
        ),
    ]
    must_change_password: Annotated[
        bool,
        Field(
            validation_alias="first_login",
            description="TRUE indica que o usuário deve trocar a senha no próximo acesso (US-001 RN-5).",
            json_schema_extra={"example": False},
        ),
    ]
    created_at: Annotated[
        datetime,
        Field(description="Data e hora de criação da conta (UTC ISO 8601)."),
    ]


# ---------------------------------------------------------------------------
# UserCreate
# ---------------------------------------------------------------------------


class UserCreate(BaseModel):
    """Payload para criação de um novo usuário — exclusivo para admin (US-002).

    US-001 RN-4: senha mínimo 8 chars, letras e números.
    US-002 RN-7: secretaria_id é obrigatório quando role='secretaria'.
    """

    model_config = ConfigDict(from_attributes=True)

    email: Annotated[
        EmailStr,
        Field(
            description="E-mail institucional único do novo usuário.",
            json_schema_extra={"example": "novo.servidor@prefeitura.gov.br"},
        ),
    ]
    nome: Annotated[
        str,
        Field(
            min_length=2,
            max_length=255,
            description="Nome completo do servidor (mín. 2 caracteres).",
            json_schema_extra={"example": "Maria Oliveira Santos"},
        ),
    ]
    password: Annotated[
        str,
        Field(
            min_length=8,
            description="Senha inicial (mín. 8 caracteres, deve conter letras e números).",
            json_schema_extra={"example": "Senha123"},
        ),
    ]
    role: Annotated[
        RoleLiteral,
        Field(
            description="Perfil de acesso do usuário.",
            json_schema_extra={"example": "secretaria"},
        ),
    ]
    secretaria_id: Annotated[
        uuid.UUID | None,
        Field(
            default=None,
            description="UUID da secretaria vinculada. Obrigatório quando role='secretaria'.",
            json_schema_extra={"example": None},
        ),
    ]

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """US-001 RN-4: senha deve conter ao menos uma letra e um número."""
        if not any(c.isalpha() for c in v):
            raise ValueError("A senha deve conter ao menos uma letra.")
        if not any(c.isdigit() for c in v):
            raise ValueError("A senha deve conter ao menos um número.")
        return v

    @model_validator(mode="after")
    def validate_secretaria_required_for_role(self) -> "UserCreate":
        """US-002 RN-7: secretaria_id obrigatório para perfil 'secretaria'."""
        if self.role == "secretaria" and self.secretaria_id is None:
            raise ValueError(
                "secretaria_id é obrigatório para o perfil 'secretaria'."
            )
        return self


# ---------------------------------------------------------------------------
# UserUpdate
# ---------------------------------------------------------------------------


class UserUpdate(BaseModel):
    """Payload para atualização parcial de usuário (todos os campos opcionais).

    Usado em PUT /api/users/:id — admin only (US-002).
    Apenas os campos informados são atualizados (PATCH semântico).
    """

    model_config = ConfigDict(from_attributes=True)

    nome: Annotated[
        str | None,
        Field(
            default=None,
            min_length=2,
            max_length=255,
            description="Nome completo atualizado.",
            json_schema_extra={"example": "João da Silva Atualizado"},
        ),
    ]
    email: Annotated[
        EmailStr | None,
        Field(
            default=None,
            description="Novo e-mail institucional (deve ser único).",
            json_schema_extra={"example": "joao.novo@prefeitura.gov.br"},
        ),
    ]
    is_active: Annotated[
        bool | None,
        Field(
            default=None,
            description="Ativar (true) ou desativar (false) a conta.",
            json_schema_extra={"example": True},
        ),
    ]
    secretaria_id: Annotated[
        uuid.UUID | None,
        Field(
            default=None,
            description="UUID da nova secretaria vinculada ao servidor.",
            json_schema_extra={"example": None},
        ),
    ]


# ---------------------------------------------------------------------------
# UserRoleUpdate
# ---------------------------------------------------------------------------


class UserRoleUpdate(BaseModel):
    """Payload para alteração de perfil — admin only (US-002).

    US-002 RN-10: alterações de perfil registradas em role_change_log.
    US-002 RN-8: um usuário possui somente um perfil ativo por vez.
    """

    model_config = ConfigDict(from_attributes=True)

    role: Annotated[
        RoleLiteral,
        Field(
            description="Novo perfil de acesso do usuário.",
            json_schema_extra={"example": "gabinete"},
        ),
    ]


# ---------------------------------------------------------------------------
# UserListResponse
# ---------------------------------------------------------------------------


class UserListResponse(BaseModel):
    """Resposta paginada da listagem de usuários.

    US-004 RN-24: paginação padrão de 20 registros por página.
    """

    model_config = ConfigDict(from_attributes=True)

    items: Annotated[
        list[UserResponse],
        Field(description="Usuários da página atual."),
    ]
    total: Annotated[
        int,
        Field(
            description="Total de registros correspondentes aos filtros aplicados.",
            json_schema_extra={"example": 42},
        ),
    ]
    page: Annotated[
        int,
        Field(
            description="Página atual (1-based).",
            json_schema_extra={"example": 1},
        ),
    ]
    limit: Annotated[
        int,
        Field(
            description="Registros por página.",
            json_schema_extra={"example": 20},
        ),
    ]
