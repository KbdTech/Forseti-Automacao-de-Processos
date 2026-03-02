"""S12.2: cria tabela fornecedor_documentos para uploads de docs por fornecedor.

Revision ID: 012_fornecedor_documentos
Revises: 011_compras_role
Create Date: 2026-03-02

Notas:
  - Tabela append-only (sem updated_at)
  - CHK tipo_mime: application/pdf, image/jpeg, image/png
  - CHK tamanho_bytes: 1 a 20 MB (20_971_520 bytes)
  - FK fornecedor_id ON DELETE CASCADE
  - FK uploaded_by ON DELETE RESTRICT
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "012_fornecedor_documentos"
down_revision = "011_compras_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fornecedor_documentos",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("fornecedor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nome_arquivo", sa.String(255), nullable=False),
        sa.Column("tipo_mime", sa.String(100), nullable=False),
        sa.Column("tamanho_bytes", sa.BigInteger(), nullable=False),
        sa.Column("descricao", sa.String(255), nullable=True),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_fornecedor_documentos"),
        sa.ForeignKeyConstraint(
            ["fornecedor_id"],
            ["fornecedores.id"],
            name="fk_fornecedor_documentos_fornecedor_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"],
            ["users.id"],
            name="fk_fornecedor_documentos_uploaded_by",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "tipo_mime IN ('application/pdf', 'image/jpeg', 'image/png')",
            name="chk_fornecedor_documentos_tipo_mime",
        ),
        sa.CheckConstraint(
            "tamanho_bytes > 0 AND tamanho_bytes <= 20971520",
            name="chk_fornecedor_documentos_tamanho_bytes",
        ),
    )

    op.create_index(
        "idx_fornecedor_documentos_fornecedor_id",
        "fornecedor_documentos",
        ["fornecedor_id"],
    )
    op.create_index(
        "idx_fornecedor_documentos_uploaded_by",
        "fornecedor_documentos",
        ["uploaded_by"],
    )
    op.create_index(
        "idx_fornecedor_documentos_created_at",
        "fornecedor_documentos",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_fornecedor_documentos_created_at", table_name="fornecedor_documentos")
    op.drop_index("idx_fornecedor_documentos_uploaded_by", table_name="fornecedor_documentos")
    op.drop_index("idx_fornecedor_documentos_fornecedor_id", table_name="fornecedor_documentos")
    op.drop_table("fornecedor_documentos")
