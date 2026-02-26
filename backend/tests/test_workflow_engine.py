"""Testes unitários do WorkflowEngine — máquina de estados das Ordens.

Cobre:
  - execute_transition: todos os caminhos de validação (a → k)
  - Ordem 404
  - Transição inválida para o status atual (422)
  - Perfil sem permissão (403)
  - Escopo de secretaria incorreto (403)
  - Observação obrigatória ausente ou curta (422)
  - Transição bem-sucedida: atualização de status, historico append-only
  - Efeitos colaterais automáticos: versao (reenviar), data_empenho, data_atesto/atestado_por
  - Aplicação de dados_extras ao modelo
  - Estabilidade da tabela TRANSITIONS (14 entradas)

CLAUDE.md §6: 14 transições da máquina de estados.
US-012 RN-60: ordem_historico append-only.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.enums import StatusOrdemEnum
from app.models.ordem import Ordem
from app.models.ordem_historico import OrdemHistorico
from app.models.user import RoleEnum, User
from app.services.workflow_engine import WorkflowEngine, workflow_engine


# ---------------------------------------------------------------------------
# Helpers de fixture
# ---------------------------------------------------------------------------


def make_ordem(
    status: StatusOrdemEnum = StatusOrdemEnum.AGUARDANDO_GABINETE,
    secretaria_id: uuid.UUID | None = None,
) -> MagicMock:
    """Cria um mock de Ordem com os campos mínimos para o engine."""
    o = MagicMock(spec=Ordem)
    o.id = uuid.uuid4()
    o.status = status
    o.secretaria_id = secretaria_id or uuid.uuid4()
    o.versao = 1
    o.data_empenho = None
    o.data_atesto = None
    o.atestado_por = None
    o.updated_at = datetime.now(timezone.utc)
    return o


def make_user(
    role: RoleEnum = RoleEnum.gabinete,
    secretaria_id: uuid.UUID | None = None,
) -> MagicMock:
    """Cria um mock de User com role e secretaria_id configuráveis."""
    u = MagicMock(spec=User)
    u.id = uuid.uuid4()
    u.role = role
    u.secretaria_id = secretaria_id
    return u


def make_db(ordem: MagicMock | None) -> AsyncMock:
    """Cria AsyncSession mockada que devolve `ordem` no execute()."""
    db = AsyncMock()
    scalar_mock = MagicMock()
    scalar_mock.scalar_one_or_none.return_value = ordem
    db.execute = AsyncMock(return_value=scalar_mock)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# 1. TRANSITIONS — integridade estrutural
# ---------------------------------------------------------------------------


def test_transitions_has_14_entries() -> None:
    """CLAUDE.md §6: a tabela de transições deve conter exatamente 14 entradas."""
    assert len(WorkflowEngine.TRANSITIONS) == 14


def test_all_terminal_states_are_not_in_transitions() -> None:
    """PAGA e CANCELADA são estados terminais — não podem ser origem de transição."""
    terminal = {StatusOrdemEnum.PAGA, StatusOrdemEnum.CANCELADA}
    origens = {status for (status, _) in WorkflowEngine.TRANSITIONS}
    assert not terminal.intersection(origens), (
        "Estados terminais não devem aparecer como origem de transição."
    )


def test_secretaria_scoped_actions_set() -> None:
    """As 5 ações que exigem verificação de secretaria estão no frozenset."""
    esperadas = {"reenviar", "enviar_documentacao", "iniciar_atesto", "atestar", "recusar_atesto"}
    assert esperadas == WorkflowEngine._SECRETARIA_SCOPED_ACTIONS


# ---------------------------------------------------------------------------
# 2. execute_transition — etapa (a): ordem não encontrada
# ---------------------------------------------------------------------------


async def test_ordem_not_found_raises_404() -> None:
    """Se a ordem não existe no banco, deve levantar HTTPException 404."""
    from fastapi import HTTPException

    db = make_db(ordem=None)
    user = make_user(RoleEnum.gabinete)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=uuid.uuid4(),
            acao="autorizar",
            user=user,
            observacao=None,
            ip_address="127.0.0.1",
        )

    assert exc_info.value.status_code == 404
    assert "não encontrada" in exc_info.value.detail.lower()


# ---------------------------------------------------------------------------
# 3. execute_transition — etapa (b): transição inválida para o status
# ---------------------------------------------------------------------------


async def test_invalid_transition_raises_422() -> None:
    """Ação incompatível com o status atual deve levantar 422."""
    from fastapi import HTTPException

    # AGUARDANDO_GABINETE não aceita 'pagar'
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_GABINETE)
    db = make_db(ordem)
    user = make_user(RoleEnum.tesouraria)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="pagar",
            user=user,
            observacao=None,
            ip_address=None,
        )

    assert exc_info.value.status_code == 422
    assert "pagar" in exc_info.value.detail
    assert "AGUARDANDO_GABINETE" in exc_info.value.detail


# ---------------------------------------------------------------------------
# 4. execute_transition — etapa (c): perfil sem permissão
# ---------------------------------------------------------------------------


async def test_wrong_role_raises_403() -> None:
    """Perfil sem permissão para a ação deve levantar 403."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_GABINETE)
    db = make_db(ordem)
    user = make_user(RoleEnum.secretaria)  # secretaria não pode 'autorizar'

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="autorizar",
            user=user,
            observacao=None,
            ip_address=None,
        )

    assert exc_info.value.status_code == 403
    assert "secretaria" in exc_info.value.detail
    assert "autorizar" in exc_info.value.detail


