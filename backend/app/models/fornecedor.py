"""Model SQLAlchemy para Fornecedor (empresa vencedora de licitação).

Tabela: fornecedores

S11.1: fundação do módulo de fornecedores — armazena empresas vencedoras de
licitação e seus dados bancários, vinculadas ou não a uma secretaria específica.

Scoping:
  secretaria_id IS NULL  → fornecedor global (visível a todos os perfis)
  secretaria_id = X      → fornecedor exclusivo da secretaria X
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.secretaria import Secretaria
    from app.models.ordem import Ordem


class Fornecedor(Base):
    """Empresa vencedora de licitação municipal.

    S11.1: campos de identificação fiscal, dados contratuais e dados bancários.
    secretaria_id nullable: NULL = global; preenchido = exclusivo da secretaria.
    is_active controla visibilidade no Select da Nova Ordem (novas ordens só
    veem fornecedores ativos).
    """

    __tablename__ = "fornecedores"

    # ------------------------------------------------------------------
    # Identificação
    # ------------------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador único (UUID v4)",
    )

    # ------------------------------------------------------------------
    # Dados cadastrais
    # ------------------------------------------------------------------

    razao_social: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Razão social completa da empresa",
    )
    nome_fantasia: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Nome fantasia (opcional)",
    )
    cnpj: Mapped[str] = mapped_column(
        String(14),
        nullable=False,
        comment="CNPJ sem pontuação — exatamente 14 dígitos numéricos",
    )

    # ------------------------------------------------------------------
    # Dados do processo licitatório
    # ------------------------------------------------------------------

    numero_processo: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="Número do processo licitatório",
    )
    objeto_contrato: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Objeto resumido do contrato",
    )
    valor_contratado: Mapped[Decimal | None] = mapped_column(
        Numeric(15, 2),
        nullable=True,
        comment="Valor total do contrato em R$",
    )
    data_contrato: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
        comment="Data de assinatura do contrato",
    )

    # ------------------------------------------------------------------
    # Dados bancários (para pré-preenchimento no pagamento — S12.1)
    # ------------------------------------------------------------------

    banco: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="Nome do banco",
    )
    agencia: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="Número da agência",
    )
    conta: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
        comment="Número da conta",
    )
    tipo_conta: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="corrente",
        server_default=text("'corrente'"),
        comment="Tipo da conta: corrente ou poupanca",
    )

    # ------------------------------------------------------------------
    # Vínculo com secretaria
    # ------------------------------------------------------------------

    secretaria_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("secretarias.id", ondelete="SET NULL", name="fk_fornecedores_secretaria_id"),
        nullable=True,
        comment="NULL = fornecedor global; preenchido = exclusivo da secretaria",
    )

    # ------------------------------------------------------------------
    # Controle
    # ------------------------------------------------------------------

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
        comment="Inativo = não aparece nas listagens de seleção em novas ordens",
    )

    # ------------------------------------------------------------------
    # Timestamps
    # ------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp de criação (TIMESTAMPTZ)",
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

    secretaria: Mapped["Secretaria | None"] = relationship(
        "Secretaria",
        lazy="noload",
        foreign_keys=[secretaria_id],
    )
    ordens: Mapped[list["Ordem"]] = relationship(
        "Ordem",
        back_populates="fornecedor",
        lazy="noload",
    )

    # ------------------------------------------------------------------
    # Constraints e índices
    # ------------------------------------------------------------------

    __table_args__ = (
        UniqueConstraint("cnpj", name="uq_fornecedores_cnpj"),
        Index("idx_fornecedores_cnpj", "cnpj"),
        Index("idx_fornecedores_secretaria", "secretaria_id"),
        Index("idx_fornecedores_is_active", "is_active"),
    )

    def __repr__(self) -> str:
        return (
            f"<Fornecedor id={self.id} cnpj={self.cnpj!r} razao_social={self.razao_social!r}>"
        )
