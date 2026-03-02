"""S11.1: cria tabela fornecedores e adiciona fornecedor_id em ordens.

Revision ID: 010_fornecedores
Revises: 009_us019_assinatura_secretaria
Create Date: 2026-03-02

Tabela fornecedores:
  - Armazena empresas vencedoras de licitação municipal
  - secretaria_id nullable: NULL = fornecedor global (todos perfis); preenchido = exclusivo

Coluna fornecedor_id em ordens:
  - Nullable no banco para preservar ordens históricas sem fornecedor
  - Obrigatoriedade imposta pelo schema Pydantic OrdemCreate (não pelo banco)
  - ON DELETE SET NULL: ao excluir fornecedor, ordens mantêm histórico mas perdem o vínculo
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

# revision identifiers, used by Alembic.
revision = "010_fornecedores"
down_revision = "009_us019_assinatura_secretaria"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Cria tabela fornecedores
    # ------------------------------------------------------------------
    op.create_table(
        "fornecedores",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("razao_social", sa.String(255), nullable=False),
        sa.Column("nome_fantasia", sa.String(255), nullable=True),
        sa.Column("cnpj", sa.String(14), nullable=False),
        sa.Column("numero_processo", sa.String(100), nullable=True),
        sa.Column("objeto_contrato", sa.Text(), nullable=True),
        sa.Column("valor_contratado", sa.Numeric(15, 2), nullable=True),
        sa.Column("data_contrato", sa.Date(), nullable=True),
        sa.Column("banco", sa.String(100), nullable=True),
        sa.Column("agencia", sa.String(20), nullable=True),
        sa.Column("conta", sa.String(30), nullable=True),
        sa.Column("tipo_conta", sa.String(20), nullable=False, server_default="corrente"),
        sa.Column("secretaria_id", PGUUID(as_uuid=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        # Constraints
        sa.UniqueConstraint("cnpj", name="uq_fornecedores_cnpj"),
        sa.ForeignKeyConstraint(
            ["secretaria_id"],
            ["secretarias.id"],
            name="fk_fornecedores_secretaria_id",
            ondelete="SET NULL",
        ),
    )

    # Índices
    op.create_index("idx_fornecedores_cnpj", "fornecedores", ["cnpj"])
    op.create_index("idx_fornecedores_secretaria", "fornecedores", ["secretaria_id"])
    op.create_index("idx_fornecedores_is_active", "fornecedores", ["is_active"])

    # ------------------------------------------------------------------
    # 2. Adiciona fornecedor_id em ordens (nullable — compatibilidade histórica)
    # ------------------------------------------------------------------
    op.add_column(
        "ordens",
        sa.Column("fornecedor_id", PGUUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_ordens_fornecedor_id",
        "ordens",
        "fornecedores",
        ["fornecedor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_ordens_fornecedor_id", "ordens", ["fornecedor_id"])


def downgrade() -> None:
    # Reverte em ordem inversa

    # Remove FK e coluna fornecedor_id de ordens
    op.drop_index("idx_ordens_fornecedor_id", table_name="ordens")
    op.drop_constraint("fk_ordens_fornecedor_id", "ordens", type_="foreignkey")
    op.drop_column("ordens", "fornecedor_id")

    # Remove índices e tabela fornecedores
    op.drop_index("idx_fornecedores_is_active", table_name="fornecedores")
    op.drop_index("idx_fornecedores_secretaria", table_name="fornecedores")
    op.drop_index("idx_fornecedores_cnpj", table_name="fornecedores")
    op.drop_table("fornecedores")
