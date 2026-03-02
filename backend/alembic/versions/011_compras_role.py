"""S13.1: adiciona valor 'compras' ao enum role_enum.

Revision ID: 011_compras_role
Revises: 010_fornecedores
Create Date: 2026-03-02

Notas:
  ALTER TYPE ... ADD VALUE não funciona dentro de transações no PostgreSQL.
  IF NOT EXISTS garante idempotência.
  Downgrade não remove valores de enum — requer recriação do tipo, deixado como no-op.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "011_compras_role"
down_revision = "010_fornecedores"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE role_enum ADD VALUE IF NOT EXISTS 'compras'")


def downgrade() -> None:
    # PostgreSQL não suporta remoção de valores de enum sem recriar o tipo.
    # No-op documentado — downgrade requer processo manual.
    pass
