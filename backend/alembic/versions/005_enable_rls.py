"""Habilita Row Level Security em todas as tabelas públicas.

Revision ID: 005_enable_rls
Revises: 004_us015_documentos
Create Date: 2026-02-27

Contexto:
  O Supabase expõe as tabelas do schema public via PostgREST (anon/authenticated
  roles).  Com RLS desabilitado, qualquer cliente com a chave anon pode ler/escrever
  dados diretamente — o que é uma falha de segurança.

  Nossa aplicação usa FastAPI com conexão direta via asyncpg (usuário postgres,
  que é superusuário).  Superusuários do PostgreSQL BYPASSRLS por padrão, portanto
  habilitar RLS NÃO afeta o funcionamento da API.

  Habilitar RLS nas tabelas:
    - Bloqueia acesso direto pela role anon do Supabase (PostgREST/Dashboard anon)
    - Bloqueia acesso pela role authenticated sem política explícita
    - NÃO afeta o FastAPI (postgres superuser)
    - Resolve os alertas "RLS Disabled in Public" do Supabase Security Advisor

Tabelas afetadas:
  users, secretarias, role_change_log, audit_logs, ordens, ordem_historico,
  notification_log, user_notification_prefs, ordem_documentos
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "005_enable_rls"
down_revision = "004_us015_documentos"
branch_labels = None
depends_on = None


# Tabelas que precisam de RLS — alembic_version excluída intencionalmente
_TABLES = [
    "users",
    "secretarias",
    "role_change_log",
    "audit_logs",
    "ordens",
    "ordem_historico",
    "notification_log",
    "user_notification_prefs",
    "ordem_documentos",
]


def upgrade() -> None:
    for table in _TABLES:
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;"))


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;"))
