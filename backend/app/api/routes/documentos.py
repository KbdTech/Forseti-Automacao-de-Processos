"""Router FastAPI — documentos anexados às ordens (US-015).

Endpoints:
  POST   /api/ordens/{ordem_id}/documentos      — upload (secretaria, admin)
  GET    /api/ordens/{ordem_id}/documentos      — listar (qualquer autenticado)
  GET    /api/documentos/{doc_id}/download-url  — URL assinada (qualquer autenticado)
  DELETE /api/documentos/{doc_id}               — remover (uploader ou admin)

Segurança:
  - Todos os endpoints exigem Bearer token válido.
  - storage_path NUNCA incluído nas respostas.
  - URL assinada tem TTL de 900s (15 min).
"""

import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.config import settings
from app.core.database import get_db
from app.models.user import RoleEnum, User
from app.schemas.documento import (
    DocumentoListResponse,
    DocumentoResponse,
    DownloadUrlResponse,
)
from app.services.documento_service import documento_service

router = APIRouter(prefix="/api", tags=["Documentos"])

# ---------------------------------------------------------------------------
# Alias de dependências (padrão do projeto)
# ---------------------------------------------------------------------------

AnyAuthenticated = Annotated[User, Depends(get_current_user)]
# US-017/018/019/020: contabilidade e tesouraria também fazem uploads nos
# pipelines de empenho, atesto, liquidação e pagamento.
UploaderRole = Annotated[
    User,
    Depends(require_role(
        RoleEnum.secretaria,
        RoleEnum.contabilidade,
        RoleEnum.tesouraria,
        RoleEnum.admin,
    )),
]
UploaderOrAdmin = Annotated[
    User,
    Depends(require_role(
        RoleEnum.secretaria,
        RoleEnum.contabilidade,
        RoleEnum.tesouraria,
        RoleEnum.admin,
    )),
]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/ordens/{ordem_id}/documentos",
    response_model=DocumentoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Anexar documento a uma ordem",
    description=(
        "Faz upload de um arquivo (PDF, JPEG ou PNG, máx 10 MB) e o vincula "
        "à ordem especificada. Bloqueado após AGUARDANDO_CONTROLADORIA."
    ),
)
async def upload_documento(
    ordem_id: uuid.UUID,
    current_user: UploaderRole,
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(..., description="PDF, JPEG ou PNG — máx 10 MB"),
    descricao: Optional[str] = Form(None, max_length=255),
    assinado_govbr: bool = Form(
        False,
        description=(
            "True se o documento foi assinado digitalmente via GovBR. "
            "Secretaria baixa, assina externamente e reenvia com assinado=true."
        ),
    ),
) -> DocumentoResponse:
    """Upload de documento para uma ordem.

    - **secretaria**: somente para ordens da própria secretaria.
    - **admin**: qualquer ordem.
    - Tipos aceitos: `application/pdf`, `image/jpeg`, `image/png`.
    - Imutável após `AGUARDANDO_CONTROLADORIA` (US-015 RN).
    """
    doc = await documento_service.upload(
        db=db,
        ordem_id=ordem_id,
        uploader_id=current_user.id,
        file=file,
        descricao=descricao,
        assinado_govbr=assinado_govbr,
    )
    return DocumentoResponse.model_validate(doc)


@router.get(
    "/ordens/{ordem_id}/documentos",
    response_model=DocumentoListResponse,
    summary="Listar documentos de uma ordem",
)
async def list_documentos(
    ordem_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DocumentoListResponse:
    """Lista todos os documentos anexados a uma ordem, em ordem cronológica.

    Disponível para qualquer perfil autenticado.
    O campo `storage_path` NÃO é retornado — use `/download-url` para acesso.
    """
    docs = await documento_service.list_by_ordem(db=db, ordem_id=ordem_id)
    return DocumentoListResponse(
        documentos=[DocumentoResponse.model_validate(d) for d in docs],
        total=len(docs),
    )


@router.get(
    "/documentos/{doc_id}/download-url",
    response_model=DownloadUrlResponse,
    summary="Obter URL assinada para download do documento",
)
async def get_download_url(
    doc_id: uuid.UUID,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DownloadUrlResponse:
    """Gera uma URL assinada temporária (TTL 15 min) para download seguro.

    US-015: `storage_path` nunca exposto — acesso somente via esta URL.
    A URL expira após `expires_in` segundos e deve ser reutilizada antes disso.
    """
    signed_url = await documento_service.get_download_url(db=db, doc_id=doc_id)
    return DownloadUrlResponse(
        signed_url=signed_url,
        expires_in=settings.SIGNED_URL_TTL_SECONDS,
    )


@router.delete(
    "/documentos/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover documento",
)
async def delete_documento(
    doc_id: uuid.UUID,
    current_user: UploaderOrAdmin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Remove o documento do Storage e do banco.

    Regras:
    - Somente o **uploader original** (secretaria) ou **admin** podem remover.
    - Proibido para ordens em status imutável (após `AGUARDANDO_CONTROLADORIA`).
    """
    await documento_service.delete(
        db=db,
        doc_id=doc_id,
        requester_id=current_user.id,
        requester_role=current_user.role.value,
    )
