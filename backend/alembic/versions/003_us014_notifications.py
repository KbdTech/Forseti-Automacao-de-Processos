"""US-014: notification_log e user_notification_prefs.

Revision ID: 003_us014_notifications
Revises: a7d2f31025ff
Create Date: 2026-02-26

Cria:
  - ENUM notification_status ('enviado', 'falhou')
  - Tabela notification_log    — US-014 RN-69
  - Tabela user_notification_prefs — US-014 RN-73
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "003_us014_notifications"
down_revision = "a7d2f31025ff"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. ENUM notification_status + tabela notification_log
    # NOTA: cria o ENUM via sa.Enum(create_type=True) no create_table
    #       para evitar o bug do Alembic/SQLAlchemy 2.x onde create_type=False
    #       é ignorado e o ENUM é criado duas vezes (DuplicateObject).
    # ------------------------------------------------------------------
    op.create_table(
        "notification_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("ordem_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("evento", sa.String(length=100), nullable=False),
        sa.Column("destinatario", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.Enum("enviado", "falhou", name="notification_status"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["ordem_id"],
            ["ordens.id"],
            name="fk_notification_log_ordem",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_notification_log_ordem_id",
        "notification_log",
        ["ordem_id"],
    )
    op.create_index(
        "idx_notification_log_created_at",
        "notification_log",
        ["created_at"],
    )

    # ------------------------------------------------------------------
    # 3. user_notification_prefs — preferências do usuário
    # ------------------------------------------------------------------
    op.create_table(
        "user_notification_prefs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("evento", sa.String(length=100), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_notification_prefs_user",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "evento", name="uq_user_notification_pref"),
    )
    op.create_index(
        "idx_user_notification_prefs_user_id",
        "user_notification_prefs",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_table("user_notification_prefs")
    op.drop_table("notification_log")
    op.execute("DROP TYPE IF EXISTS notification_status;")
