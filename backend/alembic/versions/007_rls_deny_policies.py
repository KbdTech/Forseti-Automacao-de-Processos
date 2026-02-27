"""Adiciona políticas RLS DENY ALL em todas as tabelas públicas.

Revision ID: 007_rls_deny_policies
Revises: 006_rls_alembic_version
Create Date: 2026-02-27

Contexto:
  Após habilitar RLS (migrations 005 e 006), o Supabase Security Advisor
  emite alertas INFO "RLS Enabled No Policy" para todas as tabelas.

  Comportamento atual (RLS ativo, sem política):
    - roles anon / authenticated (PostgREST): DENY ALL por padrão ✅ seguro
    - postgres superusuário (FastAPI): BYPASSRLS — não afetado ✅
    - service_role Supabase: BYPASSRLS — não afetado ✅

  Esta migration adiciona políticas RESTRICTIVE USING (false) explícitas para:
    1. Silenciar os alertas INFO do Supabase Security Advisor
    2. Documentar a intenção de segurança: TODO o acesso passa pelo FastAPI,
       nunca por PostgREST direto
    3. Garantia dupla: sem política + com política DENY = bloqueio total para
       roles sem BYPASSRLS

  Tabelas afetadas: todas as 10 tabelas do schema public.
"""

from alembic import op
import sqlalchemy as sa

revision = "007_rls_deny_policies"
down_revision = "006_rls_alembic_version"
branch_labels = None
depends_on = None

# Todas as tabelas públicas — acesso via PostgREST deve ser bloqueado
_TABLES = [
    "alembic_version",
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
        policy_name = f"deny_all_{table}"
        op.execute(sa.text(
            f"CREATE POLICY {policy_name} ON {table} "
            "AS RESTRICTIVE FOR ALL TO public USING (false);"
        ))


def downgrade() -> None:
    for table in reversed(_TABLES):
        policy_name = f"deny_all_{table}"
        op.execute(sa.text(
            f"DROP POLICY IF EXISTS {policy_name} ON {table};"
        ))
