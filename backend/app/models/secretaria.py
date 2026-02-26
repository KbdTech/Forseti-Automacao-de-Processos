"""Model SQLAlchemy para Secretaria Municipal.

Tabela: secretarias
US-003: Criação de ordens vincula secretaria automaticamente.
US-013: CRUD de secretarias pelo Administrador.

NOTA: Esta tabela é criada na migration 001 como dependência de FK para
      a tabela users (users.secretaria_id → secretarias.id).
      A lógica de negócio completa é implementada em US-003/US-013.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Secretaria(Base):
    """Secretaria municipal que origina ordens de serviço.

    US-013 RN-65: nome e sigla devem ser únicos no sistema.
    US-013 RN-66: secretaria desativada mantém histórico (ativo=False).
    US-013 RN-68: não é possível excluir — apenas desativar.
    """

    __tablename__ = "secretarias"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador único (UUID v4)",
    )
    nome: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        comment="Nome completo da secretaria (único no sistema)",
    )
    sigla: Mapped[str] = mapped_column(
        String(5),
        unique=True,
        nullable=False,
        comment="Sigla da secretaria, máx. 5 caracteres (única no sistema)",
    )
    orcamento_anual: Mapped[float | None] = mapped_column(
        Numeric(15, 2),
        nullable=True,
        comment="Orçamento anual em R$ — editável pelo Admin a qualquer momento",
    )
    ativo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("TRUE"),
        comment="FALSE = desativada (não recebe novas ordens, mantém histórico)",
    )
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
