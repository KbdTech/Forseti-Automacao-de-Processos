"""US-016: adiciona coluna assinatura_govbr à tabela ordens.

Revision ID: 008_us016_assinatura_govbr
Revises: 007_rls_deny_policies
Create Date: 2026-02-27

Campo booleano que indica se a Ordem de Serviço foi assinada digitalmente
via GovBR (gov.br/assinatura). O processo de assinatura é EXTERNO ao sistema;
este campo registra apenas a declaração do usuário da Secretaria.

US-016 RN-01: default false — não assinado.
US-016 RN-04: o sistema não valida nem integra com o GovBR.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "008_us016_assinatura_govbr"
down_revision = "007_rls_deny_policies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ordens",
        sa.Column(
            "assinatura_govbr",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="US-016: true se a OS foi assinada digitalmente via GovBR",
        ),
    )


def downgrade() -> None:
    op.drop_column("ordens", "assinatura_govbr")
