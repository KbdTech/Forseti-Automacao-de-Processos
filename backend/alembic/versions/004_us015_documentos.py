"""US-015: tabela ordem_documentos — anexo de documentos às ordens.

Revision ID: 004_us015_documentos
Revises: 003_us014_notifications
Create Date: 2026-02-26

Cria:
  - Tabela ordem_documentos — US-015
      - PK UUID, FK ordem_id (CASCADE), FK uploaded_by (RESTRICT)
      - metadados: nome_arquivo, tipo_mime, tamanho_bytes, descricao
      - storage: storage_path (path interno Supabase Storage — nunca exposto)
      - integridade: hash_sha256 (SHA-256 hex, 64 chars)
      - assinatura: assinado_govbr (bool)
      - versionamento: versao (INT, ≥ 1)
      - timestamp: created_at (TIMESTAMPTZ)
      - CHECK constraints: tipo_mime, tamanho_bytes, hash_sha256, versao

  - Índices de performance:
      - idx_ordem_documentos_ordem_id
      - idx_ordem_documentos_uploaded_by
      - idx_ordem_documentos_created_at

NOTA: Não há ENUM novo nesta migration.
NOTA: asyncpg não suporta DO $$ blocks — verificações idempotentes via SELECT.
NOTA: Sem updated_at — tabela append-only (documentos substituídos criam nova linha).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "004_us015_documentos"
down_revision = "003_us014_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Tabela ordem_documentos
    # ------------------------------------------------------------------
    op.create_table(
        "ordem_documentos",

        # Identificação
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
            comment="Identificador único (UUID v4)",
        ),

        # Chaves estrangeiras
        sa.Column(
            "ordem_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="FK para ordens.id — CASCADE DELETE",
        ),
        sa.Column(
            "uploaded_by",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="FK para users.id — usuário que fez o upload",
        ),

        # Metadados do arquivo
        sa.Column(
            "nome_arquivo",
            sa.String(length=255),
            nullable=False,
            comment="Nome original do arquivo",
        ),
        sa.Column(
            "tipo_mime",
            sa.String(length=100),
            nullable=False,
            comment="MIME type validado: application/pdf | image/jpeg | image/png",
        ),
        sa.Column(
            "tamanho_bytes",
            sa.BigInteger(),
            nullable=False,
            comment="Tamanho em bytes — máx 10_485_760 (10 MB)",
        ),
        sa.Column(
            "descricao",
            sa.String(length=255),
            nullable=True,
            comment="Descrição opcional do documento",
        ),

        # Localização no Storage — NUNCA expor via API
        sa.Column(
            "storage_path",
            sa.Text(),
            nullable=False,
            comment="Path interno no Supabase Storage — acesso via URL assinada",
        ),

        # Integridade e autenticidade
        sa.Column(
            "hash_sha256",
            sa.String(length=64),
            nullable=False,
            comment="SHA-256 hexadecimal do conteúdo (64 chars)",
        ),
        sa.Column(
            "assinado_govbr",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="True quando assinado digitalmente via GovBR",
        ),

        # Versionamento
        sa.Column(
            "versao",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
            comment="Versão do documento — incrementa ao substituir após devolução",
        ),

        # Timestamp append-only
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="Timestamp do upload (TIMESTAMPTZ)",
        ),

        # Constraints de integridade
        sa.PrimaryKeyConstraint("id", name="pk_ordem_documentos"),
        sa.ForeignKeyConstraint(
            ["ordem_id"],
            ["ordens.id"],
            name="fk_ordem_documentos_ordem_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"],
            ["users.id"],
            name="fk_ordem_documentos_uploaded_by",
            ondelete="RESTRICT",
        ),

        # Defense in depth: regras de integridade no banco
        sa.CheckConstraint(
            "tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png')",
            name="chk_ordem_documentos_tipo_mime",
        ),
        sa.CheckConstraint(
            "tamanho_bytes > 0 AND tamanho_bytes <= 10485760",
            name="chk_ordem_documentos_tamanho_bytes",
        ),
        sa.CheckConstraint(
            "LENGTH(hash_sha256) = 64",
            name="chk_ordem_documentos_hash_sha256",
        ),
        sa.CheckConstraint(
            "versao >= 1",
            name="chk_ordem_documentos_versao",
        ),
    )

    # ------------------------------------------------------------------
    # 2. Índices de performance
    # ------------------------------------------------------------------

    # Índice principal: buscar todos os docs de uma ordem (acesso mais frequente)
    op.create_index(
        "idx_ordem_documentos_ordem_id",
        "ordem_documentos",
        ["ordem_id"],
    )

    # Índice: buscar docs enviados por um usuário (auditoria)
    op.create_index(
        "idx_ordem_documentos_uploaded_by",
        "ordem_documentos",
        ["uploaded_by"],
    )

    # Índice: ordenação cronológica e filtros por data
    op.create_index(
        "idx_ordem_documentos_created_at",
        "ordem_documentos",
        ["created_at"],
    )

    # ------------------------------------------------------------------
    # 3. COMMENT ON TABLE (documentação inline no banco)
    # ------------------------------------------------------------------
    op.execute(sa.text(
        "COMMENT ON TABLE ordem_documentos IS "
        "'US-015: documentos anexados às ordens. "
        "Armazenamento no Supabase Storage (bucket ordem-documentos). "
        "Tabela append-only — documentos substituídos geram nova linha (versao+1). "
        "Acesso ao arquivo via URL assinada (TTL 900s) — nunca por storage_path direto.'"
    ))


def downgrade() -> None:
    # Remove índices antes da tabela
    op.drop_index("idx_ordem_documentos_created_at", table_name="ordem_documentos")
    op.drop_index("idx_ordem_documentos_uploaded_by", table_name="ordem_documentos")
    op.drop_index("idx_ordem_documentos_ordem_id", table_name="ordem_documentos")

    # Remove tabela (CASCADE remove FK constraints automaticamente)
    op.drop_table("ordem_documentos")
