"""ENUMs PostgreSQL nativos — Sprint 2 (US-003 a US-010).

Centralizados aqui para evitar dependências circulares entre models.
Importados por ordem.py e ordem_historico.py.

Cada ENUM segue o padrão do projeto:
  - Classe Python: str + enum.Enum  (permite comparação direta com strings)
  - Tipo SQLAlchemy: SAEnum(Classe, name="...", create_type=False)
    create_type=False → o ENUM é criado/removido manualmente na migration Alembic
    (compatível com asyncpg — evita conflito com prepared statement protocol).

US-003: TipoOrdemEnum, PrioridadeEnum, StatusOrdemEnum
US-006: StatusOrdemEnum (todos os 13 estados da máquina de estados)
US-010: FormaPagamentoEnum
"""

import enum

from sqlalchemy import Enum as SAEnum


# ---------------------------------------------------------------------------
# TipoOrdemEnum
# ---------------------------------------------------------------------------


class TipoOrdemEnum(str, enum.Enum):
    """Tipo de demanda de cada ordem — US-003 RN-16.

    US-003 RN-16: tipo é campo obrigatório na criação da ordem.
    """

    compra = "compra"
    servico = "servico"
    obra = "obra"


# Tipo SQLAlchemy que referencia o ENUM nativo do PostgreSQL.
tipo_ordem_type = SAEnum(
    TipoOrdemEnum,
    name="tipo_ordem",
    create_type=False,
)


# ---------------------------------------------------------------------------
# PrioridadeEnum
# ---------------------------------------------------------------------------


class PrioridadeEnum(str, enum.Enum):
    """Nível de urgência da ordem — US-003 RN-17.

    US-003 RN-17: prioridade é campo obrigatório na criação da ordem.
    """

    normal = "normal"
    alta = "alta"
    urgente = "urgente"


prioridade_type = SAEnum(
    PrioridadeEnum,
    name="prioridade",
    create_type=False,
)


# ---------------------------------------------------------------------------
# StatusOrdemEnum — 13 estados da máquina de estados (CLAUDE.md §6)
# ---------------------------------------------------------------------------


class StatusOrdemEnum(str, enum.Enum):
    """Estados do ciclo de vida de uma ordem de serviço/compra.

    Diagrama de transições completo em CLAUDE.md §6.
    Terminal states: PAGA (US-010 RN-53), CANCELADA (US-005 RN-29).
    """

    AGUARDANDO_GABINETE = "AGUARDANDO_GABINETE"
    AGUARDANDO_CONTROLADORIA = "AGUARDANDO_CONTROLADORIA"
    DEVOLVIDA_PARA_ALTERACAO = "DEVOLVIDA_PARA_ALTERACAO"
    COM_IRREGULARIDADE = "COM_IRREGULARIDADE"
    AGUARDANDO_DOCUMENTACAO = "AGUARDANDO_DOCUMENTACAO"
    AGUARDANDO_EMPENHO = "AGUARDANDO_EMPENHO"
    AGUARDANDO_EXECUCAO = "AGUARDANDO_EXECUCAO"
    AGUARDANDO_ATESTO = "AGUARDANDO_ATESTO"
    EXECUCAO_COM_PENDENCIA = "EXECUCAO_COM_PENDENCIA"
    AGUARDANDO_LIQUIDACAO = "AGUARDANDO_LIQUIDACAO"
    AGUARDANDO_PAGAMENTO = "AGUARDANDO_PAGAMENTO"
    PAGA = "PAGA"
    CANCELADA = "CANCELADA"


status_ordem_type = SAEnum(
    StatusOrdemEnum,
    name="status_ordem",
    create_type=False,
)


# ---------------------------------------------------------------------------
# FormaPagamentoEnum
# ---------------------------------------------------------------------------


class FormaPagamentoEnum(str, enum.Enum):
    """Forma de pagamento da ordem — US-010 RN-51.

    US-010 RN-51: formas aceitas: transferência bancária, cheque ou PIX.
    """

    transferencia = "transferencia"
    cheque = "cheque"
    pix = "pix"


forma_pagamento_type = SAEnum(
    FormaPagamentoEnum,
    name="forma_pagamento",
    create_type=False,
)
