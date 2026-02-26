"""Models SQLAlchemy para usuários e controle de acesso.

Tabelas: users, role_change_log
ENUM:    role_enum (PostgreSQL native)

US-001: autenticação, bloqueio por tentativas, first_login.
US-002: RBAC, role_change_log para auditoria de alterações de perfil.
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.audit import AuditLog
    from app.models.secretaria import Secretaria


# ---------------------------------------------------------------------------
# ENUM de perfis de acesso
# ---------------------------------------------------------------------------

class RoleEnum(str, enum.Enum):
    """Perfis de acesso disponíveis no sistema.

    US-002 RN-7: perfis disponíveis: secretaria, gabinete, controladoria,
                 contabilidade, tesouraria, admin.
    US-002 RN-8: um usuário pode ter somente um perfil ativo por vez.
    """

    secretaria = "secretaria"
    gabinete = "gabinete"
    controladoria = "controladoria"
    contabilidade = "contabilidade"
    tesouraria = "tesouraria"
    admin = "admin"


# Tipo SQLAlchemy que referencia o ENUM nativo do PostgreSQL.
# create_type=False → o ENUM é criado/removido manualmente na migration Alembic.
role_enum_type = SAEnum(
    RoleEnum,
    name="role_enum",
    create_type=False,
)


# ---------------------------------------------------------------------------
# Model: users
# ---------------------------------------------------------------------------

class User(Base):
    """Usuário autenticado do sistema de gestão de OS.

    US-001 RN-1:  login_attempts e locked_until controlam bloqueio (5 tentativas / 15 min).
    US-001 RN-4:  password_hash armazenado com bcrypt (validado no service).
    US-001 RN-5:  first_login=True exige troca de senha no primeiro acesso.
    US-002 RN-7:  role identifica o perfil único do usuário.
    US-002 RN-12: back-end valida role em CADA requisição via get_current_user.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador único (UUID v4)",
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        comment="E-mail institucional — usado como login",
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Hash bcrypt da senha — nunca armazenar senha em texto plano",
    )
    nome_completo: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="Nome completo exibido em históricos e pareceres",
    )
    role: Mapped[RoleEnum] = mapped_column(
        role_enum_type,
        nullable=False,
        comment="Perfil de acesso (role_enum). US-002 RN-8: somente um por vez.",
    )
    # nullable=True para perfis transversais (gabinete, controladoria, etc.)
    # que não pertencem a uma secretaria específica
    secretaria_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("secretarias.id", ondelete="RESTRICT"),
        nullable=True,
        comment="FK para secretaria (nullable para perfis transversais)",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("TRUE"),
        comment="FALSE = conta desativada pelo admin",
    )
    # US-001 RN-5: primeiro acesso exige redefinição de senha
    first_login: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("TRUE"),
        comment="TRUE = deve trocar a senha antes de acessar o sistema",
    )
    # US-001 RN-1: bloqueio por tentativas de login inválidas
    login_attempts: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
        comment="Contador de tentativas de login falhas consecutivas",
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Conta bloqueada até este timestamp (NULL = não bloqueada)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp de criação do usuário (TIMESTAMPTZ)",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp da última atualização (TIMESTAMPTZ)",
    )

    # ------------------------------------------------------------------
    # Relacionamentos
    # ------------------------------------------------------------------

    secretaria: Mapped["Secretaria | None"] = relationship(
        "Secretaria",
        lazy="noload",
    )
    role_changes_received: Mapped[list["RoleChangeLog"]] = relationship(
        "RoleChangeLog",
        foreign_keys="RoleChangeLog.user_id",
        back_populates="user",
        lazy="noload",
    )
    role_changes_given: Mapped[list["RoleChangeLog"]] = relationship(
        "RoleChangeLog",
        foreign_keys="RoleChangeLog.changed_by",
        back_populates="changed_by_user",
        lazy="noload",
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="user",
        lazy="noload",
    )

    # ------------------------------------------------------------------
    # Índices — conforme requisito do CLAUDE.md
    # ------------------------------------------------------------------

    __table_args__ = (
        # email já tem unique=True → index automático no PostgreSQL
        Index("idx_users_role", "role"),
        Index("idx_users_secretaria_id", "secretaria_id"),
        Index("idx_users_is_active", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r} role={self.role}>"


# ---------------------------------------------------------------------------
# Model: role_change_log (append-only)
# ---------------------------------------------------------------------------

class RoleChangeLog(Base):
    """Registro imutável de alterações de perfil de usuários.

    US-002 RN-10: Alterações de perfil devem ser registradas em role_change_log.

    CRÍTICO: Esta tabela é append-only.
             NUNCA executar UPDATE ou DELETE nesta tabela.
    """

    __tablename__ = "role_change_log"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Identificador único (UUID v4)",
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        comment="FK para o usuário que teve o perfil alterado",
    )
    old_role: Mapped[RoleEnum] = mapped_column(
        role_enum_type,
        nullable=False,
        comment="Perfil anterior do usuário",
    )
    new_role: Mapped[RoleEnum] = mapped_column(
        role_enum_type,
        nullable=False,
        comment="Novo perfil atribuído ao usuário",
    )
    changed_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        comment="FK para o admin que realizou a alteração",
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("NOW()"),
        comment="Timestamp da alteração de perfil (TIMESTAMPTZ)",
    )

    # ------------------------------------------------------------------
    # Relacionamentos
    # ------------------------------------------------------------------

    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="role_changes_received",
        lazy="noload",
    )
    changed_by_user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[changed_by],
        back_populates="role_changes_given",
        lazy="noload",
    )

    # ------------------------------------------------------------------
    # Índices — conforme requisito do CLAUDE.md
    # ------------------------------------------------------------------

    __table_args__ = (
        Index("idx_role_change_log_user_id", "user_id"),
        Index("idx_role_change_log_changed_by", "changed_by"),
        Index("idx_role_change_log_changed_at", "changed_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<RoleChangeLog id={self.id} user_id={self.user_id} "
            f"{self.old_role}→{self.new_role}>"
        )
