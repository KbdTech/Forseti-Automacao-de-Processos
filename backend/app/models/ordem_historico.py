"""Model SQLAlchemy para histórico de tramitação das ordens.

Tabela: ordem_historico

Registra cada transição de status da ordem: quem fez, qual ação,
status anterior/novo, observação e IP.

CRÍTICO: Esta tabela é APPEND-ONLY.
         NUNCA executar UPDATE ou DELETE nesta tabela.

US-004 RN-22: histórico disponível em ordem cronológica.
US-012 RN-60: log append-only — nenhum registro pode ser alterado.
US-012 RN-61: campos obrigatórios: ordem_id, usuario_id, perfil, acao,
              status_anterior, status_novo, observacao, ip_address, created_at.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import StatusOrdemEnum, status_ordem_type

if TYPE_CHECKING:
    from app.models.ordem import Ordem
    from app.models.user import User


class OrdemHistorico(Base):
    """Registro imutável de cada transição de estado de uma ordem.

    US-004 RN-22: histórico exibido em ordem cronológica (ordernar por created_at ASC).
    US-012 RN-60: append-only — nenhum campo pode ser alterado após inserção.

    Não possui updated_at: registros são imutáveis por definição.
    """

    __tablename__ = "ordem_historico"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador único (UUID v4)",
    )

    # ------------------------------------------------------------------
    # Referências
    # ------------------------------------------------------------------

    ordem_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("ordens.id", ondelete="RESTRICT", name="fk_historico_ordem_id"),
        nullable=False,
        comment="FK para a ordem tramitada",
    )
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT", name="fk_historico_usuario_id"),
        nullable=False,
        comment="FK para o usuário que executou a ação",
    )

    # ------------------------------------------------------------------
    # Dados da tramitação
    # ------------------------------------------------------------------

    perfil: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Perfil do usuário no momento da ação (US-012 RN-61)",
    )
    acao: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment=(
            "Ação executada: autorizar, devolver, cancelar, aprovar, "
            "empenhar, atestar, liquidar, pagar, etc."
        ),
    )
    # null apenas na criação da ordem (sem status anterior)
    status_anterior: Mapped[StatusOrdemEnum | None] = mapped_column(
        status_ordem_type,
        nullable=True,
        comment="Status antes da transição (NULL na criação — sem estado anterior)",
    )
    status_novo: Mapped[StatusOrdemEnum] = mapped_column(
        status_ordem_type,
        nullable=False,
        comment="Status após a transição",
    )
    observacao: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Observação do usuário sobre a ação (obrigatória em alguns casos)",
    )
    ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
        comment="IP do cliente — String(45) suporta IPv4 e IPv6 (US-012 RN-61)",
    )

    # ------------------------------------------------------------------
    # Timestamp — sem updated_at (registros imutáveis)
    # ------------------------------------------------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        comment="Timestamp da tramitação (TIMESTAMPTZ) — imutável (US-012 RN-60)",
    )

    # ------------------------------------------------------------------
    # Relacionamentos
    # ------------------------------------------------------------------

    ordem: Mapped["Ordem"] = relationship(
        "Ordem",
        lazy="noload",
        foreign_keys=[ordem_id],
    )
    usuario: Mapped["User"] = relationship(
        "User",
        lazy="noload",
        foreign_keys=[usuario_id],
    )

    # ------------------------------------------------------------------
    # Índices — CLAUDE.md §8: índices obrigatórios para histórico
    # ------------------------------------------------------------------

    __table_args__ = (
        # Índice composto: busca histórico de uma ordem em ordem cronológica
        Index("idx_historico_ordem_id_created_at", "ordem_id", "created_at"),
        Index("idx_historico_usuario_id", "usuario_id"),
        Index("idx_historico_created_at", "created_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<OrdemHistorico id={self.id} ordem_id={self.ordem_id} "
            f"acao={self.acao!r} {self.status_anterior}→{self.status_novo}>"
        )
