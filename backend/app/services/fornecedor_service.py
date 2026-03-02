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
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.fornecedor import Fornecedor
from app.models.secretaria import Secretaria
from app.models.user import RoleEnum, User
from app.schemas.fornecedor import (
    FornecedorCreate,
    FornecedorListResponse,
    FornecedorResponse,
    FornecedorUpdate,
)


class FornecedorService:
    """Encapsula a lógica de negócio de gestão de fornecedores.

    Cada método público corresponde a um ou mais endpoints da API.
    """

    # ---------------------------------------------------------------------------
    # Helpers privados
    # ---------------------------------------------------------------------------

    def _build_response(self, fornecedor: Fornecedor) -> FornecedorResponse:
        """Constrói FornecedorResponse com secretaria_nome desnormalizado.

        Requer que fornecedor.secretaria esteja carregado via selectinload.
        """
        data = FornecedorResponse.model_validate(fornecedor)
        if fornecedor.secretaria is not None:
            data.secretaria_nome = fornecedor.secretaria.nome
        return data

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

        return FornecedorListResponse(
            items=[self._build_response(f) for f in fornecedores],
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

        return self._build_response(fornecedor)

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
