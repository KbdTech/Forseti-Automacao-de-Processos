"""US-001 + US-002: autenticação, RBAC e tabelas base.

Cria:
  - ENUM role_enum (PostgreSQL nativo)
  - Tabela secretarias  (prerequisito de FK para users.secretaria_id)
  - Tabela users        (autenticação + RBAC — US-001, US-002)
  - Tabela role_change_log (auditoria de alterações de perfil — US-002 RN-10)
  - Tabela audit_logs   (log de acesso ao sistema — US-001 RN-6)
  - Todos os índices obrigatórios

Regras aplicadas:
  - UUIDs como PK em todas as tabelas (CLAUDE.md §8)
  - TIMESTAMPTZ (DateTime timezone=True) em todos os timestamps (CLAUDE.md §8)
  - ON DELETE RESTRICT em todas as FKs de auditoria (CLAUDE.md §8)
  - Índices obrigatórios conforme documentação de arquitetura (CLAUDE.md §8)

Nota asyncpg: DO $$ ... $$ blocks não funcionam corretamente com asyncpg's
prepared statement protocol. Utilizamos verificação Python via SELECT para
checar existência do ENUM antes de criá-lo (idempotente).

Revisão: 001
Criado em: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Identificador desta revisão — Alembic usa para encadear migrations
revision: str = "001"
down_revision: str | None = None  # primeira migration — sem predecessor
branch_labels: str | None = None
depends_on: str | None = None


# ---------------------------------------------------------------------------
# Helper: referência ao tipo role_enum já existente (sem re-criar)
# postgresql.ENUM(name=..., create_type=False) referencia o tipo existente
# sem emitir CREATE TYPE — compatível com asyncpg.
# ---------------------------------------------------------------------------
def _role_enum() -> postgresql.ENUM:
    """Retorna referência ao role_enum sem tentar criá-lo."""
    return postgresql.ENUM(
        "secretaria",
        "gabinete",
        "controladoria",
        "contabilidade",
        "tesouraria",
        "admin",
        name="role_enum",
        create_type=False,
    )


# ---------------------------------------------------------------------------
# Upgrade — aplicar schema
# ---------------------------------------------------------------------------

def upgrade() -> None:
    """Cria o schema completo para US-001 e US-002.

    Ordem de criação:
    1. ENUM role_enum (dependência de users e role_change_log)
    2. secretarias   (dependência de FK em users.secretaria_id)
    3. users         (tabela central de autenticação)
    4. role_change_log (auditoria append-only de perfis)
    5. audit_logs    (log append-only de acesso)
    6. Índices       (todos ao final para melhor performance de carga)
    """

    # ------------------------------------------------------------------
    # 1. ENUM role_enum — tipo nativo PostgreSQL
    # US-002 RN-7: perfis disponíveis no sistema
    #
    # Usamos SELECT pg_type para verificar existência antes de criar.
    # DO $$ ... $$ blocks não funcionam com asyncpg (prepared statement
    # protocol captura o erro antes do EXCEPTION handler do PL/pgSQL).
    # ------------------------------------------------------------------
    bind = op.get_bind()

    type_exists = bind.execute(
        sa.text("SELECT 1 FROM pg_type WHERE typname = 'role_enum'")
    ).fetchone()

    if not type_exists:
        bind.execute(sa.text("""
            CREATE TYPE role_enum AS ENUM (
                'secretaria', 'gabinete', 'controladoria',
                'contabilidade', 'tesouraria', 'admin'
            )
        """))

    # ------------------------------------------------------------------
    # 2. Tabela secretarias
    # Criada aqui como prerequisito de FK para users.secretaria_id.
    # Lógica de negócio completa em US-013 (S6).
    # ------------------------------------------------------------------
    op.create_table(
        "secretarias",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="Identificador único (UUID v4)",
        ),
        sa.Column(
            "nome",
            sa.String(255),
            nullable=False,
            comment="Nome completo da secretaria (único no sistema)",
        ),
        sa.Column(
            "sigla",
            sa.String(5),
            nullable=False,
            comment="Sigla da secretaria, máx. 5 chars (única no sistema)",
        ),
        sa.Column(
            "orcamento_anual",
            sa.Numeric(15, 2),
            nullable=True,
            comment="Orçamento anual em R$ — editável pelo Admin",
        ),
        sa.Column(
            "ativo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("TRUE"),
            comment="FALSE = desativada (mantém histórico, não recebe novas ordens)",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp de criação (TIMESTAMPTZ)",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp da última atualização (TIMESTAMPTZ)",
        ),
        sa.UniqueConstraint("nome", name="uq_secretarias_nome"),
        sa.UniqueConstraint("sigla", name="uq_secretarias_sigla"),
        comment="Secretarias municipais — não deletar, apenas desativar (US-013 RN-68)",
    )

    # ------------------------------------------------------------------
    # 3. Tabela users
    # US-001: autenticação com JWT, bcrypt, bloqueio por tentativas.
    # US-002: RBAC com campo role (role_enum).
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="Identificador único (UUID v4)",
        ),
        sa.Column(
            "email",
            sa.String(255),
            nullable=False,
            comment="E-mail institucional — credencial de login (único)",
        ),
        sa.Column(
            "password_hash",
            sa.String(255),
            nullable=False,
            comment="Hash bcrypt da senha. US-001 RN-7: nunca texto plano.",
        ),
        sa.Column(
            "nome_completo",
            sa.String(255),
            nullable=False,
            comment="Nome completo exibido em históricos e pareceres",
        ),
        sa.Column(
            "role",
            # _role_enum() referencia tipo existente sem re-criar — asyncpg safe
            _role_enum(),
            nullable=False,
            comment="Perfil de acesso. US-002 RN-8: somente um por vez.",
        ),
        sa.Column(
            "secretaria_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "secretarias.id",
                ondelete="RESTRICT",
                name="fk_users_secretaria_id",
            ),
            nullable=True,
            comment="FK para secretaria. NULL para perfis transversais.",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("TRUE"),
            comment="FALSE = conta desativada",
        ),
        # US-001 RN-5: primeiro acesso exige troca de senha
        sa.Column(
            "first_login",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("TRUE"),
            comment="TRUE = deve trocar senha antes de acessar (US-001 RN-5)",
        ),
        # US-001 RN-1: máx. 5 tentativas antes do bloqueio de 15 min
        sa.Column(
            "login_attempts",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
            comment="Contador de falhas de login consecutivas (US-001 RN-1)",
        ),
        sa.Column(
            "locked_until",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Conta bloqueada até este timestamp (NULL = não bloqueada)",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp de criação (TIMESTAMPTZ)",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp da última atualização (TIMESTAMPTZ)",
        ),
        sa.UniqueConstraint("email", name="uq_users_email"),
        comment="Usuários autenticados do sistema (US-001, US-002)",
    )

    # ------------------------------------------------------------------
    # 4. Tabela role_change_log (append-only)
    # US-002 RN-10: toda alteração de perfil deve ser registrada.
    # NUNCA executar UPDATE ou DELETE nesta tabela.
    # ------------------------------------------------------------------
    op.create_table(
        "role_change_log",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="Identificador único (UUID v4)",
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                ondelete="RESTRICT",
                name="fk_role_change_log_user_id",
            ),
            nullable=False,
            comment="FK para o usuário que teve o perfil alterado",
        ),
        sa.Column(
            "old_role",
            _role_enum(),
            nullable=False,
            comment="Perfil anterior do usuário",
        ),
        sa.Column(
            "new_role",
            _role_enum(),
            nullable=False,
            comment="Novo perfil atribuído",
        ),
        sa.Column(
            "changed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                ondelete="RESTRICT",
                name="fk_role_change_log_changed_by",
            ),
            nullable=False,
            comment="FK para o admin que realizou a alteração",
        ),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp da alteração (TIMESTAMPTZ) — append-only",
        ),
        comment=(
            "Log imutável de alterações de perfil (US-002 RN-10). "
            "APPEND-ONLY: nunca UPDATE ou DELETE."
        ),
    )

    # ------------------------------------------------------------------
    # 5. Tabela audit_logs (append-only)
    # US-001 RN-6: toda tentativa de login registrada aqui.
    # US-012 RN-60: log append-only.
    # US-012 RN-64: separado de ordem_historico.
    # ------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="Identificador único (UUID v4)",
        ),
        # nullable=True: LOGIN_FAILED pode ser de e-mail inexistente no sistema
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                ondelete="RESTRICT",
                name="fk_audit_logs_user_id",
            ),
            nullable=True,
            comment="FK para o usuário (NULL se e-mail não encontrado no sistema)",
        ),
        sa.Column(
            "action",
            sa.String(100),
            nullable=False,
            comment=(
                "Ação auditada: LOGIN | LOGOUT | LOGIN_FAILED | "
                "PASSWORD_CHANGED | ACCOUNT_LOCKED | ROLE_CHANGED"
            ),
        ),
        sa.Column(
            "ip_address",
            postgresql.INET(),
            nullable=True,
            comment="Endereço IP do cliente (tipo INET PostgreSQL)",
        ),
        sa.Column(
            "user_agent",
            sa.Text(),
            nullable=True,
            comment="User-Agent do cliente HTTP",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp do evento (TIMESTAMPTZ) — append-only, nunca alterar",
        ),
        comment=(
            "Log imutável de acessos ao sistema (US-001 RN-6, US-012 RN-60). "
            "APPEND-ONLY: nunca UPDATE ou DELETE."
        ),
    )

    # ------------------------------------------------------------------
    # 6. Índices — criados ao final para melhor performance de ingestão
    # Conforme CLAUDE.md §8: índices obrigatórios
    # ------------------------------------------------------------------

    # users
    op.create_index("idx_users_role", "users", ["role"])
    op.create_index("idx_users_secretaria_id", "users", ["secretaria_id"])
    op.create_index("idx_users_is_active", "users", ["is_active"])
    # email já tem UniqueConstraint → PostgreSQL cria índice automático

    # role_change_log
    op.create_index("idx_role_change_log_user_id", "role_change_log", ["user_id"])
    op.create_index("idx_role_change_log_changed_by", "role_change_log", ["changed_by"])
    op.create_index("idx_role_change_log_changed_at", "role_change_log", ["changed_at"])

    # audit_logs
    op.create_index("idx_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("idx_audit_logs_action", "audit_logs", ["action"])
    op.create_index("idx_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index(
        "idx_audit_logs_user_id_created_at",
        "audit_logs",
        ["user_id", "created_at"],
    )


# ---------------------------------------------------------------------------
# Downgrade — reverter schema (rollback)
# ---------------------------------------------------------------------------

def downgrade() -> None:
    """Remove o schema criado no upgrade.

    Ordem de remoção (inversa à criação para respeitar FKs):
    1. Índices
    2. audit_logs
    3. role_change_log
    4. users
    5. secretarias
    6. ENUM role_enum
    """

    # ------------------------------------------------------------------
    # 1. Remover índices
    # ------------------------------------------------------------------
    op.drop_index("idx_audit_logs_user_id_created_at", table_name="audit_logs")
    op.drop_index("idx_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("idx_audit_logs_action", table_name="audit_logs")
    op.drop_index("idx_audit_logs_user_id", table_name="audit_logs")

    op.drop_index("idx_role_change_log_changed_at", table_name="role_change_log")
    op.drop_index("idx_role_change_log_changed_by", table_name="role_change_log")
    op.drop_index("idx_role_change_log_user_id", table_name="role_change_log")

    op.drop_index("idx_users_is_active", table_name="users")
    op.drop_index("idx_users_secretaria_id", table_name="users")
    op.drop_index("idx_users_role", table_name="users")

    # ------------------------------------------------------------------
    # 2-5. Remover tabelas (ordem inversa à criação)
    # ------------------------------------------------------------------
    op.drop_table("audit_logs")
    op.drop_table("role_change_log")
    op.drop_table("users")
    op.drop_table("secretarias")

    # ------------------------------------------------------------------
    # 6. Remover ENUM por último (não pode ser removido com tabelas ativas)
    # Verifica existência antes para tornar downgrade idempotente.
    # ------------------------------------------------------------------
    bind = op.get_bind()
    type_exists = bind.execute(
        sa.text("SELECT 1 FROM pg_type WHERE typname = 'role_enum'")
    ).fetchone()

    if type_exists:
        bind.execute(sa.text("DROP TYPE role_enum"))
