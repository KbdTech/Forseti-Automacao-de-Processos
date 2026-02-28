"""Model SQLAlchemy para documentos anexados às Ordens de Serviço/Compra/Obra.

Tabela: ordem_documentos

US-015: cada ordem pode ter 1+ documentos (PDF, JPEG, PNG) armazenados no
        Supabase Storage (bucket privado 'ordem-documentos').

Regras de integridade aplicadas no banco:
  - CHK tipo_mime: apenas application/pdf, image/jpeg, image/png
  - CHK tamanho_bytes: 1 byte ≤ tamanho ≤ 10 MB (10_485_760 bytes)
  - CHK hash_sha256: exatamente 64 caracteres hexadecimais
  - FK ordem_id ON DELETE CASCADE: remove documentos ao remover a ordem
  - FK uploaded_by ON DELETE RESTRICT: usuário não pode ser removido com docs

Imutabilidade: após AGUARDANDO_CONTROLADORIA, documentos são somente-leitura.
A validação de imutabilidade ocorre no DocumentoService — não no model.

Acesso ao arquivo: via URL assinada gerada pelo DocumentoService (TTL 900s).
O campo storage_path NUNCA é exposto diretamente ao front-end.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.ordem import Ordem
    from app.models.user import User


class OrdemDocumento(Base):
    """Documento anexado a uma ordem de serviço, compra ou obra.

    US-015: armazena metadados do arquivo; conteúdo no Supabase Storage.
    US-015 RN: imutável após AGUARDANDO_CONTROLADORIA (validado no service).
    US-015 RN: hash SHA-256 registrado para verificação de integridade.
    US-015 RN: assinado_govbr=True indica que o documento foi assinado e
               reenviado pela Secretaria após assinatura externa no GovBR.
    """

    __tablename__ = "ordem_documentos"

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

    ordem_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(
            "ordens.id",
            ondelete="CASCADE",
            name="fk_ordem_documentos_ordem_id",
        ),
        nullable=False,
        comment="FK para a ordem dona deste documento — CASCADE DELETE",
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="RESTRICT",
            name="fk_ordem_documentos_uploaded_by",
        ),
        nullable=False,
        comment="FK para o usuário que realizou o upload",
    )

    # ------------------------------------------------------------------
    # Metadados do arquivo (US-015)
    # ------------------------------------------------------------------

    nome_arquivo: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nome original do arquivo fornecido pelo usuário",
    )
    tipo_mime: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="MIME type validado — application/pdf | image/jpeg | image/png",
    )
    tamanho_bytes: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        comment="Tamanho em bytes — máximo 10 MB (10_485_760 bytes)",
    )
    descricao: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Descrição opcional informada pelo usuário no momento do upload",
    )

    # ------------------------------------------------------------------
    # Localização no Supabase Storage
    # NUNCA expor storage_path diretamente na API — sempre gerar URL assinada.
    # ------------------------------------------------------------------

    storage_path: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "Path interno no bucket Supabase Storage. "
            "Formato: {secretaria_id}/{ordem_id}/{timestamp}_{nome_sanitizado}. "
            "NUNCA exposto na API — use /download-url."
        ),
    )

    # ------------------------------------------------------------------
    # Integridade e autenticidade
    # ------------------------------------------------------------------

    hash_sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="SHA-256 hexadecimal do conteúdo do arquivo (64 chars) — integridade",
    )
    assinado_govbr: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
        comment=(
            "True quando o documento foi assinado digitalmente via GovBR. "
            "Secretaria baixa, assina externamente e reenvia com assinado=true."
        ),
    )

    # ------------------------------------------------------------------
    # Versionamento — incrementado ao substituir doc após devolução (US-006)
    # ------------------------------------------------------------------

    versao: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
        comment="Versão do documento — incrementada quando substituído após devolução",
    )

    # ------------------------------------------------------------------
    # Timestamp — tabela append-only (sem updated_at)
    # ------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp do upload (TIMESTAMPTZ) — imutável após inserção",
    )

    # ------------------------------------------------------------------
    # Relacionamentos (lazy='noload' — carregados explicitamente)
    # ------------------------------------------------------------------

    ordem: Mapped["Ordem"] = relationship(
        "Ordem",
        back_populates="documentos",
        lazy="noload",
        foreign_keys=[ordem_id],
    )
    uploader: Mapped["User"] = relationship(
        "User",
        back_populates="documentos_enviados",
        lazy="noload",
        foreign_keys=[uploaded_by],
    )

    # ------------------------------------------------------------------
    # Constraints e índices
    # ------------------------------------------------------------------

    __table_args__ = (
        # Índices de performance (CLAUDE.md §8: obrigatórios)
        Index("idx_ordem_documentos_ordem_id", "ordem_id"),
        Index("idx_ordem_documentos_uploaded_by", "uploaded_by"),
        Index("idx_ordem_documentos_created_at", "created_at"),

        # Constraints de integridade no banco (defense in depth)
        CheckConstraint(
            "tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png')",
            name="chk_ordem_documentos_tipo_mime",
        ),
        CheckConstraint(
            "tamanho_bytes > 0 AND tamanho_bytes <= 10485760",
            name="chk_ordem_documentos_tamanho_bytes",
        ),
        CheckConstraint(
            "LENGTH(hash_sha256) = 64",
            name="chk_ordem_documentos_hash_sha256",
        ),
        CheckConstraint(
            "versao >= 1",
            name="chk_ordem_documentos_versao",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<OrdemDocumento id={self.id} "
            f"ordem_id={self.ordem_id} "
            f"nome={self.nome_arquivo!r} "
            f"assinado={self.assinado_govbr}>"
        )
