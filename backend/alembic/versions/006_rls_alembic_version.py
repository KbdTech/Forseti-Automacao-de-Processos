"""Habilita RLS na tabela alembic_version.

Revision ID: 006_rls_alembic_version
Revises: 005_enable_rls
Create Date: 2026-02-27

Contexto:
  A tabela alembic_version foi excluída da migration 005 por ser gerenciada
  pelo Alembic, mas o Supabase Security Advisor ainda a sinaliza como pública
  sem RLS.  Habilitar RLS aqui resolve o alerta sem impactar o Alembic, pois
  o usuário postgres (superusuário) tem BYPASSRLS e continua gravando versões
  normalmente.
"""

from alembic import op
import sqlalchemy as sa

revision = "006_rls_alembic_version"
down_revision = "005_enable_rls"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE alembic_version ENABLE ROW LEVEL SECURITY;"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE alembic_version DISABLE ROW LEVEL SECURITY;"))