# ---------------------------------------------------------------------------
# 5. execute_transition — etapa (d): escopo de secretaria incorreto
# ---------------------------------------------------------------------------


async def test_wrong_secretaria_raises_403() -> None:
    """Secretaria diferente da ordem tenta 'atestar' — deve levantar 403."""
    from fastapi import HTTPException

    secretaria_ordem = uuid.uuid4()
    secretaria_user = uuid.uuid4()  # diferente!

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_ATESTO, secretaria_id=secretaria_ordem)
    db = make_db(ordem)
    user = make_user(RoleEnum.secretaria, secretaria_id=secretaria_user)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="atestar",
            user=user,
            observacao=None,
            ip_address=None,
        )

    assert exc_info.value.status_code == 403
    assert "secretaria responsável" in exc_info.value.detail.lower()


async def test_admin_bypasses_secretaria_scope() -> None:
    """Admin em 'iniciar_atesto' é isento da verificação de escopo."""
    secretaria_id = uuid.uuid4()
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_EXECUCAO, secretaria_id=secretaria_id)
    db = make_db(ordem)
    # Admin com secretaria_id diferente — deve passar sem 403
    user = make_user(RoleEnum.admin, secretaria_id=uuid.uuid4())

    ordem_retornada = await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="iniciar_atesto",
        user=user,
        observacao=None,
        ip_address=None,
    )

    assert ordem.status == StatusOrdemEnum.AGUARDANDO_ATESTO


# ---------------------------------------------------------------------------
# 6. execute_transition — etapa (e): observação obrigatória
# ---------------------------------------------------------------------------


async def test_missing_mandatory_observacao_raises_422() -> None:
    """solicitar_alteracao sem observação deve levantar 422."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_GABINETE)
    db = make_db(ordem)
    user = make_user(RoleEnum.gabinete)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="solicitar_alteracao",
            user=user,
            observacao=None,   # obrigatória com mínimo 20 chars
            ip_address=None,
        )

    assert exc_info.value.status_code == 422
    assert "20" in exc_info.value.detail


async def test_short_observacao_raises_422() -> None:
    """Observação com menos que min_chars deve levantar 422."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_GABINETE)
    db = make_db(ordem)
    user = make_user(RoleEnum.gabinete)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="solicitar_alteracao",
            user=user,
            observacao="curta",   # < 20 chars
            ip_address=None,
        )

    assert exc_info.value.status_code == 422


async def test_exact_min_chars_observacao_passes() -> None:
    """Observação com exatamente min_chars deve ser aceita."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_GABINETE)
    db = make_db(ordem)
    user = make_user(RoleEnum.gabinete)
    obs_exata = "A" * 20  # exatamente 20 chars

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="solicitar_alteracao",
        user=user,
        observacao=obs_exata,
        ip_address=None,
    )

    assert ordem.status == StatusOrdemEnum.DEVOLVIDA_PARA_ALTERACAO


# ---------------------------------------------------------------------------
# 7. execute_transition — transição bem-sucedida: status e historico
# ---------------------------------------------------------------------------


async def test_successful_transition_updates_status() -> None:
    """Transição válida atualiza status da ordem."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_GABINETE)
    db = make_db(ordem)
    user = make_user(RoleEnum.gabinete)

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="autorizar",
        user=user,
        observacao=None,
        ip_address="10.0.0.1",
    )

    assert ordem.status == StatusOrdemEnum.AGUARDANDO_CONTROLADORIA
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(ordem)


