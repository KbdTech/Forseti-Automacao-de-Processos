"""Service de Ordens de Serviço — lógica de negócio US-003 a US-006.

Responsabilidades:
  - Criar nova ordem com protocolo OS-ANO-SEQUENCIAL atômico (US-003)
  - Listar ordens com RBAC scoping, filtros e paginação (US-004)
  - Detalhar ordem com histórico de tramitação (US-004)
  - Editar ordem devolvida para alteração (US-006)

Nota: transições de status (US-005 a US-010) são gerenciadas pelo
      WorkflowEngine em app.services.workflow_engine.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import PrioridadeEnum, StatusOrdemEnum, TipoOrdemEnum
from app.models.fornecedor import Fornecedor  # S11.1
from app.models.ordem import Ordem
from app.models.ordem_historico import OrdemHistorico
from app.models.secretaria import Secretaria
from app.models.user import RoleEnum, User
from app.schemas.ordem import (
    FornecedorBasico,
    OrdemCreate,
    OrdemDetailResponse,
    OrdemHistoricoResponse,
    OrdemListResponse,
    OrdemResponse,
    OrdemUpdate,
)


class OrdemService:
    """Encapsula a lógica de negócio de criação e acompanhamento de ordens.

    Cada método público corresponde a um endpoint da API.
    Transições de status são delegadas ao WorkflowEngine.
    """

    # ---------------------------------------------------------------------------
    # Helpers privados
    # ---------------------------------------------------------------------------

    def _build_response(self, ordem: Ordem) -> OrdemResponse:
        """Constrói OrdemResponse com campos desnormalizados.

        Requer que ordem.secretaria e ordem.criador estejam carregados
        via selectinload antes de chamar este método.

        Args:
            ordem: Instância de Ordem com relacionamentos carregados.

        Returns:
            OrdemResponse pronto para serialização.
        """
        # S11.1: inclui dados do fornecedor vinculado (nullable para ordens históricas)
        fornecedor_data: FornecedorBasico | None = None
        if ordem.fornecedor is not None:
            fornecedor_data = FornecedorBasico.model_validate(ordem.fornecedor)

        return OrdemResponse(
            id=ordem.id,
            protocolo=ordem.protocolo,
            tipo=ordem.tipo,
            prioridade=ordem.prioridade,
            responsavel=ordem.responsavel,
            descricao=ordem.descricao,
            valor_estimado=ordem.valor_estimado,
            justificativa=ordem.justificativa,
            secretaria_id=ordem.secretaria_id,
            secretaria_nome=ordem.secretaria.nome,        # desnormalizado
            criado_por=ordem.criado_por,
            criador_nome=ordem.criador.nome_completo,     # desnormalizado
            status=ordem.status,
            versao=ordem.versao,
            assinatura_govbr=ordem.assinatura_govbr,  # US-016
            fornecedor=fornecedor_data,               # S11.1
            # Pipeline financeiro (todos nullable)
            numero_empenho=ordem.numero_empenho,
            valor_empenhado=ordem.valor_empenhado,
            data_empenho=ordem.data_empenho,
            numero_nf=ordem.numero_nf,
            data_atesto=ordem.data_atesto,
            atestado_por=ordem.atestado_por,
            valor_liquidado=ordem.valor_liquidado,
            data_liquidacao=ordem.data_liquidacao,
            valor_pago=ordem.valor_pago,
            data_pagamento=ordem.data_pagamento,
            forma_pagamento=ordem.forma_pagamento,
            created_at=ordem.created_at,
            updated_at=ordem.updated_at,
        )

    async def _load_with_relations(
        self, db: AsyncSession, ordem_id: UUID
    ) -> Ordem | None:
        """Carrega Ordem com secretaria e criador via selectinload.

        Usa populate_existing=True para garantir que os relacionamentos
        lazy="noload" sejam recarregados mesmo que o objeto já esteja na
        identity map (cenário pós-commit + refresh no WorkflowEngine).

        Args:
            ordem_id: UUID da ordem a carregar.

        Returns:
            Instância de Ordem com relacionamentos, ou None.
        """
        result = await db.execute(
            select(Ordem)
            .where(Ordem.id == ordem_id)
            .options(
                selectinload(Ordem.secretaria),
                selectinload(Ordem.criador),
                selectinload(Ordem.fornecedor),  # S11.1
            )
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def _gerar_protocolo(self, db: AsyncSession) -> str:
        """Gera o próximo protocolo OS-ANO-SEQUENCIAL de forma atômica.

        US-003 RN-13: padrão OS-ANO-SEQUENCIAL (ex.: OS-2026-00001).

        Estratégia:
          1. Busca o último protocolo do ano corrente com FOR UPDATE.
             O lock bloqueia inserções concorrentes até o commit desta transação.
          2. Incrementa o sequencial.
          3. A constraint UNIQUE em ordens.protocolo é a rede de segurança
             final contra race conditions no caso de tabela vazia (seq=1).

        Returns:
            String no formato 'OS-{ano}-{sequencial:05d}'.
        """
        year = datetime.now(timezone.utc).year

        lock_result = await db.execute(
            select(Ordem.protocolo)
            .where(Ordem.protocolo.like(f"OS-{year}-%"))
            .order_by(Ordem.protocolo.desc())
            .limit(1)
            .with_for_update()
        )
        last = lock_result.scalar_one_or_none()

        # "OS-2026-00042" → rsplit("-", 1) → ["OS-2026", "00042"] → int("00042") = 42
        seq = int(last.rsplit("-", 1)[1]) + 1 if last else 1
        return f"OS-{year}-{seq:05d}"

    # ---------------------------------------------------------------------------
    # a) create_ordem — US-003
    # ---------------------------------------------------------------------------

    async def create_ordem(
        self,
        db: AsyncSession,
        data: OrdemCreate,
        user: User,
        ip_address: str | None = None,
    ) -> OrdemResponse:
        """Cria nova ordem de serviço, compra ou obra.

        Fluxo:
          1. Valida que a secretaria do usuário existe e está ativa.
          2. Gera protocolo OS-ANO-SEQUENCIAL de forma atômica (US-003 RN-13).
          3. Cria Ordem com status AGUARDANDO_GABINETE (US-003 RN-20).
          4. Insere registro inicial em ordem_historico (US-012 RN-60).
          5. Recarrega com relacionamentos e retorna OrdemResponse.

        Args:
            data: Payload de criação validado pelo Pydantic.
            user: Usuário autenticado (perfil 'secretaria' verificado no router).
            ip_address: IP do cliente para log de auditoria (US-012 RN-61).

        Returns:
            OrdemResponse com todos os campos da ordem criada.

        Raises:
            HTTPException 404: Secretaria do usuário não encontrada.
            HTTPException 422: Secretaria desativada.
        """
        # Valida secretaria do usuário (US-003 RN-15)
        sec_result = await db.execute(
            select(Secretaria).where(Secretaria.id == user.secretaria_id)
        )
        secretaria = sec_result.scalar_one_or_none()

        if secretaria is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Secretaria do usuário não encontrada.",
            )
        if not secretaria.ativo:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Secretaria desativada. Contate o administrador.",
            )

        # Gera protocolo atômico (US-003 RN-13)
        protocolo = await self._gerar_protocolo(db)

        # S11.1: valida fornecedor_id — obrigatório para novas ordens
        fornecedor_obj = await db.get(Fornecedor, data.fornecedor_id)
        if fornecedor_obj is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Fornecedor não encontrado.",
            )
        if not fornecedor_obj.is_active:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Fornecedor inativo. Selecione um fornecedor ativo.",
            )

        # Cria a ordem — status inicial = AGUARDANDO_GABINETE (US-003 RN-20)
        ordem = Ordem(
            protocolo=protocolo,
            tipo=TipoOrdemEnum(data.tipo),
            prioridade=PrioridadeEnum(data.prioridade),
            responsavel=data.responsavel or "",   # NOT NULL — None vira string vazia
            descricao=data.descricao or "",       # NOT NULL — None vira string vazia
            valor_estimado=data.valor_estimado,
            justificativa=data.justificativa,
            secretaria_id=user.secretaria_id,       # US-003 RN-15: vinculada ao criador
            criado_por=user.id,
            status=StatusOrdemEnum.AGUARDANDO_GABINETE,
            versao=1,
            assinatura_govbr=data.assinatura_govbr,  # US-016
            fornecedor_id=data.fornecedor_id,         # S11.1
        )
        db.add(ordem)
        await db.flush()  # persiste para obter ordem.id antes do histórico

        # Registro inicial no histórico — APPEND-ONLY (US-012 RN-60)
        # status_anterior=None pois é a criação (sem estado anterior)
        historico = OrdemHistorico(
            ordem_id=ordem.id,
            usuario_id=user.id,
            perfil=user.role.value,
            acao="criar",
            status_anterior=None,
            status_novo=StatusOrdemEnum.AGUARDANDO_GABINETE,
            observacao=None,
            ip_address=ip_address,
        )
        db.add(historico)

        await db.commit()

        # Recarrega com relacionamentos para campos desnormalizados
        ordem_com_rel = await self._load_with_relations(db, ordem.id)
        return self._build_response(ordem_com_rel)  # type: ignore[arg-type]

    # ---------------------------------------------------------------------------
    # b) list_ordens — US-004
    # ---------------------------------------------------------------------------

    async def list_ordens(
        self,
        db: AsyncSession,
        user: User,
        page: int = 1,
        limit: int = 20,
        status_filter: str | None = None,
        protocolo_filter: str | None = None,
        secretaria_filter: UUID | None = None,
        prioridade_filter: str | None = None,
        data_inicio_filter: datetime | None = None,
        data_fim_filter: datetime | None = None,
    ) -> OrdemListResponse:
        """Lista ordens com RBAC scoping, filtros e paginação.

        US-004 RN-21: secretaria vê apenas ordens da própria secretaria.
        US-004 RN-24: paginação padrão de 20 registros por página.
        US-004 RN-25: busca por protocolo é exata (não parcial).

        Args:
            page: Página atual (1-based).
            limit: Registros por página.
            status_filter: Filtrar por status exato (ex.: 'AGUARDANDO_GABINETE').
            protocolo_filter: Filtrar por protocolo exato (US-004 RN-25).
            secretaria_filter: Filtrar por UUID de secretaria (para perfis globais).

        Returns:
            OrdemListResponse com items, total, page e limit.

        Raises:
            HTTPException 422: Valor de status inválido.
        """
        opts = [selectinload(Ordem.secretaria), selectinload(Ordem.criador)]
        base_query = select(Ordem).options(*opts)
        count_query = select(func.count()).select_from(Ordem)

        # RBAC: secretaria sempre filtrada pela própria secretaria (US-004 RN-21)
        if user.role == RoleEnum.secretaria:
            base_query = base_query.where(Ordem.secretaria_id == user.secretaria_id)
            count_query = count_query.where(Ordem.secretaria_id == user.secretaria_id)
        elif secretaria_filter is not None:
            # Perfis globais (admin, gabinete, etc.) podem filtrar opcionalmente
            base_query = base_query.where(Ordem.secretaria_id == secretaria_filter)
            count_query = count_query.where(Ordem.secretaria_id == secretaria_filter)

        # Filtro por status
        if status_filter is not None:
            try:
                status_enum = StatusOrdemEnum(status_filter)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Status inválido: '{status_filter}'. "
                        f"Valores aceitos: {[s.value for s in StatusOrdemEnum]}."
                    ),
                )
            base_query = base_query.where(Ordem.status == status_enum)
            count_query = count_query.where(Ordem.status == status_enum)

        # Filtro por protocolo — busca EXATA (US-004 RN-25)
        if protocolo_filter is not None:
            base_query = base_query.where(Ordem.protocolo == protocolo_filter)
            count_query = count_query.where(Ordem.protocolo == protocolo_filter)

        # Filtro por prioridade — US-024
        if prioridade_filter is not None:
            try:
                prioridade_enum = PrioridadeEnum(prioridade_filter)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Prioridade inválida: '{prioridade_filter}'. "
                        f"Valores aceitos: {[p.value for p in PrioridadeEnum]}."
                    ),
                )
            base_query = base_query.where(Ordem.prioridade == prioridade_enum)
            count_query = count_query.where(Ordem.prioridade == prioridade_enum)

        # Filtros por período de criação — US-024
        if data_inicio_filter is not None:
            base_query = base_query.where(Ordem.created_at >= data_inicio_filter)
            count_query = count_query.where(Ordem.created_at >= data_inicio_filter)

        if data_fim_filter is not None:
            base_query = base_query.where(Ordem.created_at <= data_fim_filter)
            count_query = count_query.where(Ordem.created_at <= data_fim_filter)

        # Total com filtros aplicados
        total_result = await db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginação e ordenação (mais recentes primeiro)
        offset = (page - 1) * limit
        paginated = (
            base_query
            .order_by(Ordem.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await db.execute(paginated)
        ordens = result.scalars().all()

        return OrdemListResponse(
            items=[self._build_response(o) for o in ordens],
            total=total,
            page=page,
            limit=limit,
        )

    # ---------------------------------------------------------------------------
    # c) get_ordem_detail — US-004
    # ---------------------------------------------------------------------------

    async def get_ordem_detail(
        self,
        db: AsyncSession,
        ordem_id: UUID,
        user: User,
    ) -> OrdemDetailResponse:
        """Retorna detalhe completo de uma ordem com histórico de tramitação.

        US-004 RN-21: secretaria vê apenas ordens da própria secretaria.
        US-004 RN-22: histórico em ordem cronológica (created_at ASC).
        US-012 RN-61: historico com campos auditáveis completos.

        Args:
            ordem_id: UUID da ordem a detalhar.
            user: Usuário autenticado.

        Returns:
            OrdemDetailResponse com todos os campos e histórico cronológico.

        Raises:
            HTTPException 404: Ordem não encontrada.
            HTTPException 403: Secretaria tentando acessar ordem de outra secretaria.
        """
        # Carrega ordem com relacionamentos
        ordem_result = await db.execute(
            select(Ordem)
            .where(Ordem.id == ordem_id)
            .options(
                selectinload(Ordem.secretaria),
                selectinload(Ordem.criador),
            )
        )
        ordem = ordem_result.scalar_one_or_none()

        if ordem is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ordem não encontrada.",
            )

        # RBAC: secretaria só vê própria secretaria (US-004 RN-21)
        if (
            user.role == RoleEnum.secretaria
            and user.secretaria_id != ordem.secretaria_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso permitido apenas à secretaria responsável pela ordem.",
            )

        # Carrega histórico em ordem cronológica (US-004 RN-22)
        historico_result = await db.execute(
            select(OrdemHistorico)
            .where(OrdemHistorico.ordem_id == ordem_id)
            .options(selectinload(OrdemHistorico.usuario))
            .order_by(OrdemHistorico.created_at.asc())
        )
        historicos = historico_result.scalars().all()

        # Constrói itens do histórico (US-012 RN-61)
        historico_responses = [
            OrdemHistoricoResponse(
                id=h.id,
                acao=h.acao,
                status_anterior=h.status_anterior,
                status_novo=h.status_novo,
                observacao=h.observacao,
                usuario_nome=h.usuario.nome_completo,
                perfil=h.perfil,
                created_at=h.created_at,
            )
            for h in historicos
        ]

        return OrdemDetailResponse(
            **self._build_response(ordem).model_dump(),
            historico=historico_responses,
        )

    # ---------------------------------------------------------------------------
    # d) update_ordem — US-006
    # ---------------------------------------------------------------------------

    async def update_ordem(
        self,
        db: AsyncSession,
        ordem_id: UUID,
        data: OrdemUpdate,
        user: User,
    ) -> OrdemResponse:
        """Edita uma ordem devolvida para alteração (PATCH semântico).

        US-006 RN-32: somente ordens DEVOLVIDA_PARA_ALTERACAO podem ser editadas.
        US-006 RN-33: protocolo e secretaria permanecem inalterados.
        US-006 RN-35: versao é incrementada via ação 'reenviar' no WorkflowEngine.

        Args:
            ordem_id: UUID da ordem a editar.
            data: Campos a atualizar (todos opcionais — apenas não-None são aplicados).
            user: Usuário autenticado (perfil 'secretaria' verificado no router).

        Returns:
            OrdemResponse com os campos atualizados.

        Raises:
            HTTPException 404: Ordem não encontrada.
            HTTPException 422: Ordem não está em DEVOLVIDA_PARA_ALTERACAO (US-006 RN-32).
            HTTPException 403: Secretaria tentando editar ordem de outra secretaria.
        """
        # Carrega com relacionamentos (necessário para validação e resposta)
        ordem = await self._load_with_relations(db, ordem_id)

        if ordem is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ordem não encontrada.",
            )

        # US-006 RN-32: somente ordens devolvidas podem ser editadas
        if ordem.status != StatusOrdemEnum.DEVOLVIDA_PARA_ALTERACAO:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Somente ordens com status DEVOLVIDA_PARA_ALTERACAO podem ser editadas. "
                    f"Status atual: '{ordem.status.value}'."
                ),
            )

        # Verificação de escopo de secretaria
        if (
            user.role == RoleEnum.secretaria
            and user.secretaria_id != ordem.secretaria_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Edição permitida apenas à secretaria responsável pela ordem.",
            )

        # Atualiza apenas campos fornecidos (PATCH semântico)
        # US-006 RN-33: protocolo e secretaria NÃO são editáveis
        if data.prioridade is not None:
            ordem.prioridade = PrioridadeEnum(data.prioridade)
        if data.responsavel is not None:
            ordem.responsavel = data.responsavel
        if data.descricao is not None:
            ordem.descricao = data.descricao
        if data.valor_estimado is not None:
            ordem.valor_estimado = data.valor_estimado
        if data.justificativa is not None:
            ordem.justificativa = data.justificativa
        if data.assinatura_govbr is not None:
            ordem.assinatura_govbr = data.assinatura_govbr

        ordem.updated_at = datetime.now(timezone.utc)

        await db.commit()

        # Recarrega com relacionamentos frescos para a resposta
        ordem_atualizada = await self._load_with_relations(db, ordem_id)
        return self._build_response(ordem_atualizada)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Singleton — instância única para uso nos routers
# ---------------------------------------------------------------------------

ordem_service = OrdemService()
