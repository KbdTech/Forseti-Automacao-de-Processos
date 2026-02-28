"""Schemas Pydantic v2 comuns — reutilizados em múltiplos módulos.

Inclui respostas genéricas de erro/sucesso e parâmetros de paginação
padrão (US-004 RN-24: 20 registros por página).
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    """Resposta de erro padrão (HTTP 4xx/5xx).

    Compatível com o formato nativo de erros do FastAPI: { "detail": "..." }.
    """

    model_config = ConfigDict(from_attributes=True)

    detail: Annotated[
        str,
        Field(
            description="Mensagem de erro legível pelo usuário.",
            json_schema_extra={"example": "Recurso não encontrado."},
        ),
    ]
    code: Annotated[
        str | None,
        Field(
            default=None,
            description="Código de erro interno opcional para tratamento no front-end.",
            json_schema_extra={"example": "USER_NOT_FOUND"},
        ),
    ]


class MessageResponse(BaseModel):
    """Resposta de confirmação genérica para operações sem corpo de retorno."""

    model_config = ConfigDict(from_attributes=True)

    message: Annotated[
        str,
        Field(
            description="Mensagem de confirmação da operação.",
            json_schema_extra={"example": "Operação realizada com sucesso."},
        ),
    ]


class PaginationParams(BaseModel):
    """Parâmetros de paginação reutilizáveis via query string.

    US-004 RN-24: paginação padrão de 20 registros por página.
    Uso em FastAPI: Annotated[PaginationParams, Query()]
    """

    model_config = ConfigDict(from_attributes=True)

    page: Annotated[
        int,
        Field(
            default=1,
            ge=1,
            description="Número da página (1-based).",
            json_schema_extra={"example": 1},
        ),
    ]
    limit: Annotated[
        int,
        Field(
            default=20,
            ge=1,
            le=100,
            description="Registros por página (máx. 100, padrão 20).",
            json_schema_extra={"example": 20},
        ),
    ]
