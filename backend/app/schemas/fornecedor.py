"""Schemas Pydantic v2 para o recurso Fornecedor — S11.1.

Mapeamento de uso:
  FornecedorCreate          → POST /api/fornecedores
  FornecedorUpdate          → PUT  /api/fornecedores/{id}
  FornecedorStatusUpdate    → PATCH /api/fornecedores/{id}/status
  FornecedorResponse        → Resposta padrão
  FornecedorListResponse    → GET /api/fornecedores (paginado)
  FornecedorResumoResponse  → GET /api/fornecedores/{id}/resumo (detalhe com gastos)
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FornecedorCreate(BaseModel):
    """Payload para cadastro de novo fornecedor — POST /api/fornecedores.

    S11.1: apenas admin pode criar fornecedores.
    CNPJ: exatamente 14 dígitos numéricos (sem pontuação).
    secretaria_id nullable: NULL = global; preenchido = exclusivo da secretaria.
    """

    model_config = ConfigDict(from_attributes=True)

    razao_social: Annotated[
        str,
        Field(min_length=2, max_length=255, description="Razão social completa da empresa."),
    ]
    nome_fantasia: Annotated[
        str | None,
        Field(default=None, max_length=255, description="Nome fantasia (opcional)."),
    ] = None
    cnpj: Annotated[
        str,
        Field(
            min_length=14,
            max_length=14,
            description="CNPJ sem pontuação — exatamente 14 dígitos numéricos.",
        ),
    ]
    numero_processo: Annotated[
        str | None,
        Field(default=None, max_length=100, description="Número do processo licitatório."),
    ] = None
    objeto_contrato: Annotated[
        str | None,
        Field(default=None, description="Objeto resumido do contrato."),
    ] = None
    valor_contratado: Annotated[
        Decimal | None,
        Field(default=None, ge=0, description="Valor total do contrato em R$."),
    ] = None
    data_contrato: Annotated[
        date | None,
        Field(default=None, description="Data de assinatura do contrato (YYYY-MM-DD)."),
    ] = None
    banco: Annotated[
        str | None,
        Field(default=None, max_length=100, description="Nome do banco."),
    ] = None
    agencia: Annotated[
        str | None,
        Field(default=None, max_length=20, description="Número da agência."),
    ] = None
    conta: Annotated[
        str | None,
        Field(default=None, max_length=30, description="Número da conta."),
    ] = None
    tipo_conta: Annotated[
        str,
        Field(
            default="corrente",
            pattern="^(corrente|poupanca)$",
            description="Tipo da conta: corrente ou poupanca.",
        ),
    ] = "corrente"
    secretaria_id: Annotated[
        uuid.UUID | None,
        Field(default=None, description="NULL = global; preenchido = exclusivo da secretaria."),
    ] = None

    @field_validator("cnpj")
    @classmethod
    def validar_cnpj(cls, v: str) -> str:
        if not re.fullmatch(r"\d{14}", v):
            raise ValueError("CNPJ deve conter exatamente 14 dígitos numéricos.")
        return v


class FornecedorUpdate(BaseModel):
    """Payload para edição de fornecedor — PUT /api/fornecedores/{id}.

    Todos os campos são opcionais (PATCH semântico).
    CNPJ não é editável após criação.
    """

    model_config = ConfigDict(from_attributes=True)

    razao_social: Annotated[
        str | None,
        Field(default=None, min_length=2, max_length=255, description="Razão social atualizada."),
    ] = None
    nome_fantasia: Annotated[
        str | None,
        Field(default=None, max_length=255, description="Nome fantasia atualizado."),
    ] = None
    numero_processo: Annotated[
        str | None,
        Field(default=None, max_length=100, description="Número do processo atualizado."),
    ] = None
    objeto_contrato: Annotated[
        str | None,
        Field(default=None, description="Objeto do contrato atualizado."),
    ] = None
    valor_contratado: Annotated[
        Decimal | None,
        Field(default=None, ge=0, description="Valor contratado atualizado."),
    ] = None
    data_contrato: Annotated[
        date | None,
        Field(default=None, description="Data do contrato atualizada."),
    ] = None
    banco: Annotated[
        str | None,
        Field(default=None, max_length=100, description="Banco atualizado."),
    ] = None
    agencia: Annotated[
        str | None,
        Field(default=None, max_length=20, description="Agência atualizada."),
    ] = None
    conta: Annotated[
        str | None,
        Field(default=None, max_length=30, description="Conta atualizada."),
    ] = None
    tipo_conta: Annotated[
        str | None,
        Field(
            default=None,
            pattern="^(corrente|poupanca)$",
            description="Tipo de conta atualizado.",
        ),
    ] = None
    secretaria_id: Annotated[
        uuid.UUID | None,
        Field(default=None, description="Secretaria vinculada (NULL = global)."),
    ] = None


class FornecedorStatusUpdate(BaseModel):
    """Payload para ativar/desativar fornecedor — PATCH /api/fornecedores/{id}/status."""

    is_active: Annotated[
        bool,
        Field(description="true para ativar, false para desativar."),
    ]


class FornecedorResponse(BaseModel):
    """Resposta completa de um fornecedor — retornada em criação, listagem e detalhe."""

    model_config = ConfigDict(from_attributes=True)

    id: Annotated[uuid.UUID, Field(description="UUID do fornecedor.")]
    razao_social: Annotated[str, Field(description="Razão social da empresa.")]
    nome_fantasia: Annotated[str | None, Field(default=None, description="Nome fantasia.")]
    cnpj: Annotated[str, Field(description="CNPJ sem pontuação (14 dígitos).")]
    numero_processo: Annotated[str | None, Field(default=None, description="Número do processo.")]
    objeto_contrato: Annotated[str | None, Field(default=None, description="Objeto do contrato.")]
    valor_contratado: Annotated[Decimal | None, Field(default=None, description="Valor contratado.")]
    data_contrato: Annotated[date | None, Field(default=None, description="Data do contrato.")]
    banco: Annotated[str | None, Field(default=None, description="Banco.")]
    agencia: Annotated[str | None, Field(default=None, description="Agência.")]
    conta: Annotated[str | None, Field(default=None, description="Conta.")]
    tipo_conta: Annotated[str, Field(description="Tipo de conta: corrente ou poupanca.")]
    secretaria_id: Annotated[uuid.UUID | None, Field(default=None, description="Secretaria vinculada.")]
    secretaria_nome: Annotated[
        str | None,
        Field(default=None, description="Nome da secretaria vinculada (desnormalizado)."),
    ] = None
    is_active: Annotated[bool, Field(description="Status ativo/inativo.")]
    created_at: Annotated[datetime, Field(description="Timestamp de criação.")]
    updated_at: Annotated[datetime, Field(description="Timestamp da última atualização.")]
    # Calculado no service — soma das ordens PAGA vinculadas (S12.2)
    total_pago: Annotated[
        Decimal,
        Field(default=Decimal(0), description="Total já pago em ordens PAGA vinculadas."),
    ] = Decimal(0)

    @classmethod
    def from_orm_with_secretaria(cls, obj: object) -> "FornecedorResponse":
        """Constrói FornecedorResponse com secretaria_nome desnormalizado."""
        data = cls.model_validate(obj)
        # secretaria_nome derivado do relationship (carregado explicitamente no service)
        secretaria = getattr(obj, "secretaria", None)
        if secretaria is not None:
            data.secretaria_nome = secretaria.nome
        return data


class FornecedorListResponse(BaseModel):
    """Resposta paginada da listagem de fornecedores."""

    model_config = ConfigDict(from_attributes=True)

    items: Annotated[list[FornecedorResponse], Field(description="Fornecedores da página atual.")]
    total: Annotated[int, Field(description="Total de registros com os filtros aplicados.")]
    page: Annotated[int, Field(description="Página atual (1-based).")]
    pages: Annotated[int, Field(description="Total de páginas.")]


# ---------------------------------------------------------------------------
# Resumo financeiro do fornecedor — GET /api/fornecedores/{id}/resumo
# ---------------------------------------------------------------------------


class GastoMes(BaseModel):
    """Gasto de um fornecedor em um mês específico (dados para gráfico de barras)."""

    model_config = ConfigDict(from_attributes=True)

    mes: Annotated[str, Field(description="Mês no formato 'YYYY-MM'.")]
    total_pago: Annotated[Decimal, Field(description="Total pago no mês em R$.")]
    count_ordens: Annotated[int, Field(description="Número de ordens pagas no mês.")]


class OrdemResumoItem(BaseModel):
    """Item resumido de ordem para exibição no detalhe do fornecedor."""

    model_config = ConfigDict(from_attributes=True)

    id: Annotated[uuid.UUID, Field(description="UUID da ordem.")]
    protocolo: Annotated[str, Field(description="Protocolo (OS-ANO-SEQ).")]
    status: Annotated[str, Field(description="Status da ordem.")]
    valor_pago: Annotated[Decimal | None, Field(default=None, description="Valor pago.")]
    data_pagamento: Annotated[date | None, Field(default=None, description="Data do pagamento.")]
    secretaria_nome: Annotated[str | None, Field(default=None, description="Nome da secretaria.")]


class FornecedorResumoResponse(BaseModel):
    """Detalhe completo de um fornecedor com estatísticas de gastos e histórico.

    Retornado por GET /api/fornecedores/{id}/resumo.
    Inclui todos os campos de FornecedorResponse mais métricas financeiras calculadas.
    """

    model_config = ConfigDict(from_attributes=True)

    # Dados cadastrais
    id: Annotated[uuid.UUID, Field(description="UUID do fornecedor.")]
    razao_social: Annotated[str, Field(description="Razão social.")]
    nome_fantasia: Annotated[str | None, Field(default=None, description="Nome fantasia.")]
    cnpj: Annotated[str, Field(description="CNPJ sem pontuação (14 dígitos).")]
    numero_processo: Annotated[str | None, Field(default=None)]
    objeto_contrato: Annotated[str | None, Field(default=None)]
    valor_contratado: Annotated[Decimal | None, Field(default=None)]
    data_contrato: Annotated[date | None, Field(default=None)]
    banco: Annotated[str | None, Field(default=None)]
    agencia: Annotated[str | None, Field(default=None)]
    conta: Annotated[str | None, Field(default=None)]
    tipo_conta: Annotated[str, Field(default="corrente")]
    secretaria_id: Annotated[uuid.UUID | None, Field(default=None)]
    secretaria_nome: Annotated[str | None, Field(default=None)]
    is_active: Annotated[bool, Field()]

    # Estatísticas financeiras
    total_pago: Annotated[Decimal, Field(description="Total já pago em ordens com status PAGA.")]
    total_ordens_pagas: Annotated[int, Field(description="Número de ordens pagas.")]
    saldo_disponivel: Annotated[Decimal, Field(description="Saldo disponível (valor_contratado − total_pago).")]
    percentual_utilizado: Annotated[float, Field(description="Percentual do contrato utilizado (0–100).")]

    # Dados para gráfico de barras mensais
    gastos_por_mes: Annotated[list[GastoMes], Field(default_factory=list)]

    # Últimas ordens pagas (até 10)
    ultimas_ordens: Annotated[list[OrdemResumoItem], Field(default_factory=list)]


# ---------------------------------------------------------------------------
# Documentos de fornecedor — GET/POST /api/fornecedores/{id}/documentos
# ---------------------------------------------------------------------------


class FornecedorDocumentoResponse(BaseModel):
    """Metadados de um documento de fornecedor — nunca expõe storage_path."""

    model_config = ConfigDict(from_attributes=True)

    id: Annotated[uuid.UUID, Field(description="UUID do documento.")]
    fornecedor_id: Annotated[uuid.UUID, Field(description="UUID do fornecedor.")]
    nome_arquivo: Annotated[str, Field(description="Nome original do arquivo.")]
    tipo_mime: Annotated[str, Field(description="MIME type.")]
    tamanho_bytes: Annotated[int, Field(description="Tamanho em bytes.")]
    descricao: Annotated[str | None, Field(default=None, description="Descrição do documento.")]
    uploaded_by: Annotated[uuid.UUID, Field(description="UUID do usuário que fez o upload.")]
    created_at: Annotated[datetime, Field(description="Timestamp do upload.")]


class FornecedorDocumentoDownloadUrl(BaseModel):
    """URL assinada para download de documento do fornecedor."""

    download_url: Annotated[str, Field(description="URL assinada com TTL de 900 segundos.")]
    expires_in: Annotated[int, Field(description="TTL em segundos.")] = 900
