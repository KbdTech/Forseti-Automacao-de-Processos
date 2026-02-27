"""Model SQLAlchemy para Ordem de Serviço/Compra/Obra.

Tabela: ordens

Representa o ciclo de vida completo de uma demanda municipal, desde a criação
pela Secretaria até o pagamento final pela Tesouraria.

US-003: criação com status inicial AGUARDANDO_GABINETE, protocolo gerado.
US-004: consulta e acompanhamento pela Secretaria.
US-005: ações do Gabinete (autorizar, devolver, cancelar).
US-006: reenvio de ordem devolvida (incrementa versao).
US-007: ações da Controladoria (aprovar, irregularidade, docs).
US-008: empenho pela Contabilidade.
US-009: atesto de nota fiscal pela Secretaria.
US-010: liquidação e pagamento.

CLAUDE.md §6: máquina de estados com 13 status e 14 transições.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import (
    FormaPagamentoEnum,
    PrioridadeEnum,
    StatusOrdemEnum,
    TipoOrdemEnum,
    forma_pagamento_type,
    prioridade_type,
    status_ordem_type,
    tipo_ordem_type,
)

if TYPE_CHECKING:
    from app.models.secretaria import Secretaria
    from app.models.user import User
    from app.models.documento import OrdemDocumento  # US-015


class Ordem(Base):
    """Ordem de serviço, compra ou obra do sistema municipal.

    US-003 RN-13: protocolo gerado automaticamente no padrão OS-ANO-SEQUENCIAL.
    US-003 RN-14: created_at registrado automaticamente.
    US-003 RN-15: secretaria_id vinculado ao usuário criador.
    US-003 RN-20: status inicial = AGUARDANDO_GABINETE.
    US-010 RN-53: status PAGA → somente-leitura para todos os perfis operacionais.
    """

    __tablename__ = "ordens"

    # ------------------------------------------------------------------
    # Campos de identificação
    # ------------------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador único (UUID v4)",
    )
    protocolo: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        index=True,
        comment="Protocolo único no padrão OS-ANO-SEQUENCIAL (US-003 RN-13)",
    )

    # ------------------------------------------------------------------
    # Dados da demanda
    # ------------------------------------------------------------------

    tipo: Mapped[TipoOrdemEnum] = mapped_column(
        tipo_ordem_type,
        nullable=False,
        comment="Tipo de demanda: compra, servico ou obra (US-003 RN-16)",
    )
    prioridade: Mapped[PrioridadeEnum] = mapped_column(
        prioridade_type,
        nullable=False,
        comment="Nível de urgência: normal, alta ou urgente (US-003 RN-17)",
    )
    responsavel: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nome do servidor responsável pela execução da demanda",
    )
    descricao: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Descrição detalhada da demanda",
    )
    valor_estimado: Mapped[Decimal] = mapped_column(
        Numeric(15, 2),
        nullable=False,
        comment="Valor estimado em R$ — deve ser positivo (US-003 RN-18)",
    )
    justificativa: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment="Justificativa da demanda — mínimo 50 chars (US-003 RN-19)",
    )

    # ------------------------------------------------------------------
    # Origem
    # ------------------------------------------------------------------

    secretaria_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("secretarias.id", ondelete="RESTRICT", name="fk_ordens_secretaria_id"),
        nullable=False,
        comment="FK para a secretaria de origem (US-003 RN-15)",
    )
    criado_por: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_ordens_criado_por"),
        nullable=False,
        comment="FK para o usuário que criou a ordem (US-003 RN-14)",
    )

    # ------------------------------------------------------------------
    # Máquina de estados (CLAUDE.md §6)
    # ------------------------------------------------------------------

    status: Mapped[StatusOrdemEnum] = mapped_column(
        status_ordem_type,
        nullable=False,
        default=StatusOrdemEnum.AGUARDANDO_GABINETE,
        server_default=text("'AGUARDANDO_GABINETE'"),
        comment="Estado atual na máquina de estados (US-003 RN-20)",
    )
    # US-006 RN-35: incrementado a cada reenvio após devolução
    versao: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
        comment="Versão da ordem — incrementada a cada reenvio (US-006 RN-35)",
    )

    # ------------------------------------------------------------------
    # Assinatura digital (US-016)
    # ------------------------------------------------------------------

    assinatura_govbr: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
        comment="US-016: indica se a OS foi assinada digitalmente via GovBR (declaração do usuário)",
    )

    # ------------------------------------------------------------------
    # Pipeline financeiro — Empenho (US-008)
    # ------------------------------------------------------------------

    numero_empenho: Mapped[str | None] = mapped_column(
        String(50),
        unique=True,
        nullable=True,
        comment="Número único do empenho orçamentário (US-008 RN-42)",
    )
    valor_empenhado: Mapped[Decimal | None] = mapped_column(
        Numeric(15, 2),
        nullable=True,
        comment="Valor empenhado em R$ — pode diferir do estimado (US-008 RN-45)",
    )
    data_empenho: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Data do empenho — registrada automaticamente (US-008 RN-43)",
    )

    # ------------------------------------------------------------------
    # Pipeline financeiro — Atesto (US-009)
    # ------------------------------------------------------------------

    numero_nf: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Número da nota fiscal — obrigatório para atestar (US-009 RN-49)",
    )
    data_atesto: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Data e hora do atesto — registrada automaticamente (US-009 RN-48)",
    )
    atestado_por: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", name="fk_ordens_atestado_por"),
        nullable=True,
        comment="FK para o usuário que atestou a nota (US-009 RN-46)",
    )

    # ------------------------------------------------------------------
    # Pipeline financeiro — Liquidação (US-010)
    # ------------------------------------------------------------------

    valor_liquidado: Mapped[Decimal | None] = mapped_column(
        Numeric(15, 2),
        nullable=True,
        comment="Valor liquidado em R$ (US-010 RN-50)",
    )
    data_liquidacao: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Data da liquidação (US-010 RN-50)",
    )

    # ------------------------------------------------------------------
    # Pipeline financeiro — Pagamento (US-010)
    # ------------------------------------------------------------------

    valor_pago: Mapped[Decimal | None] = mapped_column(
        Numeric(15, 2),
        nullable=True,
        comment="Valor pago — pode diferir do liquidado com justificativa (US-010 RN-52)",
    )
    data_pagamento: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Data do pagamento (US-010 RN-51)",
    )
    forma_pagamento: Mapped[FormaPagamentoEnum | None] = mapped_column(
        forma_pagamento_type,
        nullable=True,
        comment="Forma de pagamento: transferencia, cheque ou pix (US-010 RN-51)",
    )

    # ------------------------------------------------------------------
    # Timestamps
    # ------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp de criação da ordem (TIMESTAMPTZ) — US-003 RN-14",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp da última atualização (TIMESTAMPTZ)",
    )

    # ------------------------------------------------------------------
    # Relacionamentos (lazy='noload' — carregados explicitamente quando necessário)
    # ------------------------------------------------------------------

    secretaria: Mapped["Secretaria"] = relationship(
        "Secretaria",
        lazy="noload",
        foreign_keys=[secretaria_id],
    )
    criador: Mapped["User"] = relationship(
        "User",
        lazy="noload",
        foreign_keys=[criado_por],
    )
    atestador: Mapped["User | None"] = relationship(
        "User",
        lazy="noload",
        foreign_keys=[atestado_por],
    )
    notifications: Mapped[list["NotificationLog"]] = relationship(  # type: ignore[name-defined]
        "NotificationLog",
        back_populates="ordem",
        lazy="noload",
    )
    # US-015: documentos anexados a esta ordem (PDF, JPEG, PNG)
    documentos: Mapped[list["OrdemDocumento"]] = relationship(
        "OrdemDocumento",
        back_populates="ordem",
        lazy="noload",
        foreign_keys="OrdemDocumento.ordem_id",
        order_by="OrdemDocumento.created_at",
    )

    # ------------------------------------------------------------------
    # Índices — CLAUDE.md §8: índices obrigatórios
    # ------------------------------------------------------------------

    __table_args__ = (
        # Index composto conforme CLAUDE.md §8
        Index("idx_ordens_secretaria_id_status", "secretaria_id", "status"),
        Index("idx_ordens_status", "status"),
        Index("idx_ordens_created_at", "created_at"),
        Index("idx_ordens_criado_por", "criado_por"),
        # protocolo tem unique=True → index automático no PostgreSQL
    )

    def __repr__(self) -> str:
        return (
            f"<Ordem id={self.id} protocolo={self.protocolo!r} status={self.status}>"
        )
