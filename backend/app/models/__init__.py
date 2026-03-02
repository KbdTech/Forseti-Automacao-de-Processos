"""Models SQLAlchemy do sistema de gestão de OS e Compras Públicas.

Importar este módulo garante que todos os models sejam registrados
no Base.metadata antes de execução de migrations Alembic.

Ordem de importação respeita dependências de FK:
  1. enums               (sem dependências — apenas tipos Python/SQLAlchemy)
  2. secretaria          (sem FKs externas)
  3. user                (FK → secretaria)
  4. audit               (FK → user)
  5. fornecedor          (FK → secretaria) — S11.1
  6. fornecedor_documento (FK → fornecedor, user) — S12.2
  7. ordem               (FK → secretaria, user, fornecedor)
  8. ordem_historico     (FK → ordem, user)
  9. notification        (FK → ordem, user) — US-014
  10. documento           (FK → ordem, user) — US-015
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
from app.models.fornecedor import Fornecedor  # noqa: F401  — S11.1
from app.models.fornecedor_documento import FornecedorDocumento  # noqa: F401  — S12.2
from app.models.ordem import Ordem  # noqa: F401
from app.models.ordem_historico import OrdemHistorico  # noqa: F401
from app.models.notification import (  # noqa: F401
    NotificationLog,
    NotificationStatusEnum,
    UserNotificationPrefs,
)
from app.models.documento import OrdemDocumento  # noqa: F401  — US-015

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
    # Sprint 6 — US-014
    "NotificationLog",
    "NotificationStatusEnum",
    "UserNotificationPrefs",
    # Sprint 7 — US-015
    "OrdemDocumento",
    # Sprint 11 — S11.1
    "Fornecedor",
    # Sprint 12 — S12.2
    "FornecedorDocumento",
]
