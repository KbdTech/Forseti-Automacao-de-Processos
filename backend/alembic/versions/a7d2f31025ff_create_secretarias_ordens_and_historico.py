"""US-003 a US-010: tabelas de ordens e histórico de tramitação.

Cria:
  - ENUMs PostgreSQL nativos:
      tipo_ordem    (compra, servico, obra)
      prioridade    (normal, alta, urgente)
      status_ordem  (13 estados da máquina de estados)
      forma_pagamento (transferencia, cheque, pix)
  - Tabela ordens         (ciclo de vida de demandas municipais)
  - Tabela ordem_historico (histórico append-only de tramitação)
  - Todos os índices obrigatórios

Regras aplicadas:
  - UUIDs como PK (CLAUDE.md §8)
  - TIMESTAMPTZ em todos os timestamps (CLAUDE.md §8)
  - ON DELETE RESTRICT nas FKs de auditoria (CLAUDE.md §8)
  - ENUMs criados via SELECT pg_type (compatível com asyncpg — CLAUDE.md gotcha #1)
  - ordem_historico: APPEND-ONLY (US-012 RN-60)

Revisão: a7d2f31025ff
Predecessor: 001 (Sprint 1 — auth e RBAC)
Criado em: 2026-02-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7d2f31025ff"
down_revision: Union[str, Sequence[str], None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Helpers: referências aos tipos ENUM sem re-criar (asyncpg safe)
# Mesmo padrão de _role_enum() em 001_*.py
# ---------------------------------------------------------------------------


def _tipo_ordem() -> postgresql.ENUM:
    return postgresql.ENUM(
        "compra", "servico", "obra",
        name="tipo_ordem",
        create_type=False,
    )


def _prioridade() -> postgresql.ENUM:
    return postgresql.ENUM(
        "normal", "alta", "urgente",
        name="prioridade",
        create_type=False,
    )


def _status_ordem() -> postgresql.ENUM:
    return postgresql.ENUM(
        "AGUARDANDO_GABINETE",
        "AGUARDANDO_CONTROLADORIA",
        "DEVOLVIDA_PARA_ALTERACAO",
        "COM_IRREGULARIDADE",
        "AGUARDANDO_DOCUMENTACAO",
        "AGUARDANDO_EMPENHO",
        "AGUARDANDO_EXECUCAO",
        "AGUARDANDO_ATESTO",
        "EXECUCAO_COM_PENDENCIA",
        "AGUARDANDO_LIQUIDACAO",
        "AGUARDANDO_PAGAMENTO",
        "PAGA",
        "CANCELADA",
        name="status_ordem",
        create_type=False,
    )


def _forma_pagamento() -> postgresql.ENUM:
    return postgresql.ENUM(
        "transferencia", "cheque", "pix",
        name="forma_pagamento",
        create_type=False,
    )


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    """Cria ENUMs e tabelas de ordens para Sprint 2.

    Ordem de criação:
    1. ENUMs PostgreSQL (tipo_ordem, prioridade, status_ordem, forma_pagamento)
    2. Tabela ordens
    3. Tabela ordem_historico
    4. Índices
    """

    bind = op.get_bind()

    # ------------------------------------------------------------------
    # 1. ENUMs PostgreSQL nativos
    #
    # Usamos SELECT pg_type para verificar existência (idempotente).
    # DO $$ ... $$ blocks não funcionam com asyncpg — CLAUDE.md gotcha #1.
    # ------------------------------------------------------------------

    for type_name, values in [
        ("tipo_ordem", "('compra', 'servico', 'obra')"),
        ("prioridade", "('normal', 'alta', 'urgente')"),
        (
            "status_ordem",
            (
                "('AGUARDANDO_GABINETE', 'AGUARDANDO_CONTROLADORIA', "
                "'DEVOLVIDA_PARA_ALTERACAO', 'COM_IRREGULARIDADE', "
                "'AGUARDANDO_DOCUMENTACAO', 'AGUARDANDO_EMPENHO', "
                "'AGUARDANDO_EXECUCAO', 'AGUARDANDO_ATESTO', "
                "'EXECUCAO_COM_PENDENCIA', 'AGUARDANDO_LIQUIDACAO', "
                "'AGUARDANDO_PAGAMENTO', 'PAGA', 'CANCELADA')"
            ),
        ),
        ("forma_pagamento", "('transferencia', 'cheque', 'pix')"),
    ]:
        exists = bind.execute(
            sa.text(f"SELECT 1 FROM pg_type WHERE typname = '{type_name}'")
        ).fetchone()

        if not exists:
            bind.execute(
                sa.text(f"CREATE TYPE {type_name} AS ENUM {values}")
            )

    # ------------------------------------------------------------------
    # 2. Tabela ordens
    #
    # US-003: protocolo gerado no padrão OS-ANO-SEQUENCIAL.
    # US-003 RN-20: status inicial = AGUARDANDO_GABINETE.
    # US-010 RN-53: status PAGA → somente-leitura (validado no service).
    # ------------------------------------------------------------------

    op.create_table(
        "ordens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="Identificador único (UUID v4)",
        ),
        sa.Column(
            "protocolo",
            sa.String(20),
            nullable=False,
            comment="Protocolo único no padrão OS-ANO-SEQUENCIAL (US-003 RN-13)",
        ),
        sa.Column(
            "tipo",
            _tipo_ordem(),
            nullable=False,
            comment="Tipo de demanda: compra, servico ou obra (US-003 RN-16)",
        ),
        sa.Column(
            "prioridade",
            _prioridade(),
            nullable=False,
            comment="Nível de urgência: normal, alta ou urgente (US-003 RN-17)",
        ),
        sa.Column(
            "responsavel",
            sa.String(255),
            nullable=False,
            comment="Nome do servidor responsável pela execução da demanda",
        ),
        sa.Column(
            "descricao",
            sa.Text(),
            nullable=False,
            comment="Descrição detalhada da demanda",
        ),
        sa.Column(
            "valor_estimado",
            sa.Numeric(15, 2),
            nullable=False,
            comment="Valor estimado em R$ — deve ser positivo (US-003 RN-18)",
        ),
        sa.Column(
            "justificativa",
            sa.Text(),
            nullable=False,
            comment="Justificativa da demanda — mínimo 50 chars (US-003 RN-19)",
        ),
        sa.Column(
            "secretaria_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "secretarias.id",
                ondelete="RESTRICT",
                name="fk_ordens_secretaria_id",
            ),
            nullable=False,
            comment="FK para a secretaria de origem (US-003 RN-15)",
        ),
        sa.Column(
            "criado_por",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                ondelete="RESTRICT",
                name="fk_ordens_criado_por",
            ),
            nullable=False,
            comment="FK para o usuário que criou a ordem (US-003 RN-14)",
        ),
        sa.Column(
            "status",
            _status_ordem(),
            nullable=False,
            server_default=sa.text("'AGUARDANDO_GABINETE'"),
            comment="Estado atual na máquina de estados (US-003 RN-20)",
        ),
        # US-006 RN-35: incrementado a cada reenvio
        sa.Column(
            "versao",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
            comment="Versão da ordem — incrementada a cada reenvio (US-006 RN-35)",
        ),
        # --- Pipeline financeiro: Empenho (US-008) ---
        sa.Column(
            "numero_empenho",
            sa.String(50),
            nullable=True,
            comment="Número único do empenho orçamentário (US-008 RN-42)",
        ),
        sa.Column(
            "valor_empenhado",
            sa.Numeric(15, 2),
            nullable=True,
            comment="Valor empenhado em R$ — pode diferir do estimado (US-008 RN-45)",
        ),
        sa.Column(
            "data_empenho",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Data do empenho — registrada automaticamente (US-008 RN-43)",
        ),
        # --- Pipeline financeiro: Atesto (US-009) ---
        sa.Column(
            "numero_nf",
            sa.String(50),
            nullable=True,
            comment="Número da nota fiscal — obrigatório para atestar (US-009 RN-49)",
        ),
        sa.Column(
            "data_atesto",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Data e hora do atesto — registrada automaticamente (US-009 RN-48)",
        ),
        sa.Column(
            "atestado_por",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                name="fk_ordens_atestado_por",
            ),
            nullable=True,
            comment="FK para o usuário que atestou a nota (US-009 RN-46)",
        ),
        # --- Pipeline financeiro: Liquidação (US-010) ---
        sa.Column(
            "valor_liquidado",
            sa.Numeric(15, 2),
            nullable=True,
            comment="Valor liquidado em R$ (US-010 RN-50)",
        ),
        sa.Column(
            "data_liquidacao",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Data da liquidação (US-010 RN-50)",
        ),
        # --- Pipeline financeiro: Pagamento (US-010) ---
        sa.Column(
            "valor_pago",
            sa.Numeric(15, 2),
            nullable=True,
            comment="Valor pago — pode diferir do liquidado com justificativa (US-010 RN-52)",
        ),
        sa.Column(
            "data_pagamento",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="Data do pagamento (US-010 RN-51)",
        ),
        sa.Column(
            "forma_pagamento",
            _forma_pagamento(),
            nullable=True,
            comment="Forma de pagamento: transferencia, cheque ou pix (US-010 RN-51)",
        ),
        # --- Timestamps ---
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp de criação da ordem (TIMESTAMPTZ) — US-003 RN-14",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp da última atualização (TIMESTAMPTZ)",
        ),
        sa.UniqueConstraint("protocolo", name="uq_ordens_protocolo"),
        sa.UniqueConstraint("numero_empenho", name="uq_ordens_numero_empenho"),
        comment="Ordens de serviço, compra e obra das secretarias municipais",
    )

    # ------------------------------------------------------------------
    # 3. Tabela ordem_historico (append-only)
    #
    # US-012 RN-60: log imutável — NUNCA executar UPDATE ou DELETE.
    # US-004 RN-22: histórico disponível em ordem cronológica (created_at ASC).
    # ------------------------------------------------------------------

    op.create_table(
        "ordem_historico",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            comment="Identificador único (UUID v4)",
        ),
        sa.Column(
            "ordem_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "ordens.id",
                ondelete="RESTRICT",
                name="fk_historico_ordem_id",
            ),
            nullable=False,
            comment="FK para a ordem tramitada",
        ),
        sa.Column(
            "usuario_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "users.id",
                ondelete="RESTRICT",
                name="fk_historico_usuario_id",
            ),
            nullable=False,
            comment="FK para o usuário que executou a ação",
        ),
        sa.Column(
            "perfil",
            sa.String(50),
            nullable=False,
            comment="Perfil do usuário no momento da ação (US-012 RN-61)",
        ),
        sa.Column(
            "acao",
            sa.String(100),
            nullable=False,
            comment=(
                "Ação executada: autorizar, devolver, cancelar, aprovar, "
                "empenhar, atestar, liquidar, pagar, etc."
            ),
        ),
        # NULL apenas na criação da ordem (sem status anterior)
        sa.Column(
            "status_anterior",
            _status_ordem(),
            nullable=True,
            comment="Status antes da transição (NULL na criação — sem estado anterior)",
        ),
        sa.Column(
            "status_novo",
            _status_ordem(),
            nullable=False,
            comment="Status após a transição",
        ),
        sa.Column(
            "observacao",
            sa.Text(),
            nullable=True,
            comment="Observação do usuário sobre a ação (obrigatória em alguns casos)",
        ),
        sa.Column(
            "ip_address",
            sa.String(45),
            nullable=True,
            comment="IP do cliente — String(45) suporta IPv4 e IPv6 (US-012 RN-61)",
        ),
        # Sem updated_at — registros são imutáveis (US-012 RN-60)
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
            comment="Timestamp da tramitação (TIMESTAMPTZ) — imutável (US-012 RN-60)",
        ),
        comment=(
            "Histórico imutável de tramitação de ordens (US-012 RN-60). "
            "APPEND-ONLY: nunca UPDATE ou DELETE."
        ),
    )

    # ------------------------------------------------------------------
    # 4. Índices — criados ao final para melhor performance de ingestão
    # Conforme CLAUDE.md §8: índices obrigatórios
    # ------------------------------------------------------------------

    # ordens
    op.create_index("ix_ordens_protocolo", "ordens", ["protocolo"], unique=True)
    op.create_index("idx_ordens_secretaria_id_status", "ordens", ["secretaria_id", "status"])
    op.create_index("idx_ordens_status", "ordens", ["status"])
    op.create_index("idx_ordens_created_at", "ordens", ["created_at"])
    op.create_index("idx_ordens_criado_por", "ordens", ["criado_por"])

    # ordem_historico
    op.create_index(
        "idx_historico_ordem_id_created_at",
        "ordem_historico",
        ["ordem_id", "created_at"],
    )
    op.create_index("idx_historico_usuario_id", "ordem_historico", ["usuario_id"])
    op.create_index("idx_historico_created_at", "ordem_historico", ["created_at"])


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    """Remove tabelas e ENUMs criados no upgrade.

    Ordem de remoção (inversa à criação para respeitar FKs):
    1. Índices
    2. ordem_historico
    3. ordens
    4. ENUMs (somente se não usados por outras tabelas)
    """

    # ------------------------------------------------------------------
    # 1. Índices
    # ------------------------------------------------------------------

    op.drop_index("idx_historico_created_at", table_name="ordem_historico")
    op.drop_index("idx_historico_usuario_id", table_name="ordem_historico")
    op.drop_index("idx_historico_ordem_id_created_at", table_name="ordem_historico")

    op.drop_index("idx_ordens_criado_por", table_name="ordens")
    op.drop_index("idx_ordens_created_at", table_name="ordens")
    op.drop_index("idx_ordens_status", table_name="ordens")
    op.drop_index("idx_ordens_secretaria_id_status", table_name="ordens")
    op.drop_index("ix_ordens_protocolo", table_name="ordens")

    # ------------------------------------------------------------------
    # 2-3. Tabelas (ordem inversa à criação)
    # ------------------------------------------------------------------

    op.drop_table("ordem_historico")
    op.drop_table("ordens")

    # ------------------------------------------------------------------
    # 4. ENUMs — verificar existência antes para downgrade idempotente
    # ------------------------------------------------------------------

    bind = op.get_bind()

    for type_name in ["forma_pagamento", "status_ordem", "prioridade", "tipo_ordem"]:
        exists = bind.execute(
            sa.text(f"SELECT 1 FROM pg_type WHERE typname = '{type_name}'")
        ).fetchone()

        if exists:
            bind.execute(sa.text(f"DROP TYPE {type_name}"))
