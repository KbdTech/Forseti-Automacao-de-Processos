"""Schemas Pydantic para documentos anexados às ordens — US-015.

Importante: DocumentoResponse NÃO expõe o campo storage_path.
O acesso ao arquivo é feito exclusivamente via URL assinada (endpoint /download-url).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DocumentoResponse(BaseModel):
    """Representação pública de um documento anexado a uma ordem.

    US-015: storage_path NUNCA incluído — acesso somente via /download-url.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ordem_id: uuid.UUID
    uploaded_by: uuid.UUID
    nome_arquivo: str
    tipo_mime: str
    tamanho_bytes: int
    descricao: str | None
    hash_sha256: str
    assinado_govbr: bool
    versao: int
    created_at: datetime


class DocumentoListResponse(BaseModel):
    """Resposta de listagem de documentos de uma ordem."""

    documentos: list[DocumentoResponse]
    total: int = Field(description="Total de documentos na ordem")


class DownloadUrlResponse(BaseModel):
    """URL assinada para download seguro do arquivo.

    US-015: TTL configurável via SIGNED_URL_TTL_SECONDS (padrão: 900s / 15 min).
    """

    signed_url: str = Field(description="URL temporária para download do arquivo")
    expires_in: int = Field(description="Tempo de expiração da URL em segundos")
