"""Service de Fornecedores — lógica de negócio S11.1.

Responsabilidades:
  - Listar fornecedores com scoping por role (S11.1 Cenário 5 e 6)
  - Criar fornecedor com validação de CNPJ único (S11.1 Cenário 4)
  - Detalhar, editar e ativar/desativar fornecedor (S11.1 Cenários 7 e 8)

Scoping RBAC:
  secretaria  → secretaria_id = user.secretaria_id OR secretaria_id IS NULL
  outros      → todos os fornecedores (sem filtro de secretaria)
Admin pode criar/editar/desativar (S11.1 Cenário 9).
"""

from __future__ import annotations

import math
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import StatusOrdemEnum
from app.models.fornecedor import Fornecedor
from app.models.ordem import Ordem
from app.models.secretaria import Secretaria
from app.models.user import RoleEnum, User
from app.schemas.fornecedor import (
    FornecedorCreate,
    FornecedorListResponse,
    FornecedorResponse,
    FornecedorResumoResponse,
    FornecedorUpdate,
    GastoMes,
    OrdemResumoItem,
)

_ZERO = __import__("decimal").Decimal(0)


class FornecedorService:
    """Encapsula a lógica de negócio de gestão de fornecedores.

    Cada método público corresponde a um ou mais endpoints da API.
    """

    # ---------------------------------------------------------------------------
    # Helpers privados
    # ---------------------------------------------------------------------------

    def _build_response(
        self,
        fornecedor: Fornecedor,
        total_pago_map: dict | None = None,
    ) -> FornecedorResponse:
        """Constrói FornecedorResponse com secretaria_nome e total_pago desnormalizados.

        Args:
            fornecedor: instância com secretaria já carregada via selectinload.
            total_pago_map: dict {fornecedor_id: Decimal} pré-calculado (batch).
        """
        from decimal import Decimal

        data = FornecedorResponse.model_validate(fornecedor)
        if fornecedor.secretaria is not None:
            data.secretaria_nome = fornecedor.secretaria.nome
        if total_pago_map is not None:
            data.total_pago = total_pago_map.get(fornecedor.id, Decimal(0))
        return data

    async def _batch_total_pago(
        self,
        db: AsyncSession,
        fornecedor_ids: list,
    ) -> dict:
        """Consulta o total pago por fornecedor em uma única query batch.

        Returns:
            dict {fornecedor_id (UUID): Decimal total_pago}
        """
        from decimal import Decimal
        import uuid as _uuid

        if not fornecedor_ids:
            return {}

        stmt = (
            select(
                Ordem.fornecedor_id,
                func.sum(Ordem.valor_pago).label("total_pago"),
            )
            .where(
                Ordem.fornecedor_id.in_(fornecedor_ids),
                Ordem.status == StatusOrdemEnum.PAGA,
                Ordem.valor_pago.is_not(None),
            )
            .group_by(Ordem.fornecedor_id)
        )
        result = await db.execute(stmt)
        return {
            row.fornecedor_id: row.total_pago or Decimal(0)
            for row in result
        }

    def _apply_scope(self, stmt, user: User):
        """Aplica scoping de secretaria conforme o role do usuário.

        secretaria → apenas própria + globais
        outros     → todos (sem filtro)
        """
        if user.role == RoleEnum.secretaria:
            stmt = stmt.where(
                or_(
                    Fornecedor.secretaria_id == user.secretaria_id,
                    Fornecedor.secretaria_id.is_(None),
                )
            )
        return stmt

    # ---------------------------------------------------------------------------
    # list_fornecedores — GET /api/fornecedores
    # ---------------------------------------------------------------------------

    async def list_fornecedores(
        self,
        db: AsyncSession,
        user: User,
        page: int = 1,
        limit: int = 20,
        q: str | None = None,
        secretaria_id: UUID | None = None,
        is_active: bool | None = None,
    ) -> FornecedorListResponse:
        """Lista fornecedores com scoping por role, filtros e paginação.

        S11.1 Cenário 5: perfil secretaria vê apenas própria + globais.
        S11.1 Cenário 6: perfis globais veem todos os fornecedores.

        Args:
            user: Usuário autenticado.
            page: Página (1-based).
            limit: Registros por página.
            q: Busca por razão social ou CNPJ (case-insensitive).
            secretaria_id: Filtrar por secretaria específica (apenas admin/globais).
            is_active: Filtrar por status ativo/inativo.

        Returns:
            FornecedorListResponse paginado.
        """
        stmt = select(Fornecedor).options(selectinload(Fornecedor.secretaria))

        # Scoping RBAC
        stmt = self._apply_scope(stmt, user)

        # Filtro de busca textual
        if q:
            pattern = f"%{q}%"
            stmt = stmt.where(
                or_(
                    Fornecedor.razao_social.ilike(pattern),
                    Fornecedor.cnpj.ilike(pattern),
                )
            )

        # Filtro por secretaria (apenas para roles que veem todos)
        if secretaria_id is not None and user.role != RoleEnum.secretaria:
            stmt = stmt.where(Fornecedor.secretaria_id == secretaria_id)

        # Filtro por status
        if is_active is not None:
            stmt = stmt.where(Fornecedor.is_active == is_active)

        # Total antes da paginação
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await db.execute(count_stmt)
        total = total_result.scalar_one()

        # Paginação
        offset = (page - 1) * limit
        stmt = stmt.order_by(Fornecedor.razao_social.asc()).offset(offset).limit(limit)

        result = await db.execute(stmt)
        fornecedores = result.scalars().all()

        pages = math.ceil(total / limit) if limit > 0 else 0

        # Batch-load total_pago para todos os fornecedores da página
        ids = [f.id for f in fornecedores]
        total_pago_map = await self._batch_total_pago(db, ids)

        return FornecedorListResponse(
            items=[self._build_response(f, total_pago_map) for f in fornecedores],
            total=total,
            page=page,
            pages=pages,
        )

    # ---------------------------------------------------------------------------
    # create_fornecedor — POST /api/fornecedores
    # ---------------------------------------------------------------------------

    async def create_fornecedor(
        self,
        db: AsyncSession,
        data: FornecedorCreate,
        user: User,  # noqa: ARG002 — passado para logging/auditoria futura
    ) -> FornecedorResponse:
        """Cria novo fornecedor.

        S11.1 Cenário 3: criação com CNPJ válido.
        S11.1 Cenário 4: CNPJ duplicado → HTTP 409.

        Args:
            data: Payload validado pelo Pydantic (CNPJ já validado no schema).
            user: Usuário admin autenticado.

        Returns:
            FornecedorResponse com todos os campos do fornecedor criado.

        Raises:
            HTTPException 409: CNPJ já cadastrado.
        """
        # Verifica unicidade do CNPJ
        existing = await db.execute(
            select(Fornecedor).where(Fornecedor.cnpj == data.cnpj)
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="CNPJ já cadastrado no sistema.",
            )

        # Valida secretaria_id se fornecido
        if data.secretaria_id is not None:
            sec = await db.get(Secretaria, data.secretaria_id)
            if sec is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Secretaria não encontrada.",
                )

        fornecedor = Fornecedor(
            razao_social=data.razao_social,
            nome_fantasia=data.nome_fantasia,
            cnpj=data.cnpj,
            numero_processo=data.numero_processo,
            objeto_contrato=data.objeto_contrato,
            valor_contratado=data.valor_contratado,
            data_contrato=data.data_contrato,
            banco=data.banco,
            agencia=data.agencia,
            conta=data.conta,
            tipo_conta=data.tipo_conta,
            secretaria_id=data.secretaria_id,
            is_active=True,
        )
        db.add(fornecedor)
        await db.commit()
        await db.refresh(fornecedor)

        # Carrega secretaria para desnormalizar
        loaded = await self._load(db, fornecedor.id)
        return self._build_response(loaded)

    # ---------------------------------------------------------------------------
    # get_fornecedor — GET /api/fornecedores/{id}
    # ---------------------------------------------------------------------------

    async def get_fornecedor(
        self,
        db: AsyncSession,
        fornecedor_id: UUID,
        user: User,
    ) -> FornecedorResponse:
        """Retorna detalhes de um fornecedor pelo ID.

        Aplica scoping: secretaria só acessa próprios + globais.

        Raises:
            HTTPException 404: não encontrado ou fora do escopo.
        """
        fornecedor = await self._load(db, fornecedor_id)
        if fornecedor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fornecedor não encontrado.",
            )

        # Verifica scoping para secretaria
        if user.role == RoleEnum.secretaria:
            if (
                fornecedor.secretaria_id is not None
                and fornecedor.secretaria_id != user.secretaria_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Fornecedor não encontrado.",
                )

        total_pago_map = await self._batch_total_pago(db, [fornecedor.id])
        return self._build_response(fornecedor, total_pago_map)

    # ---------------------------------------------------------------------------
    # update_fornecedor — PUT /api/fornecedores/{id}
    # ---------------------------------------------------------------------------

    async def update_fornecedor(
        self,
        db: AsyncSession,
        fornecedor_id: UUID,
        data: FornecedorUpdate,
        user: User,  # noqa: ARG002
    ) -> FornecedorResponse:
        """Atualiza dados de um fornecedor.

        CNPJ não é editável após criação.

        Raises:
            HTTPException 404: fornecedor não encontrado.
        """
        fornecedor = await self._load(db, fornecedor_id)
        if fornecedor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fornecedor não encontrado.",
            )

        # Valida nova secretaria_id se fornecida
        if data.secretaria_id is not None:
            sec = await db.get(Secretaria, data.secretaria_id)
            if sec is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Secretaria não encontrada.",
                )

        # Aplica campos não-None do payload
        update_fields = data.model_dump(exclude_none=True)
        for field, value in update_fields.items():
            setattr(fornecedor, field, value)

        from datetime import datetime, timezone
        fornecedor.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(fornecedor)

        loaded = await self._load(db, fornecedor.id)
        return self._build_response(loaded)

    # ---------------------------------------------------------------------------
    # toggle_status — PATCH /api/fornecedores/{id}/status
    # ---------------------------------------------------------------------------

    async def toggle_status(
        self,
        db: AsyncSession,
        fornecedor_id: UUID,
        is_active: bool,
        user: User,  # noqa: ARG002
    ) -> FornecedorResponse:
        """Ativa ou desativa um fornecedor.

        S11.1 Cenário 8: fornecedor inativo não aparece nas listagens de seleção.

        Raises:
            HTTPException 404: fornecedor não encontrado.
        """
        fornecedor = await self._load(db, fornecedor_id)
        if fornecedor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fornecedor não encontrado.",
            )

        from datetime import datetime, timezone
        fornecedor.is_active = is_active
        fornecedor.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(fornecedor)

        loaded = await self._load(db, fornecedor.id)
        return self._build_response(loaded)

    # ---------------------------------------------------------------------------
    # get_resumo — GET /api/fornecedores/{id}/resumo
    # ---------------------------------------------------------------------------

    async def get_resumo(
        self,
        db: AsyncSession,
        fornecedor_id: UUID,
        user: User,
    ) -> FornecedorResumoResponse:
        """Retorna detalhe completo do fornecedor com estatísticas financeiras.

        Calcula:
          - total_pago: soma de valor_pago em ordens PAGA vinculadas
          - saldo_disponivel: valor_contratado - total_pago
          - percentual_utilizado: proporção usada do contrato
          - gastos_por_mes: agregação mensal para gráfico de barras
          - ultimas_ordens: até 10 ordens PAGA mais recentes

        Aplica scoping idêntico ao get_fornecedor.
        """
        from decimal import Decimal

        fornecedor = await self._load(db, fornecedor_id)
        if fornecedor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fornecedor não encontrado.",
            )

        # Scoping para secretaria
        if user.role == RoleEnum.secretaria:
            if (
                fornecedor.secretaria_id is not None
                and fornecedor.secretaria_id != user.secretaria_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Fornecedor não encontrado.",
                )

        # Gastos mensais — ordens PAGA com data_pagamento e valor_pago preenchidos.
        # Usa referência posicional (text("1")) no GROUP BY e ORDER BY para evitar
        # que o SQLAlchemy gere parâmetros bind separados ($1, $4, $5) para cada
        # chamada a func.to_char — o PostgreSQL rejeitaria as expressões como distintas.
        monthly_stmt = (
            select(
                func.to_char(Ordem.data_pagamento, "YYYY-MM").label("mes"),
                func.sum(Ordem.valor_pago).label("total_pago"),
                func.count().label("count_ordens"),
            )
            .where(
                Ordem.fornecedor_id == fornecedor_id,
                Ordem.status == StatusOrdemEnum.PAGA,
                Ordem.valor_pago.is_not(None),
                Ordem.data_pagamento.is_not(None),
            )
            .group_by(text("1"))
            .order_by(text("1"))
        )
        monthly_result = await db.execute(monthly_stmt)
        gastos_por_mes = [
            GastoMes(
                mes=row.mes,
                total_pago=row.total_pago or Decimal(0),
                count_ordens=row.count_ordens,
            )
            for row in monthly_result
        ]

        total_pago = sum((g.total_pago for g in gastos_por_mes), Decimal(0))
        total_ordens_pagas = sum(g.count_ordens for g in gastos_por_mes)

        valor_contratado = fornecedor.valor_contratado or Decimal(0)
        saldo_disponivel = max(valor_contratado - total_pago, Decimal(0))
        percentual_utilizado = (
            round(float(total_pago / valor_contratado * 100), 1)
            if valor_contratado > 0
            else 0.0
        )

        # Últimas 10 ordens PAGA vinculadas a este fornecedor
        last_ordens_stmt = (
            select(Ordem)
            .where(
                Ordem.fornecedor_id == fornecedor_id,
                Ordem.status == StatusOrdemEnum.PAGA,
            )
            .options(selectinload(Ordem.secretaria))
            .order_by(Ordem.data_pagamento.desc().nullslast())
            .limit(10)
        )
        last_result = await db.execute(last_ordens_stmt)
        last_ordens = last_result.scalars().all()

        ultimas_ordens = [
            OrdemResumoItem(
                id=o.id,
                protocolo=o.protocolo,
                status=o.status.value,
                valor_pago=o.valor_pago,
                data_pagamento=o.data_pagamento,
                secretaria_nome=o.secretaria.nome if o.secretaria else None,
            )
            for o in last_ordens
        ]

        return FornecedorResumoResponse(
            id=fornecedor.id,
            razao_social=fornecedor.razao_social,
            nome_fantasia=fornecedor.nome_fantasia,
            cnpj=fornecedor.cnpj,
            numero_processo=fornecedor.numero_processo,
            objeto_contrato=fornecedor.objeto_contrato,
            valor_contratado=fornecedor.valor_contratado,
            data_contrato=fornecedor.data_contrato,
            banco=fornecedor.banco,
            agencia=fornecedor.agencia,
            conta=fornecedor.conta,
            tipo_conta=fornecedor.tipo_conta,
            secretaria_id=fornecedor.secretaria_id,
            secretaria_nome=fornecedor.secretaria.nome if fornecedor.secretaria else None,
            is_active=fornecedor.is_active,
            total_pago=total_pago,
            total_ordens_pagas=total_ordens_pagas,
            saldo_disponivel=saldo_disponivel,
            percentual_utilizado=percentual_utilizado,
            gastos_por_mes=gastos_por_mes,
            ultimas_ordens=ultimas_ordens,
        )

    # ---------------------------------------------------------------------------
    # _load — helper interno
    # ---------------------------------------------------------------------------

    async def _load(self, db: AsyncSession, fornecedor_id: UUID) -> Fornecedor | None:
        """Carrega Fornecedor com secretaria via selectinload."""
        result = await db.execute(
            select(Fornecedor)
            .where(Fornecedor.id == fornecedor_id)
            .options(selectinload(Fornecedor.secretaria))
        )
        return result.scalar_one_or_none()


fornecedor_service = FornecedorService()
