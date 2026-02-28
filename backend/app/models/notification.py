"""Modelos de notificações — US-014.

Tabelas:
  notification_log         — registro imutável de cada e-mail disparado (append-only)
  user_notification_prefs  — preferências do usuário: quais eventos quer receber

US-014 RN-69: disparos assíncronos (fila) — não impacta resposta da API.
US-014 RN-72: falha no envio não bloqueia transição de status.
US-014 RN-73: usuário pode desativar notificações por evento.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func, text

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enum de status de envio
# ---------------------------------------------------------------------------


class NotificationStatusEnum(str, enum.Enum):
    """Status de cada tentativa de envio de e-mail.

    US-014 RN-72: falha registrada mas não bloqueia o fluxo.
    """

    enviado = "enviado"
    falhou = "falhou"


notification_status_type = SAEnum(
    NotificationStatusEnum,
    name="notification_status",
    create_type=False,
)


# ---------------------------------------------------------------------------
# NotificationLog — append-only, nunca UPDATE/DELETE
# ---------------------------------------------------------------------------


class NotificationLog(Base):
    """Registro imutável de cada tentativa de envio de e-mail.

    US-014 RN-69: log de todas as notificações disparadas.
    US-014 RN-72: status 'falhou' registrado quando o envio falha.
    """

    __tablename__ = "notification_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    ordem_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ordens.id", ondelete="SET NULL"),
        nullable=True,
    )
    evento: Mapped[str] = mapped_column(String(100), nullable=False)
    destinatario: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[NotificationStatusEnum] = mapped_column(
        notification_status_type,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relacionamentos
    ordem: Mapped["Ordem | None"] = relationship("Ordem", back_populates="notifications", lazy="noload")  # type: ignore[name-defined]


# ---------------------------------------------------------------------------
# UserNotificationPrefs — preferências por evento
# ---------------------------------------------------------------------------


class UserNotificationPrefs(Base):
    """Preferência de notificação do usuário por tipo de evento.

    US-014 RN-73: usuário pode configurar quais eventos receber.
    Padrão: ativo=True para todos os eventos (opt-out model).
    """

    __tablename__ = "user_notification_prefs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    evento: Mapped[str] = mapped_column(String(100), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Constraint: cada usuário só tem uma preferência por evento
    __table_args__ = (UniqueConstraint("user_id", "evento", name="uq_user_notification_pref"),)

    # Relacionamento
    user: Mapped["User"] = relationship("User", back_populates="notification_prefs", lazy="noload")  # type: ignore[name-defined]
