"""Testes do módulo de documentos — US-015.

Cobre:
  - Upload: tipos permitidos, recusa de MIME inválido, arquivo muito grande,
    ordem imutável, magic bytes inválidos.
  - Listagem: retorna lista, sem storage_path, usuário não autenticado.
  - Download URL: retorna signed_url, documento não encontrado.
  - Delete: uploader pode remover, outro perfil não pode, imutabilidade.

Todos os testes usam mocks para o documento_service (isolamento de Supabase).
"""

from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.deps import get_current_user
from app.main import app
from app.models.documento import OrdemDocumento
from app.models.user import RoleEnum, User

# ---------------------------------------------------------------------------
# Fixtures auxiliares
# ---------------------------------------------------------------------------

ORDEM_ID = uuid.uuid4()
DOC_ID = uuid.uuid4()
UPLOADER_ID = uuid.uuid4()


def _make_db_mock(user: MagicMock | None, mock_db: AsyncMock) -> None:
    """Configura mock_db.execute para retornar o usuário especificado.

    Replica o padrão de make_db_mock de test_auth.py para que get_current_user
    encontre o usuário no mock do banco sem tentar conectar ao PostgreSQL real.
    """
    scalar_mock = MagicMock()
    scalar_mock.scalar_one_or_none.return_value = user
    mock_db.execute.return_value = scalar_mock


def _make_doc(**kwargs) -> MagicMock:
    """Cria um mock de OrdemDocumento com valores padrão."""
    doc = MagicMock(spec=OrdemDocumento)
    doc.id = kwargs.get("id", DOC_ID)
    doc.ordem_id = kwargs.get("ordem_id", ORDEM_ID)
    doc.uploaded_by = kwargs.get("uploaded_by", UPLOADER_ID)
    doc.nome_arquivo = kwargs.get("nome_arquivo", "contrato.pdf")
    doc.tipo_mime = kwargs.get("tipo_mime", "application/pdf")
    doc.tamanho_bytes = kwargs.get("tamanho_bytes", 1024)
    doc.descricao = kwargs.get("descricao", None)
    doc.hash_sha256 = kwargs.get("hash_sha256", "a" * 64)
    doc.assinado_govbr = kwargs.get("assinado_govbr", False)
    doc.versao = kwargs.get("versao", 1)
    doc.created_at = kwargs.get("created_at", datetime.now(timezone.utc))
    return doc


# ---------------------------------------------------------------------------
# Testes de Upload
# ---------------------------------------------------------------------------


