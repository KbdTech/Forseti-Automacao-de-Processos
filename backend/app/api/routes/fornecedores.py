"""Router de Fornecedores — S11.1.

Endpoints:
  GET    /api/fornecedores          — Listar fornecedores (qualquer autenticado, com scoping)
  POST   /api/fornecedores          — Criar fornecedor (admin)
  GET    /api/fornecedores/{id}     — Detalhar fornecedor (qualquer autenticado, com scoping)
  PUT    /api/fornecedores/{id}     — Editar fornecedor (admin)
  PATCH  /api/fornecedores/{id}/status — Ativar/Desativar fornecedor (admin)

S11.1 Cenário 9: POST/PUT/PATCH exigem perfil admin (HTTP 403 para outros).
S11.1 Cenário 5/6: scoping RBAC na listagem aplicado no service.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleEnum, User
from app.schemas.fornecedor import (
    FornecedorCreate,
    FornecedorDocumentoDownloadUrl,
    FornecedorDocumentoResponse,
    FornecedorListResponse,
    FornecedorResponse,
    FornecedorResumoResponse,
    FornecedorStatusUpdate,
    FornecedorUpdate,
)
from app.services.fornecedor_documento_service import fornecedor_documento_service
from app.services.fornecedor_service import fornecedor_service

router = APIRouter(prefix="/api/fornecedores", tags=["Fornecedores"])

# Dependency aliases
# S13.1: perfil 'compras' pode criar/editar/desativar fornecedores
ComprasOrAdmin = Annotated[User, Depends(require_role(RoleEnum.compras, RoleEnum.admin))]
AnyAuthenticated = Annotated[User, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# GET /api/fornecedores
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=FornecedorListResponse,
    status_code=200,
)
async def list_fornecedores(
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1, description="Página (1-based).")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Registros por página.")] = 20,
    q: Annotated[str | None, Query(description="Busca por razão social ou CNPJ.")] = None,
    secretaria_id: Annotated[
        uuid.UUID | None, Query(description="Filtrar por secretaria.")
    ] = None,
    is_active: Annotated[
        bool | None, Query(description="Filtrar por status ativo/inativo.")
    ] = None,
) -> FornecedorListResponse:
    """Lista fornecedores com scoping RBAC, filtros e paginação.

    Perfil secretaria vê apenas fornecedores da própria secretaria + globais.
    Demais perfis veem todos os fornecedores.
    """
    return await fornecedor_service.list_fornecedores(
        db=db,
        user=current_user,
        page=page,
        limit=limit,
        q=q,
        secretaria_id=secretaria_id,
        is_active=is_active,
    )


# ---------------------------------------------------------------------------
# POST /api/fornecedores
# ---------------------------------------------------------------------------


@router.post(
    "/",
    response_model=FornecedorResponse,
    status_code=201,
    responses={
        409: {"description": "CNPJ já cadastrado"},
        403: {"description": "Acesso negado — perfis admin ou compras obrigatório"},
    },
)
async def create_fornecedor(
    payload: FornecedorCreate,
    current_user: ComprasOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResponse:
    """Cria novo fornecedor vencedor de licitação.

    Apenas administradores podem criar fornecedores.
    CNPJ deve ser único no sistema.
    """
    return await fornecedor_service.create_fornecedor(db=db, data=payload, user=current_user)


# ---------------------------------------------------------------------------
# GET /api/fornecedores/{id}
# ---------------------------------------------------------------------------


@router.get(
    "/{fornecedor_id}/resumo",
    response_model=FornecedorResumoResponse,
    status_code=200,
    responses={404: {"description": "Fornecedor não encontrado"}},
)
async def get_fornecedor_resumo(
    fornecedor_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResumoResponse:
    """Retorna detalhe completo do fornecedor com estatísticas financeiras.

    Inclui: total pago, saldo disponível, percentual utilizado,
    gastos mensais (para gráfico) e últimas ordens pagas.
    """
    return await fornecedor_service.get_resumo(
        db=db, fornecedor_id=fornecedor_id, user=current_user
    )


@router.get(
    "/{fornecedor_id}",
    response_model=FornecedorResponse,
    status_code=200,
    responses={
        404: {"description": "Fornecedor não encontrado"},
    },
)
async def get_fornecedor(
    fornecedor_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResponse:
    """Retorna detalhes de um fornecedor pelo ID.

    Perfil secretaria só acessa fornecedores da própria secretaria ou globais.
    """
    return await fornecedor_service.get_fornecedor(
        db=db, fornecedor_id=fornecedor_id, user=current_user
    )


# ---------------------------------------------------------------------------
# PUT /api/fornecedores/{id}
# ---------------------------------------------------------------------------


@router.put(
    "/{fornecedor_id}",
    response_model=FornecedorResponse,
    status_code=200,
    responses={
        404: {"description": "Fornecedor não encontrado"},
        403: {"description": "Acesso negado — perfil admin obrigatório"},
    },
)
async def update_fornecedor(
    fornecedor_id: uuid.UUID,
    payload: FornecedorUpdate,
    current_user: ComprasOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResponse:
    """Atualiza dados de um fornecedor.

    CNPJ não é editável após criação.
    Apenas administradores podem editar fornecedores.
    """
    return await fornecedor_service.update_fornecedor(
        db=db, fornecedor_id=fornecedor_id, data=payload, user=current_user
    )


# ---------------------------------------------------------------------------
# PATCH /api/fornecedores/{id}/status
# ---------------------------------------------------------------------------


@router.patch(
    "/{fornecedor_id}/status",
    response_model=FornecedorResponse,
    status_code=200,
    responses={
        404: {"description": "Fornecedor não encontrado"},
        403: {"description": "Acesso negado — perfil admin obrigatório"},
    },
)
async def toggle_status(
    fornecedor_id: uuid.UUID,
    payload: FornecedorStatusUpdate,
    current_user: ComprasOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorResponse:
    """Ativa ou desativa um fornecedor.

    Fornecedor inativo não aparece nas listagens de seleção em novas ordens.
    Apenas administradores podem alterar o status.
    """
    return await fornecedor_service.toggle_status(
        db=db, fornecedor_id=fornecedor_id, is_active=payload.is_active, user=current_user
    )


# ---------------------------------------------------------------------------
# GET /api/fornecedores/{id}/documentos — listar documentos
# ---------------------------------------------------------------------------


@router.get(
    "/{fornecedor_id}/documentos",
    response_model=list[FornecedorDocumentoResponse],
    status_code=200,
)
async def list_documentos(
    fornecedor_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FornecedorDocumentoResponse]:
    """Lista todos os documentos de um fornecedor."""
    docs = await fornecedor_documento_service.list_by_fornecedor(db, fornecedor_id)
    return [FornecedorDocumentoResponse.model_validate(d) for d in docs]


# ---------------------------------------------------------------------------
# POST /api/fornecedores/{id}/documentos — upload de documento
# ---------------------------------------------------------------------------


@router.post(
    "/{fornecedor_id}/documentos",
    response_model=FornecedorDocumentoResponse,
    status_code=201,
    responses={
        404: {"description": "Fornecedor não encontrado"},
        403: {"description": "Acesso negado — admin ou compras obrigatório"},
        422: {"description": "Arquivo inválido (tipo/tamanho)"},
    },
)
async def upload_documento(
    fornecedor_id: uuid.UUID,
    current_user: ComprasOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: Annotated[UploadFile, File(description="Arquivo PDF, JPEG ou PNG (máx. 20 MB).")],
    descricao: Annotated[str | None, Form(description="Descrição opcional do documento.")] = None,
) -> FornecedorDocumentoResponse:
    """Faz upload de um documento para o fornecedor.

    Apenas admin e perfil compras podem fazer upload.
    """
    doc = await fornecedor_documento_service.upload(
        db=db,
        fornecedor_id=fornecedor_id,
        uploader_id=current_user.id,
        file=file,
        descricao=descricao,
    )
    return FornecedorDocumentoResponse.model_validate(doc)


# ---------------------------------------------------------------------------
# GET /api/fornecedores/documentos/{doc_id}/download-url
# ---------------------------------------------------------------------------


@router.get(
    "/documentos/{doc_id}/download-url",
    response_model=FornecedorDocumentoDownloadUrl,
    status_code=200,
    responses={404: {"description": "Documento não encontrado"}},
)
async def get_download_url(
    doc_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FornecedorDocumentoDownloadUrl:
    """Gera URL assinada para download de documento do fornecedor (TTL: 15 min)."""
    url = await fornecedor_documento_service.get_download_url(db, doc_id)
    return FornecedorDocumentoDownloadUrl(download_url=url)


# ---------------------------------------------------------------------------
# DELETE /api/fornecedores/documentos/{doc_id}
# ---------------------------------------------------------------------------


@router.delete(
    "/documentos/{doc_id}",
    status_code=204,
    responses={
        403: {"description": "Sem permissão"},
        404: {"description": "Documento não encontrado"},
    },
)
async def delete_documento(
    doc_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Remove documento do fornecedor (admin, compras ou próprio uploader)."""
    await fornecedor_documento_service.delete(
        db=db,
        doc_id=doc_id,
        requester_id=current_user.id,
        requester_role=current_user.role.value,
    )
