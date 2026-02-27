"""Serviço de documentos anexados às ordens — US-015.

Responsabilidades:
  - upload(): valida tipo/tamanho/magic bytes, calcula SHA-256, envia ao Supabase
              Storage, registra metadados no banco.
  - list_by_ordem(): lista documentos de uma ordem em ordem cronológica.
  - get_download_url(): gera URL assinada (TTL configurável) — nunca expõe
                        storage_path diretamente.
  - delete(): remove do Storage e do banco, com verificações de permissão
              e imutabilidade.

Arquitetura de segurança:
  - Bucket privado "ordem-documentos" — sem acesso público.
  - Upload e remoção usam SUPABASE_SERVICE_ROLE_KEY (server-side only).
  - URL assinada gerada server-side com TTL de 900s (15 min).
  - Magic bytes validados além do MIME type declarado.
  - Imutabilidade após AGUARDANDO_CONTROLADORIA aplicada no service.
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
from app.models.documento import OrdemDocumento
from app.models.enums import StatusOrdemEnum
from app.models.ordem import Ordem

# ---------------------------------------------------------------------------
# Constantes de validação
# ---------------------------------------------------------------------------

# Tipos MIME permitidos com seus respectivos magic bytes
_MAGIC_BYTES: dict[str, bytes] = {
    "application/pdf": b"%PDF",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
}

_ALLOWED_MIMES = frozenset(_MAGIC_BYTES.keys())

# Status após os quais documentos são somente-leitura (US-015 RN)
# US-016: statuses que NÃO permitem upload de novos documentos.
# Permitidos: AGUARDANDO_GABINETE (criação), DEVOLVIDA_PARA_ALTERACAO (edição),
#             AGUARDANDO_DOCUMENTACAO (Controladoria solicitou documentação).
_STATUSES_IMUTAVEIS: frozenset[StatusOrdemEnum] = frozenset({
    StatusOrdemEnum.AGUARDANDO_CONTROLADORIA,
    StatusOrdemEnum.AGUARDANDO_EMPENHO,
    StatusOrdemEnum.AGUARDANDO_EXECUCAO,
    StatusOrdemEnum.AGUARDANDO_ATESTO,
    StatusOrdemEnum.AGUARDANDO_LIQUIDACAO,
    StatusOrdemEnum.AGUARDANDO_PAGAMENTO,
    StatusOrdemEnum.PAGA,
    StatusOrdemEnum.CANCELADA,
    StatusOrdemEnum.COM_IRREGULARIDADE,
    StatusOrdemEnum.EXECUCAO_COM_PENDENCIA,
})


# ---------------------------------------------------------------------------
# DocumentoService
# ---------------------------------------------------------------------------


class DocumentoService:
    """Gerencia o ciclo de vida de documentos anexados às ordens.

    US-015: documentos são armazenados no Supabase Storage (bucket privado).
    Acesso ao conteúdo sempre via URL assinada — nunca por storage_path direto.
    """

    async def upload(
        self,
        db: AsyncSession,
        ordem_id: uuid.UUID,
        uploader_id: uuid.UUID,
        file: UploadFile,
        descricao: str | None,
        assinado_govbr: bool,
    ) -> OrdemDocumento:
        """Faz upload de um documento e registra metadados no banco.

        Fluxo:
          1. Verifica existência e imutabilidade da ordem.
          2. Lê o conteúdo e valida tamanho.
          3. Valida MIME type declarado e magic bytes.
          4. Calcula SHA-256 do conteúdo.
          5. Constrói storage_path e envia ao Supabase Storage.
          6. Persiste OrdemDocumento no banco.

        Raises:
            HTTPException 404: ordem não encontrada.
            HTTPException 422: ordem imutável, tamanho excedido, MIME inválido,
                               magic bytes não conferem, arquivo vazio.
            HTTPException 500: falha de comunicação com Supabase Storage.
        """
        # 1. Buscar e validar a ordem
        ordem = await self._get_ordem_or_404(db, ordem_id)

        if ordem.status in _STATUSES_IMUTAVEIS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Ordem com status '{ordem.status.value}' não permite "
                    "novos documentos."
                ),
            )

        # 2. Ler conteúdo
        content = await file.read()

        if len(content) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Arquivo vazio não é permitido.",
            )

        if len(content) > settings.MAX_UPLOAD_SIZE_BYTES:
            limit_mb = settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Arquivo excede o tamanho máximo de {limit_mb} MB.",
            )

        # 3. Validar MIME declarado
        declared_mime = (file.content_type or "").strip()
        if declared_mime not in _ALLOWED_MIMES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Tipo de arquivo não permitido. "
                    "Formatos aceitos: PDF, JPEG, PNG."
                ),
            )

        # 4. Validar magic bytes (defense in depth)
        self._validate_magic_bytes(content, declared_mime)

        # 5. SHA-256
        sha256 = hashlib.sha256(content).hexdigest()

        # 6. Construir path no bucket
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
        safe_name = self._sanitize_filename(file.filename or "arquivo")
        storage_path = (
            f"{ordem.secretaria_id}/{ordem_id}/{timestamp}_{safe_name}"
        )

        # 7. Upload ao Supabase Storage
        await self._storage_upload(storage_path, content, declared_mime)

        # 8. Persistir no banco
        doc = OrdemDocumento(
            ordem_id=ordem_id,
            uploaded_by=uploader_id,
            nome_arquivo=file.filename or "arquivo",
            tipo_mime=declared_mime,
            tamanho_bytes=len(content),
            descricao=descricao,
            storage_path=storage_path,
            hash_sha256=sha256,
            assinado_govbr=assinado_govbr,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

    async def list_by_ordem(
        self,
        db: AsyncSession,
        ordem_id: uuid.UUID,
    ) -> list[OrdemDocumento]:
        """Retorna todos os documentos de uma ordem em ordem cronológica."""
        result = await db.execute(
            select(OrdemDocumento)
            .where(OrdemDocumento.ordem_id == ordem_id)
            .order_by(OrdemDocumento.created_at)
        )
        return list(result.scalars().all())

    async def get_download_url(
        self,
        db: AsyncSession,
        doc_id: uuid.UUID,
    ) -> str:
        """Gera URL assinada para download do arquivo (TTL: SIGNED_URL_TTL_SECONDS).

        US-015: storage_path NUNCA exposto. Acesso somente via URL assinada.
        """
        doc = await self._get_doc_or_404(db, doc_id)
        return await self._storage_signed_url(doc.storage_path)

    async def delete(
        self,
        db: AsyncSession,
        doc_id: uuid.UUID,
        requester_id: uuid.UUID,
        requester_role: str,
    ) -> None:
        """Remove documento do Storage e do banco.

        Regras:
          - Somente o uploader original ou admin podem remover.
          - Proibido se a ordem estiver em status imutável.

        Raises:
            HTTPException 404: documento não encontrado.
            HTTPException 403: sem permissão para remover.
            HTTPException 422: documento imutável.
            HTTPException 500: falha ao remover do Storage.
        """
        doc = await self._get_doc_or_404(db, doc_id)

        # Verificar permissão
        if requester_role != "admin" and doc.uploaded_by != requester_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sem permissão para remover este documento.",
            )

        # Verificar imutabilidade da ordem
        ordem = await self._get_ordem_or_404(db, doc.ordem_id)
        if ordem.status in _STATUSES_IMUTAVEIS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Documentos de ordens com status '{ordem.status.value}' "
                    "são somente-leitura."
                ),
            )

        # Remover do Storage (falha tolerada: log apenas)
        await self._storage_delete(doc.storage_path)

        # Remover do banco
        await db.delete(doc)
        await db.commit()

    # -----------------------------------------------------------------------
    # Helpers privados
    # -----------------------------------------------------------------------

    async def _get_ordem_or_404(
        self, db: AsyncSession, ordem_id: uuid.UUID
    ) -> Ordem:
        result = await db.execute(select(Ordem).where(Ordem.id == ordem_id))
        ordem = result.scalar_one_or_none()
        if not ordem:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ordem não encontrada.",
            )
        return ordem

    async def _get_doc_or_404(
        self, db: AsyncSession, doc_id: uuid.UUID
    ) -> OrdemDocumento:
        result = await db.execute(
            select(OrdemDocumento).where(OrdemDocumento.id == doc_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Documento não encontrado.",
            )
        return doc

    def _validate_magic_bytes(self, content: bytes, mime: str) -> None:
        """Valida se os primeiros bytes do arquivo correspondem ao MIME declarado.

        Defense in depth: impede que um atacante renomeie um executável como PDF.
        """
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
        """Remove caracteres especiais do nome do arquivo para uso no path."""
        sanitized = re.sub(r"[^\w.\-]", "_", filename)
        return sanitized[:100]  # limita comprimento para evitar paths longos

    async def ensure_bucket(self) -> None:
        """Cria o bucket no Supabase Storage se ainda não existir (idempotente).

        Chamado no startup da aplicação (lifespan) — não afeta o desempenho
        das requisições.  409 = bucket já existe: aceito como sucesso.
        """
        url = f"{settings.SUPABASE_URL}/storage/v1/bucket"
        headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "id": settings.SUPABASE_STORAGE_BUCKET,
            "name": settings.SUPABASE_STORAGE_BUCKET,
            "public": False,
            "fileSizeLimit": settings.MAX_UPLOAD_SIZE_BYTES,
            "allowedMimeTypes": list(_ALLOWED_MIMES),
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)

        # 200/201 = criado agora; 400/409 = já existia — todos OK
        # (Supabase pode retornar 400 ou 409 para "bucket já existe")
        # Outros erros são logados mas não bloqueiam o startup
        if response.status_code not in (200, 201, 400, 409):
            try:
                body = response.json()
                msg = body.get("message") or body.get("error") or str(body)
            except Exception:
                msg = response.text[:200]
            # Aviso no stderr — não levanta exceção para não impedir o startup
            import sys
            print(
                f"[AVISO] Não foi possível garantir o bucket "
                f"'{settings.SUPABASE_STORAGE_BUCKET}' "
                f"(HTTP {response.status_code}: {msg}). "
                "Verifique SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e Storage.",
                file=sys.stderr,
            )

    async def _storage_upload(
        self, path: str, content: bytes, mime: str
    ) -> None:
        """Envia arquivo ao Supabase Storage via REST API.

        Usa SUPABASE_SERVICE_ROLE_KEY (server-side) — nunca expor ao client.
        """
        url = (
            f"{settings.SUPABASE_URL}/storage/v1/object"
            f"/{settings.SUPABASE_STORAGE_BUCKET}/{path}"
        )
        headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": mime,
            "x-upsert": "false",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, content=content, headers=headers)

        if response.status_code not in (200, 201):
            # Extrai a mensagem real do Supabase para facilitar o diagnóstico
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
                    "Verifique se o bucket 'ordem-documentos' existe no "
                    "Supabase Storage e se as credenciais estão corretas."
                ),
            )

    async def _storage_signed_url(self, path: str) -> str:
        """Obtém URL assinada do Supabase Storage (TTL: SIGNED_URL_TTL_SECONDS)."""
        url = (
            f"{settings.SUPABASE_URL}/storage/v1/object/sign"
            f"/{settings.SUPABASE_STORAGE_BUCKET}/{path}"
        )
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

        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falha ao gerar URL de download.",
            )

        data = response.json()
        # Supabase pode retornar "/storage/v1/object/sign/..." (formato antigo)
        # ou "/object/sign/..." (formato atual) — normalizamos para garantir
        # que a URL final sempre inclua /storage/v1.
        signed_path = data.get("signedURL") or data.get("signedUrl", "")
        if signed_path.startswith("/storage/v1"):
            return f"{settings.SUPABASE_URL}{signed_path}"
        elif signed_path.startswith("/"):
            return f"{settings.SUPABASE_URL}/storage/v1{signed_path}"
        return signed_path

    async def _storage_delete(self, path: str) -> None:
        """Remove arquivo do Supabase Storage.

        Tolerante a 404 (arquivo pode já não existir).
        """
        url = (
            f"{settings.SUPABASE_URL}/storage/v1/object"
            f"/{settings.SUPABASE_STORAGE_BUCKET}"
        )
        headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.delete(
                url,
                json={"prefixes": [path]},
                headers=headers,
            )

        # 200 = removido, 404 = já não existia — ambos são aceitáveis
        if response.status_code not in (200, 404):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falha ao remover o documento do armazenamento.",
            )


documento_service = DocumentoService()
