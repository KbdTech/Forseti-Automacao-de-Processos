"""Habilita RLS e adiciona políticas DENY ALL nas tabelas de fornecedores.

Revision ID: 013_rls_fornecedores
Revises: 012_fornecedor_documentos
Create Date: 2026-03-03

Contexto:
  As tabelas `fornecedores` e `fornecedor_documentos` foram criadas após as
  migrations 005 (ENABLE RLS) e 007 (DENY policies), portanto não herdaram
  a proteção aplicada às demais tabelas.

  O Supabase Security Advisor emite alerta ERROR "RLS Disabled in Public"
  para `public.fornecedores` (e emitiria para `fornecedor_documentos`).

  Padrão do projeto (igual às migrations 005 e 007):
    - ENABLE ROW LEVEL SECURITY: bloqueia acesso direto via PostgREST (anon/authenticated)
    - POLICY RESTRICTIVE USING (false): DENY ALL explícito — silencia alertas INFO e
      documenta a intenção de que todo acesso passa pelo FastAPI (postgres superuser)

  O FastAPI usa asyncpg com o usuário postgres (superusuário), que possui BYPASSRLS
  por padrão — portanto habilitar RLS NÃO afeta o funcionamento da API.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "013_rls_fornecedores"
down_revision = "012_fornecedor_documentos"
branch_labels = None
depends_on = None

_TABLES = [
    "fornecedores",
    "fornecedor_documentos",
]


def upgrade() -> None:
    # 1. Habilita RLS
    for table in _TABLES:
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;"))

    # 2. Adiciona política RESTRICTIVE DENY ALL (mesmo padrão da migration 007)
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

    for table in reversed(_TABLES):
        op.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;"))
