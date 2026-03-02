"""Model SQLAlchemy para documentos anexados a Fornecedores.

Tabela: fornecedor_documentos

S12.2: cada fornecedor pode ter N documentos (contratos, certidões, etc.)
       armazenados no Supabase Storage (bucket privado 'fornecedor-documentos').

Regras de integridade:
  - CHK tipo_mime: application/pdf, image/jpeg, image/png
  - CHK tamanho_bytes: 1 byte ≤ tamanho ≤ 20 MB (20_971_520 bytes)
  - FK fornecedor_id ON DELETE CASCADE: remove docs ao remover fornecedor
  - FK uploaded_by ON DELETE RESTRICT: usuário não pode ser removido com docs
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.fornecedor import Fornecedor
    from app.models.user import User


class FornecedorDocumento(Base):
    """Documento de suporte de um fornecedor (contrato, certidões, etc.).

    Armazena metadados; conteúdo no Supabase Storage (bucket fornecedor-documentos).
    storage_path NUNCA é exposto diretamente — sempre via URL assinada.
    """

    __tablename__ = "fornecedor_documentos"

    # ------------------------------------------------------------------
    # Identificação
    # ------------------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
        comment="Identificador único (UUID v4)",
    )

    # ------------------------------------------------------------------
    # Chaves estrangeiras
    # ------------------------------------------------------------------

    fornecedor_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(
            "fornecedores.id",
            ondelete="CASCADE",
            name="fk_fornecedor_documentos_fornecedor_id",
        ),
        nullable=False,
        comment="FK para o fornecedor dono deste documento — CASCADE DELETE",
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            name="fk_fornecedor_documentos_uploaded_by",
        ),
        nullable=False,
        comment="FK para o usuário que realizou o upload",
    )

    # ------------------------------------------------------------------
    # Metadados do arquivo
    # ------------------------------------------------------------------

    nome_arquivo: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nome original do arquivo",
    )
    tipo_mime: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="MIME type — application/pdf | image/jpeg | image/png",
    )
    tamanho_bytes: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="Tamanho em bytes — máximo 20 MB",
    )
    descricao: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Descrição informada pelo usuário no upload",
    )

    # ------------------------------------------------------------------
    # Localização no Supabase Storage
    # NUNCA expor diretamente — sempre URL assinada.
    # ------------------------------------------------------------------

    storage_path: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Path no bucket fornecedor-documentos. "
            "Formato: fornecedores/{fornecedor_id}/{timestamp}_{nome_sanitizado}. "
            "NUNCA exposto na API."
        ),
    )

    # ------------------------------------------------------------------
    # Timestamp — append-only
    # ------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp do upload (TIMESTAMPTZ)",
    )

    # ------------------------------------------------------------------
    # Relacionamentos
    # ------------------------------------------------------------------

    fornecedor: Mapped["Fornecedor"] = relationship(
        "Fornecedor",
        back_populates="documentos",
        lazy="noload",
        foreign_keys=[fornecedor_id],
    )
    uploader: Mapped["User"] = relationship(
        "User",
        lazy="noload",
        foreign_keys=[uploaded_by],
    )

    # ------------------------------------------------------------------
    # Constraints e índices
    # ------------------------------------------------------------------

    __table_args__ = (
        Index("idx_fornecedor_documentos_fornecedor_id", "fornecedor_id"),
        Index("idx_fornecedor_documentos_uploaded_by", "uploaded_by"),
        Index("idx_fornecedor_documentos_created_at", "created_at"),
        CheckConstraint(
            "tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png')",
            name="chk_fornecedor_documentos_tipo_mime",
        ),
        CheckConstraint(
            "tamanho_bytes > 0 AND tamanho_bytes <= 20971520",
            name="chk_fornecedor_documentos_tamanho_bytes",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<FornecedorDocumento id={self.id} "
            f"fornecedor_id={self.fornecedor_id} "
            f"nome={self.nome_arquivo!r}>"
        )
