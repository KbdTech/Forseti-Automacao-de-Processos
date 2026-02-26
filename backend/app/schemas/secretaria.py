"""Schemas Pydantic v2 para o recurso Secretaria — US-013.

Mapeamento de uso:
  SecretariaResponse → resposta padrão de uma secretaria (GET / POST / PUT)
  SecretariaCreate   → POST /api/secretarias
  SecretariaUpdate   → PUT  /api/secretarias/:id (PATCH semântico — todos opcionais)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ===========================================================================
# Schema de SAÍDA (response)
# ===========================================================================


class SecretariaResponse(BaseModel):
    """Representação completa de uma secretaria municipal.

    Retornada em criação, listagem e detalhe.
    US-013 RN-66: secretaria desativada mantém histórico (ativo=False).
    """

    model_config = ConfigDict(from_attributes=True)

    id: Annotated[uuid.UUID, Field(description="UUID da secretaria.")]
    nome: Annotated[str, Field(description="Nome completo da secretaria.")]
    sigla: Annotated[
        str,
        Field(description="Sigla da secretaria (máx. 5 caracteres, sempre maiúsculas)."),
    ]
    orcamento_anual: Annotated[
        Decimal | None,
        Field(default=None, description="Orçamento anual em R$."),
    ]
    ativo: Annotated[
        bool,
        Field(description="True = ativa (recebe ordens), False = desativada (US-013 RN-66)."),
    ]
    created_at: Annotated[datetime, Field(description="Timestamp de criação.")]


# ===========================================================================
# Schemas de ENTRADA (request)
# ===========================================================================


class SecretariaCreate(BaseModel):
    """Payload para criação de secretaria — POST /api/secretarias.

    US-013 RN-65: nome e sigla devem ser únicos no sistema.
    """

    model_config = ConfigDict(from_attributes=True)

    nome: Annotated[
        str,
        Field(
            min_length=2,
            max_length=255,
            description="Nome completo da secretaria — único no sistema (US-013 RN-65).",
        ),
    ]
    sigla: Annotated[
        str,
        Field(
            min_length=2,
            max_length=5,
            description=(
                "Sigla da secretaria (2 a 5 caracteres, convertida para MAIÚSCULAS). "
                "Deve ser única no sistema (US-013 RN-65)."
            ),
        ),
    ]
    orcamento_anual: Annotated[
        Decimal | None,
        Field(
            default=None,
            gt=0,
            description="Orçamento anual em R$ — deve ser positivo quando informado.",
            json_schema_extra={"example": "500000.00"},
        ),
    ]

    @field_validator("sigla")
    @classmethod
    def sigla_deve_ser_maiuscula(cls, v: str) -> str:
        """US-013: sigla sempre armazenada em MAIÚSCULAS após strip."""
        return v.strip().upper()


class SecretariaUpdate(BaseModel):
    """Payload para atualização de secretaria — PUT /api/secretarias/:id.

    Todos os campos são opcionais (PATCH semântico).
    US-013 RN-68: não é possível excluir — apenas desativar via PATCH /status.
    US-013 RN-65: nome e sigla continuam devendo ser únicos se alterados.
    """

    model_config = ConfigDict(from_attributes=True)

    nome: Annotated[
        str | None,
        Field(
            default=None,
            min_length=2,
            max_length=255,
            description="Novo nome completo da secretaria.",
        ),
    ]
    sigla: Annotated[
        str | None,
        Field(
            default=None,
            min_length=2,
            max_length=5,
            description="Nova sigla (convertida para MAIÚSCULAS).",
        ),
    ]
    orcamento_anual: Annotated[
        Decimal | None,
        Field(
            default=None,
            gt=0,
            description="Novo orçamento anual em R$ — deve ser positivo.",
            json_schema_extra={"example": "750000.00"},
        ),
    ]

    @field_validator("sigla")
    @classmethod
    def sigla_deve_ser_maiuscula(cls, v: str | None) -> str | None:
        """Converte sigla para MAIÚSCULAS quando fornecida."""
        return v.strip().upper() if v is not None else None
