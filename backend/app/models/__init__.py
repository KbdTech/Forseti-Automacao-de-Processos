"""Models SQLAlchemy do sistema de gestão de OS e Compras Públicas.

Importar este módulo garante que todos os models sejam registrados
no Base.metadata antes de execução de migrations Alembic.

Ordem de importação respeita dependências de FK:
  1. secretaria (sem FKs externas)
  2. user (FK → secretaria)
  3. audit (FK → user)
"""

from app.models.secretaria import Secretaria  # noqa: F401
from app.models.user import RoleChangeLog, RoleEnum, User  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401

__all__ = [
    "Secretaria",
    "RoleEnum",
    "User",
    "RoleChangeLog",
    "AuditLog",
]
