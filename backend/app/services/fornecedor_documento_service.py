"""Serviço de documentos de fornecedores — S12.2.

Responsabilidades:
  - upload(): valida tipo/tamanho/magic bytes, envia ao Supabase Storage,
              registra metadados no banco.
  - list_by_fornecedor(): lista documentos de um fornecedor.
  - get_download_url(): gera URL assinada (TTL 900s).
  - delete(): remove do Storage e do banco (admin/compras).

Bucket: fornecedor-documentos (privado, separado do bucket de ordens).
Path:   {fornecedor_id}/{timestamp}_{nome_sanitizado}
"""

import hashlib
import re
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.fornecedor import Fornecedor
from app.models.fornecedor_documento import FornecedorDocumento

# ---------------------------------------------------------------------------
# Constantes de validação
# ---------------------------------------------------------------------------

_MAGIC_BYTES: dict[str, bytes] = {
    "application/pdf": b"%PDF",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
}

_ALLOWED_MIMES = frozenset(_MAGIC_BYTES.keys())

# Bucket separado para documentos de fornecedores
_BUCKET = "fornecedor-documentos"

# 20 MB para documentos de fornecedores (contratos, certidões, etc.)
_MAX_UPLOAD_BYTES = 20_971_520


class FornecedorDocumentoService:
    """Gerencia o ciclo de vida de documentos de fornecedores."""

    # ------------------------------------------------------------------
    # upload
    # ------------------------------------------------------------------

    async def upload(
        self,
        db: AsyncSession,
        fornecedor_id: uuid.UUID,
        uploader_id: uuid.UUID,
        file: UploadFile,
        descricao: str | None,
    ) -> FornecedorDocumento:
        """Faz upload de um documento e registra metadados no banco.

        Raises:
            HTTPException 404: fornecedor não encontrado.
            HTTPException 422: tamanho excedido, MIME inválido, arquivo vazio.
            HTTPException 500: falha no Supabase Storage.
        """
        await self._get_fornecedor_or_404(db, fornecedor_id)

        content = await file.read()

        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Arquivo vazio não é permitido.",
            )

        if len(content) > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Arquivo excede o tamanho máximo de 20 MB.",
            )

        declared_mime = (file.content_type or "").strip()
        if declared_mime not in _ALLOWED_MIMES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Tipo de arquivo não permitido. Formatos aceitos: PDF, JPEG, PNG.",
            )

        self._validate_magic_bytes(content, declared_mime)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        safe_name = self._sanitize_filename(file.filename or "arquivo")
        storage_path = f"{fornecedor_id}/{timestamp}_{safe_name}"

        await self._storage_upload(storage_path, content, declared_mime)

        doc = FornecedorDocumento(
            fornecedor_id=fornecedor_id,
            uploaded_by=uploader_id,
            nome_arquivo=file.filename or "arquivo",
            tipo_mime=declared_mime,
            tamanho_bytes=len(content),
            descricao=descricao,
            storage_path=storage_path,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

    # ------------------------------------------------------------------
    # list_by_fornecedor
    # ------------------------------------------------------------------

    async def list_by_fornecedor(
        self,
        db: AsyncSession,
        fornecedor_id: uuid.UUID,
    ) -> list[FornecedorDocumento]:
        """Retorna todos os documentos de um fornecedor (mais recente primeiro)."""
        result = await db.execute(
            select(FornecedorDocumento)
            .where(FornecedorDocumento.fornecedor_id == fornecedor_id)
            .order_by(FornecedorDocumento.created_at.desc())
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------
    # get_download_url
    # ------------------------------------------------------------------

    async def get_download_url(
        self,
        db: AsyncSession,
        doc_id: uuid.UUID,
    ) -> str:
        """Gera URL assinada para download (TTL: 900s)."""
        doc = await self._get_doc_or_404(db, doc_id)
        return await self._storage_signed_url(doc.storage_path)

    # ------------------------------------------------------------------
    # delete
    # ------------------------------------------------------------------

    async def delete(
        self,
        db: AsyncSession,
        doc_id: uuid.UUID,
        requester_id: uuid.UUID,
        requester_role: str,
    ) -> None:
        """Remove documento do Storage e do banco.

        Somente o uploader original ou admin/compras podem remover.
        """
        doc = await self._get_doc_or_404(db, doc_id)

        if requester_role not in ("admin", "compras") and doc.uploaded_by != requester_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sem permissão para remover este documento.",
            )

        await self._storage_delete(doc.storage_path)
        await db.delete(doc)
        await db.commit()

    # ------------------------------------------------------------------
    # Helpers privados
    # ------------------------------------------------------------------

    async def _get_fornecedor_or_404(
        self, db: AsyncSession, fornecedor_id: uuid.UUID
    ) -> Fornecedor:
        result = await db.execute(
            select(Fornecedor).where(Fornecedor.id == fornecedor_id)
        )
        fornecedor = result.scalar_one_or_none()
        if not fornecedor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fornecedor não encontrado.",
            )
        return fornecedor

    async def _get_doc_or_404(
        self, db: AsyncSession, doc_id: uuid.UUID
    ) -> FornecedorDocumento:
        result = await db.execute(
            select(FornecedorDocumento).where(FornecedorDocumento.id == doc_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Documento não encontrado.",
            )
        return doc

    def _validate_magic_bytes(self, content: bytes, mime: str) -> None:
        expected = _MAGIC_BYTES.get(mime, b"")
        if not content[: len(expected)] == expected:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Conteúdo do arquivo não corresponde ao tipo declarado. "
                    "Envie um arquivo PDF, JPEG ou PNG válido."
                ),
            )

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        sanitized = re.sub(r"[^\w.\-]", "_", filename)
        return sanitized[:100]

    async def _storage_upload(self, path: str, content: bytes, mime: str) -> None:
        url = f"{settings.SUPABASE_URL}/storage/v1/object/{_BUCKET}/{path}"
        headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": mime,
            "x-upsert": "false",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, content=content, headers=headers)

        if response.status_code not in (200, 201):
            try:
                error_body = response.json()
                supabase_msg = (
                    error_body.get("message")
                    or error_body.get("error")
                    or str(error_body)
                )
            except Exception:
                supabase_msg = response.text[:300]
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    f"Falha ao armazenar o documento "
                    f"(HTTP {response.status_code}: {supabase_msg}). "
                    "Verifique se o bucket 'fornecedor-documentos' existe no Supabase Storage."
                ),
            )

    async def _storage_signed_url(self, path: str) -> str:
        url = f"{settings.SUPABASE_URL}/storage/v1/object/sign/{_BUCKET}/{path}"
        headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                json={"expiresIn": settings.SIGNED_URL_TTL_SECONDS},
                headers=headers,
            )

        if response.status_code not in (200, 201):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falha ao gerar URL de download.",
            )

        data = response.json()
        signed_path = data.get("signedURL") or data.get("signedUrl") or ""
        if not signed_path:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Resposta inválida do Supabase Storage ao gerar URL assinada.",
            )

        if signed_path.startswith("http"):
            return signed_path
        return f"{settings.SUPABASE_URL}{signed_path}"

    async def _storage_delete(self, path: str) -> None:
        url = f"{settings.SUPABASE_URL}/storage/v1/object/{_BUCKET}/{path}"
        headers = {"Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.delete(url, headers=headers)


fornecedor_documento_service = FornecedorDocumentoService()
