"""US-019: adiciona AGUARDANDO_ASSINATURA_SECRETARIA ao ENUM status_ordem.

Revision ID: 009_us019_assinatura_secretaria
Revises: 008_us016_assinatura_govbr
Create Date: 2026-02-28

Novo status intermediário inserido entre AGUARDANDO_LIQUIDACAO e AGUARDANDO_PAGAMENTO.
Garante que o secretário responsável assine e aprove o documento de liquidação
antes do pagamento ser autorizado pela Tesouraria.

Fluxo atualizado:
  AGUARDANDO_LIQUIDACAO
    └─► AGUARDANDO_ASSINATURA_SECRETARIA  (novo — ação: liquidar / contabilidade)
          └─► AGUARDANDO_PAGAMENTO        (ação: assinar_liquidacao / secretaria)

US-019: novo status intermediário no pipeline financeiro.
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "009_us019_assinatura_secretaria"
down_revision = "008_us016_assinatura_govbr"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL 12+ suporta ADD VALUE dentro de transações quando a transação
    # ainda não referencio o ENUM. IF NOT EXISTS garante idempotência.
    # Supabase usa PostgreSQL 15 — compatível.
    op.execute(
        "ALTER TYPE status_ordem ADD VALUE IF NOT EXISTS 'AGUARDANDO_ASSINATURA_SECRETARIA'"
    )


def downgrade() -> None:
    # PostgreSQL não suporta remoção de valores de ENUM nativamente.
    # O downgrade é um no-op intencional — o valor permanece no ENUM.
    # Para reverter completamente seria necessário recriar o ENUM do zero.
    pass
