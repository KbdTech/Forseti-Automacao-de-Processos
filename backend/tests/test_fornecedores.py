"""Testes para o módulo de Fornecedores — S11.1.

Cobre:
  - CRUD de fornecedores (HTTP via AsyncClient)
  - Scoping RBAC (secretaria vê apenas própria + globais)
  - CNPJ único → HTTP 409
  - CNPJ inválido → HTTP 422 (validação Pydantic)
  - Perfil não-admin → HTTP 403 em POST/PUT/PATCH
  - Criação de ordem sem fornecedor_id → HTTP 422 (Pydantic)
  - Criação de ordem com fornecedor inativo → HTTP 422 (service)
  - Criação de ordem com fornecedor válido → 201

S11.1 Cenários 1–9 e Cenário 2b de S11.1 (OrdemCreate sem fornecedor_id).
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.models.fornecedor import Fornecedor
from app.models.secretaria import Secretaria
from app.models.user import RoleEnum, User
from app.schemas.fornecedor import FornecedorListResponse, FornecedorResponse
from app.services.fornecedor_service import FornecedorService


# ===========================================================================
# Helpers de fixture
# ===========================================================================


def make_user(
    role: RoleEnum = RoleEnum.admin,
    secretaria_id: uuid.UUID | None = None,
) -> MagicMock:
    u = MagicMock(spec=User)
    u.id = uuid.uuid4()
    u.email = f"{role.value}@prefeitura.gov.br"
    u.nome_completo = f"Usuário {role.value.title()}"
    u.role = role
    u.is_active = True
    u.first_login = False
    u.secretaria_id = secretaria_id or (uuid.uuid4() if role == RoleEnum.secretaria else None)
    u.created_at = datetime.now(timezone.utc)
    u.updated_at = datetime.now(timezone.utc)
    return u


def make_fornecedor(
    cnpj: str = "12345678000195",
    secretaria_id: uuid.UUID | None = None,
    is_active: bool = True,
) -> MagicMock:
    f = MagicMock(spec=Fornecedor)
    f.id = uuid.uuid4()
    f.razao_social = "Construtora Teste Ltda."
    f.nome_fantasia = None
    f.cnpj = cnpj
    f.numero_processo = None
    f.objeto_contrato = None
    f.valor_contratado = None
    f.data_contrato = None
    f.banco = "Banco do Brasil"
    f.agencia = "1234"
    f.conta = "56789-0"
    f.tipo_conta = "corrente"
    f.secretaria_id = secretaria_id
    f.secretaria = None
    f.is_active = is_active
    f.created_at = datetime.now(timezone.utc)
    f.updated_at = datetime.now(timezone.utc)
    return f


def make_fornecedor_response(fornecedor: MagicMock) -> FornecedorResponse:
    return FornecedorResponse(
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
        secretaria_nome=None,
        is_active=fornecedor.is_active,
        created_at=fornecedor.created_at,
        updated_at=fornecedor.updated_at,
    )


def make_token(user: MagicMock) -> str:
    return create_access_token({
        "sub": str(user.id),
        "role": user.role.value,
        "secretaria_id": str(user.secretaria_id) if user.secretaria_id else None,
    })


def make_db() -> AsyncMock:
    db = AsyncMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    db.rollback = AsyncMock()
    return db


# ===========================================================================
# Fixture de cliente HTTP com overrides
# ===========================================================================


@pytest.fixture
def admin_user() -> MagicMock:
    return make_user(role=RoleEnum.admin, secretaria_id=None)


@pytest.fixture
def secretaria_user() -> MagicMock:
    return make_user(role=RoleEnum.secretaria)


@pytest.fixture
def gabinete_user() -> MagicMock:
    return make_user(role=RoleEnum.gabinete)


@pytest.fixture
def mock_db() -> AsyncMock:
    return make_db()


@pytest.fixture
async def admin_client(admin_user: MagicMock, mock_db: AsyncMock) -> AsyncClient:
    """Cliente HTTP autenticado como admin."""
    overrides_backup = app.dependency_overrides.copy()

    async def _get_db():
        yield mock_db

    async def _get_admin():
        return admin_user

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_user] = _get_admin

    async with AsyncClient(
        transport=__import__("httpx").ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides = overrides_backup


@pytest.fixture
async def secretaria_client(secretaria_user: MagicMock, mock_db: AsyncMock) -> AsyncClient:
    """Cliente HTTP autenticado como secretaria."""
    overrides_backup = app.dependency_overrides.copy()

    async def _get_db():
        yield mock_db

    async def _get_secretaria():
        return secretaria_user

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_user] = _get_secretaria

    async with AsyncClient(
        transport=__import__("httpx").ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides = overrides_backup


@pytest.fixture
async def gabinete_client(gabinete_user: MagicMock, mock_db: AsyncMock) -> AsyncClient:
    """Cliente HTTP autenticado como gabinete (não-admin)."""
    overrides_backup = app.dependency_overrides.copy()

    async def _get_db():
        yield mock_db

    async def _get_gabinete():
        return gabinete_user

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_user] = _get_gabinete

    async with AsyncClient(
        transport=__import__("httpx").ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides = overrides_backup


# ===========================================================================
# POST /api/fornecedores — criar fornecedor
# ===========================================================================

SERVICE = "app.api.routes.fornecedores.fornecedor_service"


async def test_create_fornecedor_admin_sucesso(
    admin_client: AsyncClient,
    admin_user: MagicMock,
) -> None:
    """S11.1 Cenário 3: admin cria fornecedor com dados válidos → 201."""
    fornecedor = make_fornecedor()
    expected = make_fornecedor_response(fornecedor)

    with patch(f"{SERVICE}.create_fornecedor", new_callable=AsyncMock, return_value=expected):
        resp = await admin_client.post(
            "/api/fornecedores/",
            json={
                "razao_social": "Construtora Teste Ltda.",
                "cnpj": "12345678000195",
                "tipo_conta": "corrente",
            },
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["cnpj"] == "12345678000195"
    assert body["razao_social"] == "Construtora Teste Ltda."


async def test_create_fornecedor_cnpj_invalido(
    admin_client: AsyncClient,
) -> None:
    """S11.1: CNPJ com menos de 14 dígitos → 422 (validação Pydantic)."""
    resp = await admin_client.post(
        "/api/fornecedores/",
        json={
            "razao_social": "Empresa X",
            "cnpj": "1234567",  # inválido: < 14 dígitos
            "tipo_conta": "corrente",
        },
    )
    assert resp.status_code == 422


async def test_create_fornecedor_cnpj_com_pontuacao(
    admin_client: AsyncClient,
) -> None:
    """S11.1: CNPJ com pontuação (XX.XXX.XXX/XXXX-XX) → 422 (campo exige apenas dígitos)."""
    resp = await admin_client.post(
        "/api/fornecedores/",
        json={
            "razao_social": "Empresa X",
            "cnpj": "12.345.678/0001-95",  # inválido: tem pontuação
            "tipo_conta": "corrente",
        },
    )
    assert resp.status_code == 422


async def test_create_fornecedor_cnpj_duplicado(
    admin_client: AsyncClient,
) -> None:
    """S11.1 Cenário 4: CNPJ já cadastrado → 409."""
    from fastapi import HTTPException

    with patch(
        f"{SERVICE}.create_fornecedor",
        new_callable=AsyncMock,
        side_effect=HTTPException(status_code=409, detail="CNPJ já cadastrado no sistema."),
    ):
        resp = await admin_client.post(
            "/api/fornecedores/",
            json={
                "razao_social": "Outra Empresa",
                "cnpj": "12345678000195",
                "tipo_conta": "corrente",
            },
        )

    assert resp.status_code == 409
    assert "CNPJ" in resp.json()["detail"]


async def test_create_fornecedor_nao_admin_403(
    gabinete_client: AsyncClient,
) -> None:
    """S11.1 Cenário 9: perfil não-admin não pode criar fornecedor → 403."""
    resp = await gabinete_client.post(
        "/api/fornecedores/",
        json={
            "razao_social": "Empresa Proibida",
            "cnpj": "12345678000195",
            "tipo_conta": "corrente",
        },
    )
    assert resp.status_code == 403


async def test_create_fornecedor_secretaria_403(
    secretaria_client: AsyncClient,
) -> None:
    """S11.1 Cenário 9: perfil secretaria não pode criar fornecedor → 403."""
    resp = await secretaria_client.post(
        "/api/fornecedores/",
        json={
            "razao_social": "Empresa Proibida",
            "cnpj": "12345678000195",
            "tipo_conta": "corrente",
        },
    )
    assert resp.status_code == 403


# ===========================================================================
# GET /api/fornecedores — listar fornecedores
# ===========================================================================


async def test_list_fornecedores_admin(
    admin_client: AsyncClient,
) -> None:
    """S11.1 Cenário 6: admin lista todos os fornecedores → 200."""
    fornecedor = make_fornecedor()
    expected = FornecedorListResponse(
        items=[make_fornecedor_response(fornecedor)],
        total=1,
        page=1,
        pages=1,
    )

    with patch(f"{SERVICE}.list_fornecedores", new_callable=AsyncMock, return_value=expected):
        resp = await admin_client.get("/api/fornecedores/")

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1


async def test_list_fornecedores_secretaria_scoping(
    secretaria_client: AsyncClient,
    secretaria_user: MagicMock,
) -> None:
    """S11.1 Cenário 5: secretaria vê apenas próprios + globais (scoping no service)."""
    # Retorno contém apenas 1 fornecedor (scoping já aplicado)
    fornecedor_global = make_fornecedor(secretaria_id=None)
    expected = FornecedorListResponse(
        items=[make_fornecedor_response(fornecedor_global)],
        total=1,
        page=1,
        pages=1,
    )

    with patch(f"{SERVICE}.list_fornecedores", new_callable=AsyncMock, return_value=expected) as mock_list:
        resp = await secretaria_client.get("/api/fornecedores/")

    assert resp.status_code == 200
    # Verifica que o service foi chamado com o user correto
    mock_list.assert_called_once()
    call_kwargs = mock_list.call_args.kwargs
    assert call_kwargs["user"].role == RoleEnum.secretaria


# ===========================================================================
# PATCH /api/fornecedores/{id}/status — ativar/desativar
# ===========================================================================


async def test_toggle_status_desativar_admin(
    admin_client: AsyncClient,
) -> None:
    """S11.1 Cenário 8: admin desativa fornecedor → 200."""
    fornecedor = make_fornecedor(is_active=False)
    expected = make_fornecedor_response(fornecedor)
    expected.is_active = False

    with patch(f"{SERVICE}.toggle_status", new_callable=AsyncMock, return_value=expected):
        resp = await admin_client.patch(
            f"/api/fornecedores/{fornecedor.id}/status",
            json={"is_active": False},
        )

    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


async def test_toggle_status_nao_admin_403(
    gabinete_client: AsyncClient,
) -> None:
    """S11.1 Cenário 9: não-admin não pode alterar status → 403."""
    resp = await gabinete_client.patch(
        f"/api/fornecedores/{uuid.uuid4()}/status",
        json={"is_active": False},
    )
    assert resp.status_code == 403


# ===========================================================================
# PUT /api/fornecedores/{id} — editar
# ===========================================================================


async def test_update_fornecedor_admin(
    admin_client: AsyncClient,
) -> None:
    """S11.1 Cenário 7: admin edita fornecedor → 200."""
    fornecedor = make_fornecedor()
    fornecedor.razao_social = "Construtora Atualizada Ltda."
    expected = make_fornecedor_response(fornecedor)

    with patch(f"{SERVICE}.update_fornecedor", new_callable=AsyncMock, return_value=expected):
        resp = await admin_client.put(
            f"/api/fornecedores/{fornecedor.id}",
            json={"razao_social": "Construtora Atualizada Ltda."},
        )

    assert resp.status_code == 200
    assert resp.json()["razao_social"] == "Construtora Atualizada Ltda."


async def test_update_fornecedor_nao_admin_403(
    secretaria_client: AsyncClient,
) -> None:
    """S11.1 Cenário 9: secretaria não pode editar fornecedor → 403."""
    resp = await secretaria_client.put(
        f"/api/fornecedores/{uuid.uuid4()}",
        json={"razao_social": "Tentativa Proibida"},
    )
    assert resp.status_code == 403


# ===========================================================================
# Testes unitários do FornecedorService (sem HTTP)
# ===========================================================================


@pytest.mark.asyncio
async def test_service_create_cnpj_duplicado() -> None:
    """S11.1 Cenário 4: service retorna HTTP 409 quando CNPJ já existe."""
    from fastapi import HTTPException

    service = FornecedorService()
    db = AsyncMock()

    # execute retorna um fornecedor existente (cnpj duplicado)
    existing_mock = MagicMock()
    existing_mock.scalar_one_or_none.return_value = make_fornecedor()
    db.execute = AsyncMock(return_value=existing_mock)

    from app.schemas.fornecedor import FornecedorCreate

    data = FornecedorCreate(
        razao_social="Empresa Dup",
        cnpj="12345678000195",
        tipo_conta="corrente",
    )
    user = make_user(role=RoleEnum.admin)

    with pytest.raises(HTTPException) as exc_info:
        await service.create_fornecedor(db=db, data=data, user=user)

    assert exc_info.value.status_code == 409
    assert "CNPJ" in exc_info.value.detail


@pytest.mark.asyncio
async def test_service_list_scoping_secretaria() -> None:
    """S11.1 Cenário 5: scoping aplica filtro secretaria_id IS NULL OR = user.secretaria_id."""
    service = FornecedorService()
    db = AsyncMock()

    # Simula resultado vazio
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = []
    count_mock = MagicMock()
    count_mock.scalar_one.return_value = 0

    db.execute = AsyncMock(side_effect=[count_mock, result_mock])

    user = make_user(role=RoleEnum.secretaria)
    result = await service.list_fornecedores(db=db, user=user)

    assert result.total == 0
    assert result.items == []


@pytest.mark.asyncio
async def test_service_toggle_status_nao_encontrado() -> None:
    """Service retorna HTTP 404 quando fornecedor não existe."""
    from fastapi import HTTPException

    service = FornecedorService()
    db = AsyncMock()

    # execute retorna None (não encontrado)
    not_found_mock = MagicMock()
    not_found_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=not_found_mock)

    user = make_user(role=RoleEnum.admin)
    with pytest.raises(HTTPException) as exc_info:
        await service.toggle_status(db=db, fornecedor_id=uuid.uuid4(), is_active=False, user=user)

    assert exc_info.value.status_code == 404


# ===========================================================================
# Testes de OrdemCreate com fornecedor_id (S11.1 Cenário 2b e S11.3)
# ===========================================================================


async def test_create_ordem_sem_fornecedor_id(
    secretaria_client: AsyncClient,
) -> None:
    """S11.1 Cenário 2b: POST /api/ordens sem fornecedor_id → 422 (Pydantic)."""
    resp = await secretaria_client.post(
        "/api/ordens/",
        json={
            "tipo": "compra",
            "prioridade": "normal",
            "valor_estimado": "1000.00",
            "justificativa": "x" * 50,
            # fornecedor_id AUSENTE — deve rejeitar
        },
    )
    assert resp.status_code == 422
    # Verifica que a mensagem menciona fornecedor_id
    errors = resp.json().get("detail", [])
    field_errors = [e.get("loc", []) for e in errors] if isinstance(errors, list) else []
    assert any("fornecedor_id" in str(loc) for loc in field_errors)


async def test_create_ordem_fornecedor_inativo(
    secretaria_client: AsyncClient,
    secretaria_user: MagicMock,
) -> None:
    """S11.3 Cenário 4: fornecedor inativo → 422."""
    from fastapi import HTTPException

    fornecedor_id = uuid.uuid4()
    with patch(
        "app.api.routes.ordens.ordem_service.create_ordem",
        new_callable=AsyncMock,
        side_effect=HTTPException(
            status_code=422,
            detail="Fornecedor inativo. Selecione um fornecedor ativo.",
        ),
    ):
        resp = await secretaria_client.post(
            "/api/ordens/",
            json={
                "tipo": "compra",
                "prioridade": "normal",
                "valor_estimado": "1000.00",
                "justificativa": "x" * 50,
                "fornecedor_id": str(fornecedor_id),
            },
        )

    assert resp.status_code == 422
    assert "inativo" in resp.json()["detail"].lower()


async def test_create_ordem_fornecedor_nao_encontrado(
    secretaria_client: AsyncClient,
) -> None:
    """S11.3 Cenário 3: fornecedor não existe → 422."""
    from fastapi import HTTPException

    fornecedor_id = uuid.uuid4()
    with patch(
        "app.api.routes.ordens.ordem_service.create_ordem",
        new_callable=AsyncMock,
        side_effect=HTTPException(
            status_code=422,
            detail="Fornecedor não encontrado.",
        ),
    ):
        resp = await secretaria_client.post(
            "/api/ordens/",
            json={
                "tipo": "compra",
                "prioridade": "normal",
                "valor_estimado": "1000.00",
                "justificativa": "x" * 50,
                "fornecedor_id": str(fornecedor_id),
            },
        )

    assert resp.status_code == 422


# ===========================================================================
# Teste unitário do OrdemService.create_ordem — validação de fornecedor
# ===========================================================================


@pytest.mark.asyncio
async def test_ordem_service_create_fornecedor_inativo() -> None:
    """S11.1/S11.3: ordem_service recusa criação quando fornecedor inativo."""
    from fastapi import HTTPException

    from app.services.ordem_service import OrdemService

    service = OrdemService()
    db = AsyncMock()

    # db.execute é chamado 2x:
    #   1. Para validar secretaria → retorna secretaria ativa
    #   2. Para _gerar_protocolo (FOR UPDATE) → retorna None (sem ordens existentes)
    sec_mock = MagicMock(spec=Secretaria)
    sec_mock.ativo = True
    sec_result = MagicMock()
    sec_result.scalar_one_or_none.return_value = sec_mock

    proto_result = MagicMock()
    proto_result.scalar_one_or_none.return_value = None  # sem protocolos → seq=1

    db.execute = AsyncMock(side_effect=[sec_result, proto_result])

    # db.get chamado para Fornecedor → retorna inativo
    fornecedor_inativo = make_fornecedor(is_active=False)
    db.get = AsyncMock(return_value=fornecedor_inativo)

    from app.schemas.ordem import OrdemCreate

    user = make_user(role=RoleEnum.secretaria)
    user.secretaria_id = uuid.uuid4()

    data = OrdemCreate(
        tipo="compra",
        prioridade="normal",
        valor_estimado=Decimal("1000.00"),
        justificativa="x" * 50,
        fornecedor_id=fornecedor_inativo.id,
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.create_ordem(db=db, data=data, user=user)

    assert exc_info.value.status_code == 422
    assert "inativo" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_ordem_service_create_fornecedor_inexistente() -> None:
    """S11.1/S11.3: ordem_service recusa criação quando fornecedor não encontrado."""
    from fastapi import HTTPException

    from app.services.ordem_service import OrdemService

    service = OrdemService()
    db = AsyncMock()

    # db.execute chamado 2x: secretaria + protocolo
    sec_mock = MagicMock(spec=Secretaria)
    sec_mock.ativo = True
    sec_result = MagicMock()
    sec_result.scalar_one_or_none.return_value = sec_mock

    proto_result = MagicMock()
    proto_result.scalar_one_or_none.return_value = None

    db.execute = AsyncMock(side_effect=[sec_result, proto_result])

    # db.get retorna None → fornecedor não encontrado
    db.get = AsyncMock(return_value=None)

    from app.schemas.ordem import OrdemCreate

    user = make_user(role=RoleEnum.secretaria)
    user.secretaria_id = uuid.uuid4()

    data = OrdemCreate(
        tipo="compra",
        prioridade="normal",
        valor_estimado=Decimal("1000.00"),
        justificativa="x" * 50,
        fornecedor_id=uuid.uuid4(),
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.create_ordem(db=db, data=data, user=user)

    assert exc_info.value.status_code == 422
    assert "não encontrado" in exc_info.value.detail.lower()
