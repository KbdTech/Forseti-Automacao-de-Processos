"""Model SQLAlchemy para logs de auditoria do sistema.

Tabela: audit_logs

US-001 RN-6: todas as tentativas de login (sucesso e falha) registradas.
US-012 RN-60: log de auditoria é append-only — nenhum registro pode ser
              alterado ou deletado.
US-012 RN-64: logs de acesso ao sistema armazenados separadamente de
              ordem_historico.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import INET, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditLog(Base):
    """Log imutável de ações de acesso e sistema.

    Registra eventos de autenticação e ações críticas de sistema
    (LOGIN, LOGOUT, LOGIN_FAILED, ROLE_CHANGED, etc.).

    US-001 RN-6: toda tentativa de login deve ser registrada aqui.
    US-012 RN-61: cada entrada contém: user_id, action, ip_address,
                  user_agent, created_at.
    US-012 RN-64: logs de acesso armazenados separadamente de ordem_historico.

    CRÍTICO: Esta tabela é append-only.
             NUNCA executar UPDATE ou DELETE nesta tabela.
    """

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador único (UUID v4)",
    )
    # nullable=True pois LOGIN_FAILED pode ser de usuário inexistente
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        comment="FK para o usuário que realizou a ação (NULL se usuário não encontrado)",
    )
    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment=(
            "Ação auditada: LOGIN, LOGOUT, LOGIN_FAILED, "
            "PASSWORD_CHANGED, ACCOUNT_LOCKED, ROLE_CHANGED"
        ),
    )
    # Endereço IP do cliente — tipo INET nativo do PostgreSQL
    ip_address: Mapped[str | None] = mapped_column(
        INET,
        nullable=True,
        comment="Endereço IP do cliente (tipo INET do PostgreSQL)",
    )
    user_agent: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="User-Agent do cliente HTTP",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp do evento (TIMESTAMPTZ) — nunca alterar",
    )

    # ------------------------------------------------------------------
    # Relacionamentos
    # ------------------------------------------------------------------

    user: Mapped["User | None"] = relationship(
        "User",
        back_populates="audit_logs",
        lazy="noload",
    )

    # ------------------------------------------------------------------
    # Índices — conforme requisito do CLAUDE.md
    # ------------------------------------------------------------------

    __table_args__ = (
        Index("idx_audit_logs_user_id", "user_id"),
        Index("idx_audit_logs_action", "action"),
        Index("idx_audit_logs_created_at", "created_at"),
        # Índice composto para consultas por usuário + período
        Index("idx_audit_logs_user_id_created_at", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} action={self.action!r} "
            f"user_id={self.user_id}>"
        )
