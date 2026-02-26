"""Models SQLAlchemy do sistema de gestão de OS e Compras Públicas.

Importar este módulo garante que todos os models sejam registrados
no Base.metadata antes de execução de migrations Alembic.

Ordem de importação respeita dependências de FK:
  1. enums      (sem dependências — apenas tipos Python/SQLAlchemy)
  2. secretaria (sem FKs externas)
  3. user       (FK → secretaria)
  4. audit      (FK → user)
  5. ordem      (FK → secretaria, user)
  6. ordem_historico (FK → ordem, user)
"""

from app.models.enums import (  # noqa: F401
    FormaPagamentoEnum,
    PrioridadeEnum,
    StatusOrdemEnum,
    TipoOrdemEnum,
)
from app.models.secretaria import Secretaria  # noqa: F401
from app.models.user import RoleChangeLog, RoleEnum, User  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401
from app.models.ordem import Ordem  # noqa: F401
from app.models.ordem_historico import OrdemHistorico  # noqa: F401

__all__ = [
    # ENUMs Sprint 2
    "TipoOrdemEnum",
    "PrioridadeEnum",
    "StatusOrdemEnum",
    "FormaPagamentoEnum",
    # Sprint 1
    "Secretaria",
    "RoleEnum",
    "User",
    "RoleChangeLog",
    "AuditLog",
    # Sprint 2
    "Ordem",
    "OrdemHistorico",
]