async def test_successful_transition_inserts_historico() -> None:
    """Transição válida insere um registro em ordem_historico (append-only)."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_GABINETE)
    db = make_db(ordem)
    user = make_user(RoleEnum.gabinete)

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="autorizar",
        user=user,
        observacao="Autorizado pelo Gabinete.",
        ip_address="192.168.1.1",
    )

    # Deve ter chamado db.add() uma vez com um OrdemHistorico
    db.add.assert_called_once()
    historico_adicionado = db.add.call_args[0][0]
    assert isinstance(historico_adicionado, OrdemHistorico)
    assert historico_adicionado.acao == "autorizar"
    assert historico_adicionado.status_anterior == StatusOrdemEnum.AGUARDANDO_GABINETE
    assert historico_adicionado.status_novo == StatusOrdemEnum.AGUARDANDO_CONTROLADORIA
    assert historico_adicionado.ip_address == "192.168.1.1"
    assert historico_adicionado.perfil == RoleEnum.gabinete.value


# ---------------------------------------------------------------------------
# 8. Efeitos colaterais automáticos
# ---------------------------------------------------------------------------


async def test_reenviar_increments_versao() -> None:
    """US-006 RN-35: 'reenviar' deve incrementar versao da ordem."""
    secretaria_id = uuid.uuid4()
    ordem = make_ordem(StatusOrdemEnum.DEVOLVIDA_PARA_ALTERACAO, secretaria_id=secretaria_id)
    ordem.versao = 2  # já foi reenviada antes
    db = make_db(ordem)
    user = make_user(RoleEnum.secretaria, secretaria_id=secretaria_id)

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="reenviar",
        user=user,
        observacao=None,
        ip_address=None,
    )

    assert ordem.versao == 3   # incrementado de 2 para 3


async def test_empenhar_sets_data_empenho() -> None:
    """US-008 RN-43: 'empenhar' deve registrar data_empenho automaticamente."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_EMPENHO)
    db = make_db(ordem)
    user = make_user(RoleEnum.contabilidade)

    antes = datetime.now(timezone.utc)
    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="empenhar",
        user=user,
        observacao=None,
        ip_address=None,
    )

    assert ordem.data_empenho is not None
    assert ordem.data_empenho >= antes


async def test_atestar_sets_data_atesto_and_atestado_por() -> None:
    """US-009 RN-48/46: 'atestar' define data_atesto e atestado_por automaticamente."""
    secretaria_id = uuid.uuid4()
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_ATESTO, secretaria_id=secretaria_id)
    db = make_db(ordem)
    user = make_user(RoleEnum.secretaria, secretaria_id=secretaria_id)

    antes = datetime.now(timezone.utc)
    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="atestar",
        user=user,
        observacao=None,
        ip_address=None,
    )

    assert ordem.data_atesto is not None
    assert ordem.data_atesto >= antes
    assert ordem.atestado_por == user.id


# ---------------------------------------------------------------------------
# 9. dados_extras aplicados ao modelo
# ---------------------------------------------------------------------------


async def test_dados_extras_applied_to_ordem() -> None:
    """Campos em dados_extras são aplicados via setattr à ordem."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_EMPENHO)
    db = make_db(ordem)
    user = make_user(RoleEnum.contabilidade)

    dados = {
        "numero_empenho": "EMP-2026-001",
        "valor_empenhado": Decimal("4500.00"),
    }

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="empenhar",
        user=user,
        observacao=None,
        ip_address=None,
        dados_extras=dados,
    )

    assert ordem.numero_empenho == "EMP-2026-001"
    assert ordem.valor_empenhado == Decimal("4500.00")


async def test_dados_extras_unknown_field_ignored() -> None:
    """Campo desconhecido em dados_extras não gera erro (hasattr guard)."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_EMPENHO)
    db = make_db(ordem)
    user = make_user(RoleEnum.contabilidade)

    # 'campo_inexistente' não existe no modelo Ordem → deve ser ignorado silenciosamente
    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="empenhar",
        user=user,
        observacao=None,
        ip_address=None,
        dados_extras={"campo_inexistente": "valor"},
    )

    assert ordem.status == StatusOrdemEnum.AGUARDANDO_EXECUCAO


# ---------------------------------------------------------------------------
# 10. Singleton
# ---------------------------------------------------------------------------


def test_workflow_engine_singleton() -> None:
    """workflow_engine é o singleton exportado pelo módulo."""
    from app.services.workflow_engine import workflow_engine as singleton
    assert isinstance(singleton, WorkflowEngine)