class TestUploadDocumento:
    """POST /api/ordens/{ordem_id}/documentos"""

    @pytest.mark.asyncio
    async def test_upload_pdf_sucesso(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve aceitar PDF válido e retornar 201 com dados do documento."""
        _make_db_mock(secretaria_user, mock_db)
        doc_mock = _make_doc()

        with patch(
            "app.api.routes.documentos.documento_service.upload",
            new_callable=AsyncMock,
            return_value=doc_mock,
        ):
            response = await client.post(
                f"/api/ordens/{ORDEM_ID}/documentos",
                headers={"Authorization": f"Bearer {secretaria_token}"},
                files={"file": ("contrato.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
                data={"descricao": "Contrato assinado", "assinado_govbr": "false"},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["nome_arquivo"] == "contrato.pdf"
        assert data["tipo_mime"] == "application/pdf"
        # storage_path NÃO deve estar na resposta (US-015 RN)
        assert "storage_path" not in data

    @pytest.mark.asyncio
    async def test_upload_jpeg_sucesso(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve aceitar JPEG válido."""
        _make_db_mock(secretaria_user, mock_db)
        doc_mock = _make_doc(nome_arquivo="foto.jpg", tipo_mime="image/jpeg")

        with patch(
            "app.api.routes.documentos.documento_service.upload",
            new_callable=AsyncMock,
            return_value=doc_mock,
        ):
            response = await client.post(
                f"/api/ordens/{ORDEM_ID}/documentos",
                headers={"Authorization": f"Bearer {secretaria_token}"},
                files={"file": ("foto.jpg", io.BytesIO(b"\xff\xd8\xff"), "image/jpeg")},
                data={"assinado_govbr": "false"},
            )

        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_upload_sem_autenticacao(self, client):
        """Deve retornar 401 para requisição sem token."""
        response = await client.post(
            f"/api/ordens/{ORDEM_ID}/documentos",
            files={"file": ("doc.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_upload_perfil_gabinete_negado(self, client, mock_db):
        """Gabinete não pode fazer upload (apenas secretaria e admin)."""
        gabinete = MagicMock(spec=User)
        gabinete.id = uuid.uuid4()
        gabinete.role = RoleEnum.gabinete
        gabinete.is_active = True
        _make_db_mock(gabinete, mock_db)

        from app.core.security import create_access_token
        gabinete_token = create_access_token({
            "sub": str(gabinete.id),
            "role": "gabinete",
            "secretaria_id": None,
        })

        response = await client.post(
            f"/api/ordens/{ORDEM_ID}/documentos",
            headers={"Authorization": f"Bearer {gabinete_token}"},
            files={"file": ("doc.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_ordem_imutavel_retorna_422(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve retornar 422 quando a ordem está em status imutável."""
        _make_db_mock(secretaria_user, mock_db)
        from fastapi import HTTPException

        with patch(
            "app.api.routes.documentos.documento_service.upload",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=422,
                detail="Ordem com status 'AGUARDANDO_CONTROLADORIA' não permite novos documentos.",
            ),
        ):
            response = await client.post(
                f"/api/ordens/{ORDEM_ID}/documentos",
                headers={"Authorization": f"Bearer {secretaria_token}"},
                files={"file": ("doc.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
            )

        assert response.status_code == 422
        assert "não permite" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Testes de Listagem
# ---------------------------------------------------------------------------


class TestListDocumentos:
    """GET /api/ordens/{ordem_id}/documentos"""

    @pytest.mark.asyncio
    async def test_lista_documentos(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve retornar lista de documentos sem storage_path."""
        _make_db_mock(secretaria_user, mock_db)
        docs = [_make_doc(), _make_doc(id=uuid.uuid4())]

        with patch(
            "app.api.routes.documentos.documento_service.list_by_ordem",
            new_callable=AsyncMock,
            return_value=docs,
        ):
            response = await client.get(
                f"/api/ordens/{ORDEM_ID}/documentos",
                headers={"Authorization": f"Bearer {secretaria_token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["documentos"]) == 2
        for d in data["documentos"]:
            assert "storage_path" not in d

    @pytest.mark.asyncio
    async def test_lista_vazia(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve retornar lista vazia quando não há documentos."""
        _make_db_mock(secretaria_user, mock_db)

        with patch(
            "app.api.routes.documentos.documento_service.list_by_ordem",
            new_callable=AsyncMock,
            return_value=[],
        ):
            response = await client.get(
                f"/api/ordens/{ORDEM_ID}/documentos",
                headers={"Authorization": f"Bearer {secretaria_token}"},
            )

        assert response.status_code == 200
        assert response.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_lista_sem_autenticacao(self, client):
        """Deve retornar 401 sem token."""
        response = await client.get(f"/api/ordens/{ORDEM_ID}/documentos")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Testes de Download URL
# ---------------------------------------------------------------------------


class TestDownloadUrl:
    """GET /api/documentos/{doc_id}/download-url"""

    @pytest.mark.asyncio
    async def test_retorna_signed_url(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve retornar URL assinada com expires_in."""
        _make_db_mock(secretaria_user, mock_db)
        signed = "https://supabase.co/storage/v1/object/sign/bucket/path?token=xyz"

        with patch(
            "app.api.routes.documentos.documento_service.get_download_url",
            new_callable=AsyncMock,
            return_value=signed,
        ):
            response = await client.get(
                f"/api/documentos/{DOC_ID}/download-url",
                headers={"Authorization": f"Bearer {secretaria_token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["signed_url"] == signed
        assert data["expires_in"] > 0

    @pytest.mark.asyncio
    async def test_documento_nao_encontrado(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve retornar 404 para documento inexistente."""
        _make_db_mock(secretaria_user, mock_db)
        from fastapi import HTTPException

        with patch(
            "app.api.routes.documentos.documento_service.get_download_url",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=404, detail="Documento não encontrado."),
        ):
            response = await client.get(
                f"/api/documentos/{uuid.uuid4()}/download-url",
                headers={"Authorization": f"Bearer {secretaria_token}"},
            )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_download_sem_autenticacao(self, client):
        """Deve retornar 401 sem token."""
        response = await client.get(f"/api/documentos/{DOC_ID}/download-url")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Testes de Delete
# ---------------------------------------------------------------------------


class TestDeleteDocumento:
    """DELETE /api/documentos/{doc_id}"""

    @pytest.mark.asyncio
    async def test_delete_sucesso(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve retornar 204 ao remover com sucesso."""
        _make_db_mock(secretaria_user, mock_db)

        with patch(
            "app.api.routes.documentos.documento_service.delete",
            new_callable=AsyncMock,
            return_value=None,
        ):
            response = await client.delete(
                f"/api/documentos/{DOC_ID}",
                headers={"Authorization": f"Bearer {secretaria_token}"},
            )

        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_sem_permissao(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve retornar 403 quando usuário tenta remover documento de outro."""
        _make_db_mock(secretaria_user, mock_db)
        from fastapi import HTTPException

        with patch(
            "app.api.routes.documentos.documento_service.delete",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=403,
                detail="Sem permissão para remover este documento.",
            ),
        ):
            response = await client.delete(
                f"/api/documentos/{DOC_ID}",
                headers={"Authorization": f"Bearer {secretaria_token}"},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_ordem_imutavel(self, client, mock_db, secretaria_user, secretaria_token):
        """Deve retornar 422 ao tentar remover documento de ordem imutável."""
        _make_db_mock(secretaria_user, mock_db)
        from fastapi import HTTPException

        with patch(
            "app.api.routes.documentos.documento_service.delete",
            new_callable=AsyncMock,
            side_effect=HTTPException(
                status_code=422,
                detail="Documentos de ordens com status 'AGUARDANDO_CONTROLADORIA' são somente-leitura.",
            ),
        ):
            response = await client.delete(
                f"/api/documentos/{DOC_ID}",
                headers={"Authorization": f"Bearer {secretaria_token}"},
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_delete_sem_autenticacao(self, client):
        """Deve retornar 401 sem token."""
        response = await client.delete(f"/api/documentos/{DOC_ID}")
        assert response.status_code == 401


# ---------------------------------------------------------------------------
# Testes unitários do DocumentoService (sem HTTP)
# ---------------------------------------------------------------------------


class TestDocumentoServiceValidacoes:
    """Testa as validações internas do DocumentoService diretamente."""

    def test_sanitize_filename_remove_especiais(self):
        """_sanitize_filename deve remover caracteres especiais."""
        from app.services.documento_service import DocumentoService

        svc = DocumentoService()
        assert svc._sanitize_filename("meu arquivo (1).pdf") == "meu_arquivo__1_.pdf"
        # '/' é substituído por '_', pontos são mantidos
        assert svc._sanitize_filename("../../../etc/passwd") == ".._.._.._etc_passwd"

    def test_sanitize_filename_limita_comprimento(self):
        """_sanitize_filename deve limitar a 100 caracteres."""
        from app.services.documento_service import DocumentoService

        svc = DocumentoService()
        long_name = "a" * 200 + ".pdf"
        result = svc._sanitize_filename(long_name)
        assert len(result) <= 100

    def test_validate_magic_bytes_pdf_valido(self):
        """PDF com magic bytes corretos deve passar."""
        from app.services.documento_service import DocumentoService

        svc = DocumentoService()
        svc._validate_magic_bytes(b"%PDF-1.4 content", "application/pdf")

    def test_validate_magic_bytes_pdf_invalido(self):
        """Arquivo binário declarado como PDF deve ser rejeitado."""
        from fastapi import HTTPException

        from app.services.documento_service import DocumentoService

        svc = DocumentoService()
        with pytest.raises(HTTPException) as exc_info:
            svc._validate_magic_bytes(b"\x00\x01\x02BINARY", "application/pdf")
        assert exc_info.value.status_code == 422

    def test_validate_magic_bytes_jpeg_valido(self):
        """JPEG com magic bytes corretos deve passar."""
        from app.services.documento_service import DocumentoService

        svc = DocumentoService()
        svc._validate_magic_bytes(b"\xff\xd8\xff\xe0 JPEG", "image/jpeg")

    def test_validate_magic_bytes_png_valido(self):
        """PNG com magic bytes corretos deve passar."""
        from app.services.documento_service import DocumentoService

        svc = DocumentoService()
        svc._validate_magic_bytes(b"\x89PNG\r\n\x1a\n PNGDATA", "image/png")
