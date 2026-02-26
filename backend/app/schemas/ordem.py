"""Schemas Pydantic v2 para o recurso Ordem — US-003 a US-010.

Mapeamento de uso:
  OrdemCreate          → POST /api/ordens
  OrdemUpdate          → PUT  /api/ordens/:id  (apenas DEVOLVIDA_PARA_ALTERACAO)
  OrdemResponse        → Resposta padrão de uma ordem (campos do model + nomes desnormalizados)
  OrdemDetailResponse  → GET  /api/ordens/:id  (OrdemResponse + histórico)
  OrdemListResponse    → GET  /api/ordens       (paginado)
  OrdemHistoricoResponse → item da lista de histórico

  AcaoRequest          → PATCH /api/ordens/:id/acao (genérico)
  EmpenhoRequest       → ação "empenhar"    (US-008)
  AtesteRequest        → ação "atestar"     (US-009)
  LiquidacaoRequest    → ação "liquidar"    (US-010)
  PagamentoRequest     → ação "pagar"       (US-010)
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Literais sincronizados com os ENUMs PostgreSQL (enums.py / migration)
# ---------------------------------------------------------------------------

TipoLiteral = Literal["compra", "servico", "obra"]
PrioridadeLiteral = Literal["normal", "alta", "urgente"]
FormaPagamentoLiteral = Literal["transferencia", "cheque", "pix"]


# ===========================================================================
# Schemas de ENTRADA (request)
# ===========================================================================


class OrdemCreate(BaseModel):
    """Payload para criação de nova ordem — POST /api/ordens.

    US-003 RN-16: tipo é obrigatório (compra, servico, obra).
    US-003 RN-17: prioridade é obrigatória (normal, alta, urgente).
    US-003 RN-18: valor_estimado deve ser positivo.
    US-003 RN-19: justificativa mínima de 50 caracteres.
    """

    model_config = ConfigDict(from_attributes=True)

    tipo: Annotated[
        TipoLiteral,
        Field(description="Tipo de demanda: compra, servico ou obra."),
    ]
    prioridade: Annotated[
        PrioridadeLiteral,
        Field(description="Nível de urgência: normal, alta ou urgente."),
    ]
    responsavel: Annotated[
        str,
        Field(
            min_length=2,
            max_length=255,
            description="Nome do servidor responsável pela execução da demanda.",
        ),
    ]
    descricao: Annotated[
        str,
        Field(
            min_length=10,
            description="Descrição detalhada da demanda.",
        ),
    ]
    valor_estimado: Annotated[
        Decimal,
        Field(
            gt=0,
            description="Valor estimado em R$ — deve ser positivo (US-003 RN-18).",
            json_schema_extra={"example": "1500.00"},
        ),
    ]
    justificativa: Annotated[
        str,
        Field(
            min_length=50,
            description="Justificativa da demanda — mínimo 50 caracteres (US-003 RN-19).",
        ),
    ]


class OrdemUpdate(BaseModel):
    """Payload para edição de ordem devolvida — PUT /api/ordens/:id.

    Todos os campos são opcionais (PATCH semântico).
    Apenas ordens com status DEVOLVIDA_PARA_ALTERACAO podem ser editadas.
    Os campos secretaria e protocolo NÃO são editáveis (US-006 RN-33).

    US-006 RN-32: somente ordens devolvidas podem ser editadas.
    US-006 RN-33: protocolo e secretaria permanecem inalterados.
    """

    model_config = ConfigDict(from_attributes=True)

    prioridade: Annotated[
        PrioridadeLiteral | None,
        Field(default=None, description="Novo nível de urgência."),
    ]
    responsavel: Annotated[
        str | None,
        Field(
            default=None,
            min_length=2,
            max_length=255,
            description="Nome atualizado do responsável.",
        ),
    ]
    descricao: Annotated[
        str | None,
        Field(
            default=None,
            min_length=10,
            description="Descrição atualizada da demanda.",
        ),
    ]
    valor_estimado: Annotated[
        Decimal | None,
        Field(
            default=None,
            gt=0,
            description="Valor estimado atualizado em R$.",
            json_schema_extra={"example": "1800.00"},
        ),
    ]
    justificativa: Annotated[
        str | None,
        Field(
            default=None,
            min_length=50,
            description="Justificativa atualizada — mínimo 50 caracteres.",
        ),
    ]


# ---------------------------------------------------------------------------
# Ações de workflow (PATCH /api/ordens/:id/acao)
# ---------------------------------------------------------------------------


class AcaoRequest(BaseModel):
    """Payload base para todas as ações de workflow.

    Subclasses especializam campos obrigatórios por ação.
    PATCH /api/ordens/:id/acao
    """

    model_config = ConfigDict(from_attributes=True)

    acao: Annotated[
        str,
        Field(description="Identificador da ação (autorizar, empenhar, pagar, etc.)."),
    ]
    observacao: Annotated[
        str | None,
        Field(
            default=None,
            description=(
                "Observação sobre a ação — obrigatória em algumas transições "
                "(solicitar_alteracao, cancelar, irregularidade, recusar_atesto)."
            ),
        ),
    ]


class EmpenhoRequest(AcaoRequest):
    """Payload para ação 'empenhar' — Contabilidade (US-008).

    US-008 RN-42: numero_empenho único no sistema.
    US-008 RN-45: valor_empenhado pode diferir do valor estimado.
    """

    acao: Annotated[
        Literal["empenhar"],
        Field(default="empenhar", description="Ação fixa: 'empenhar'."),
    ] = "empenhar"

    numero_empenho: Annotated[
        str,
        Field(
            min_length=1,
            max_length=50,
            description="Número único do empenho orçamentário (US-008 RN-42).",
        ),
    ]
    valor_empenhado: Annotated[
        Decimal,
        Field(
            gt=0,
            description="Valor empenhado em R$ — pode diferir do estimado (US-008 RN-45).",
            json_schema_extra={"example": "1500.00"},
        ),
    ]


class AtesteRequest(AcaoRequest):
    """Payload para ação 'atestar' — Secretaria (US-009).

    US-009 RN-49: número da nota fiscal obrigatório.
    US-009 RN-46: atesto somente pela secretaria responsável.
    """

    numero_nf: Annotated[
        str,
        Field(
            min_length=1,
            max_length=50,
            description="Número da nota fiscal — obrigatório para atestar (US-009 RN-49).",
        ),
    ]


class LiquidacaoRequest(AcaoRequest):
    """Payload para ação 'liquidar' — Contabilidade (US-010).

    US-010 RN-50: registrar data e valor liquidado.
    """

    acao: Annotated[
        Literal["liquidar"],
        Field(default="liquidar", description="Ação fixa: 'liquidar'."),
    ] = "liquidar"

    valor_liquidado: Annotated[
        Decimal,
        Field(
            gt=0,
            description="Valor liquidado em R$ (US-010 RN-50).",
            json_schema_extra={"example": "1500.00"},
        ),
    ]
    data_liquidacao: Annotated[
        date,
        Field(description="Data da liquidação (YYYY-MM-DD) (US-010 RN-50)."),
    ]


class PagamentoRequest(AcaoRequest):
    """Payload para ação 'pagar' — Tesouraria (US-010).

    US-010 RN-51: data, valor pago e forma de pagamento obrigatórios.
    US-010 RN-52: valor pago pode diferir do liquidado com justificativa.
    US-010 RN-53: após PAGA, ordem é somente-leitura.
    """

    acao: Annotated[
        Literal["pagar"],
        Field(default="pagar", description="Ação fixa: 'pagar'."),
    ] = "pagar"

    valor_pago: Annotated[
        Decimal,
        Field(
            gt=0,
            description=(
                "Valor pago em R$ — pode diferir do liquidado com justificativa "
                "(US-010 RN-52)."
            ),
            json_schema_extra={"example": "1500.00"},
        ),
    ]
    data_pagamento: Annotated[
        date,
        Field(description="Data do pagamento (YYYY-MM-DD) (US-010 RN-51)."),
    ]
    forma_pagamento: Annotated[
        FormaPagamentoLiteral,
        Field(
            description="Forma de pagamento: transferencia, cheque ou pix (US-010 RN-51).",
        ),
    ]


# ===========================================================================
# Schemas de SAÍDA (response)
# ===========================================================================


class OrdemHistoricoResponse(BaseModel):
    """Item do histórico de tramitação de uma ordem.

    US-004 RN-22: histórico em ordem cronológica (created_at ASC).
    US-012 RN-61: campos auditáveis: acao, status, perfil, usuario, ip, created_at.
    """

    model_config = ConfigDict(from_attributes=True)

    id: Annotated[uuid.UUID, Field(description="Identificador único do registro.")]
    acao: Annotated[str, Field(description="Ação executada (criar, autorizar, etc.).")]
    status_anterior: Annotated[
        str | None,
        Field(description="Status antes da transição (None na criação)."),
    ]
    status_novo: Annotated[str, Field(description="Status após a transição.")]
    observacao: Annotated[
        str | None,
        Field(description="Observação do usuário sobre a ação."),
    ]
    usuario_nome: Annotated[
        str,
        Field(description="Nome completo do usuário que executou a ação."),
    ]
    perfil: Annotated[
        str,
        Field(description="Perfil do usuário no momento da ação (US-012 RN-61)."),
    ]
    created_at: Annotated[
        datetime,
        Field(description="Timestamp da tramitação (TIMESTAMPTZ)."),
    ]


class OrdemResponse(BaseModel):
    """Representação completa de uma ordem — retornada em criação, listagem e detalhe.

    Inclui campos desnormalizados (secretaria_nome, criador_nome) para
    evitar chamadas adicionais no front-end.
    """

    model_config = ConfigDict(from_attributes=True)

    # Identificação
    id: Annotated[uuid.UUID, Field(description="UUID da ordem.")]
    protocolo: Annotated[
        str,
        Field(description="Protocolo único no padrão OS-ANO-SEQUENCIAL (US-003 RN-13)."),
    ]

    # Dados da demanda
    tipo: Annotated[str, Field(description="Tipo: compra, servico ou obra.")]
    prioridade: Annotated[str, Field(description="Prioridade: normal, alta ou urgente.")]
    responsavel: Annotated[str, Field(description="Nome do servidor responsável.")]
    descricao: Annotated[str, Field(description="Descrição detalhada da demanda.")]
    valor_estimado: Annotated[Decimal, Field(description="Valor estimado em R$.")]
    justificativa: Annotated[str, Field(description="Justificativa da demanda.")]

    # Origem
    secretaria_id: Annotated[uuid.UUID, Field(description="UUID da secretaria de origem.")]
    secretaria_nome: Annotated[
        str,
        Field(description="Nome da secretaria de origem (desnormalizado)."),
    ]
    criado_por: Annotated[uuid.UUID, Field(description="UUID do usuário criador.")]
    criador_nome: Annotated[
        str,
        Field(description="Nome completo do criador (desnormalizado)."),
    ]

    # Máquina de estados
    status: Annotated[str, Field(description="Status atual da ordem.")]
    versao: Annotated[int, Field(description="Versão — incrementada a cada reenvio.")]

    # Pipeline financeiro — Empenho (US-008)
    numero_empenho: Annotated[
        str | None,
        Field(default=None, description="Número do empenho orçamentário."),
    ]
    valor_empenhado: Annotated[
        Decimal | None,
        Field(default=None, description="Valor empenhado em R$."),
    ]
    data_empenho: Annotated[
        datetime | None,
        Field(default=None, description="Data do empenho."),
    ]

    # Pipeline financeiro — Atesto (US-009)
    numero_nf: Annotated[
        str | None,
        Field(default=None, description="Número da nota fiscal."),
    ]
    data_atesto: Annotated[
        datetime | None,
        Field(default=None, description="Data e hora do atesto."),
    ]
    atestado_por: Annotated[
        uuid.UUID | None,
        Field(default=None, description="UUID do usuário que atestou."),
    ]

    # Pipeline financeiro — Liquidação (US-010)
    valor_liquidado: Annotated[
        Decimal | None,
        Field(default=None, description="Valor liquidado em R$."),
    ]
    data_liquidacao: Annotated[
        datetime | None,
        Field(default=None, description="Data da liquidação."),
    ]

    # Pipeline financeiro — Pagamento (US-010)
    valor_pago: Annotated[
        Decimal | None,
        Field(default=None, description="Valor pago em R$."),
    ]
    data_pagamento: Annotated[
        datetime | None,
        Field(default=None, description="Data do pagamento."),
    ]
    forma_pagamento: Annotated[
        str | None,
        Field(default=None, description="Forma de pagamento: transferencia, cheque ou pix."),
    ]

    # Timestamps
    created_at: Annotated[datetime, Field(description="Timestamp de criação.")]
    updated_at: Annotated[datetime, Field(description="Timestamp da última atualização.")]


class OrdemDetailResponse(OrdemResponse):
    """Detalhe completo de uma ordem com histórico de tramitação.

    GET /api/ordens/:id

    US-004 RN-22: histórico em ordem cronológica (created_at ASC).
    """

    historico: Annotated[
        list[OrdemHistoricoResponse],
        Field(
            default_factory=list,
            description="Histórico completo de tramitação, ordem cronológica (US-004 RN-22).",
        ),
    ]


class OrdemListResponse(BaseModel):
    """Resposta paginada da listagem de ordens.

    US-004 RN-24: paginação padrão de 20 registros por página.
    """

    model_config = ConfigDict(from_attributes=True)

    items: Annotated[
        list[OrdemResponse],
        Field(description="Ordens da página atual."),
    ]
    total: Annotated[
        int,
        Field(description="Total de registros com os filtros aplicados."),
    ]
    page: Annotated[
        int,
        Field(description="Página atual (1-based)."),
    ]
    limit: Annotated[
        int,
        Field(description="Registros por página."),
    ]
