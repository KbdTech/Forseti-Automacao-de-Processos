"""Testes de integração — US-007: Análise de Conformidade pela Controladoria.

Cobre todas as ações da etapa de Controladoria na máquina de estados:
  - aprovar            → AGUARDANDO_EMPENHO
  - irregularidade     → COM_IRREGULARIDADE   (obs ≥ 50 chars — RN-38)
  - solicitar_documentacao → AGUARDANDO_DOCUMENTACAO (obs ≥ 20 chars)
  - enviar_documentacao (secretaria) → AGUARDANDO_CONTROLADORIA

Cenários de falha:
  - irregularidade com observação ausente ou < 50 chars → 422
  - ação em status inválido (ex.: AGUARDANDO_GABINETE) → 422
  - role errada tentando ação da Controladoria → 403
  - secretaria diferente em enviar_documentacao → 403

CLAUDE.md §6: máquina de estados.
US-007 RN-37: apenas AGUARDANDO_CONTROLADORIA ou AGUARDANDO_DOCUMENTACAO recebem ações.
US-007 RN-38: irregularidade exige mínimo 50 caracteres na observação.
US-007 RN-39: irregularidade suspende a ordem — status COM_IRREGULARIDADE.
US-007 RN-41: historico registra nome completo (inserido via user.id no historico).
US-012 RN-60: ordem_historico append-only.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.enums import StatusOrdemEnum
from app.models.ordem import Ordem
from app.models.ordem_historico import OrdemHistorico
from app.models.user import RoleEnum, User
from app.services.workflow_engine import workflow_engine


# ---------------------------------------------------------------------------
# Helpers de fixture (mesmos padrões de test_workflow_engine.py)
# ---------------------------------------------------------------------------


def make_ordem(
    status: StatusOrdemEnum = StatusOrdemEnum.AGUARDANDO_CONTROLADORIA,
    secretaria_id: uuid.UUID | None = None,
) -> MagicMock:
    """Mock de Ordem com status e secretaria_id configuráveis."""
    o = MagicMock(spec=Ordem)
    o.id = uuid.uuid4()
    o.status = status
    o.secretaria_id = secretaria_id or uuid.uuid4()
    o.versao = 1
    o.data_empenho = None
    o.data_atesto = None
    o.atestado_por = None
    return o


def make_user(
    role: RoleEnum = RoleEnum.controladoria,
    secretaria_id: uuid.UUID | None = None,
) -> MagicMock:
    """Mock de User com role e secretaria_id configuráveis."""
    u = MagicMock(spec=User)
    u.id = uuid.uuid4()
    u.role = role
    u.secretaria_id = secretaria_id
    return u


def make_db(ordem: MagicMock | None) -> AsyncMock:
    """AsyncSession mockada que devolve `ordem` no execute()."""
    db = AsyncMock()
    scalar_mock = MagicMock()
    scalar_mock.scalar_one_or_none.return_value = ordem
    db.execute = AsyncMock(return_value=scalar_mock)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ---------------------------------------------------------------------------
# 1. aprovar — AGUARDANDO_CONTROLADORIA → AGUARDANDO_EMPENHO
# ---------------------------------------------------------------------------


async def test_aprovar_transiciona_para_aguardando_empenho() -> None:
    """US-007 Cenário 1: Controladoria aprova ordem → AGUARDANDO_EMPENHO."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="aprovar",
        user=user,
        observacao="Documentação fiscal em conformidade com a legislação vigente.",
        ip_address="10.0.0.1",
    )

    assert ordem.status == StatusOrdemEnum.AGUARDANDO_EMPENHO
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(ordem)


async def test_aprovar_insere_historico() -> None:
    """US-012 RN-60: aprovar deve inserir um registro append-only em ordem_historico."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="aprovar",
        user=user,
        observacao=None,
        ip_address="192.168.1.10",
    )

    db.add.assert_called_once()
    hist = db.add.call_args[0][0]
    assert isinstance(hist, OrdemHistorico)
    assert hist.acao == "aprovar"
    assert hist.status_anterior == StatusOrdemEnum.AGUARDANDO_CONTROLADORIA
    assert hist.status_novo == StatusOrdemEnum.AGUARDANDO_EMPENHO
    assert hist.perfil == RoleEnum.controladoria.value
    assert hist.usuario_id == user.id


async def test_aprovar_sem_observacao_aceito() -> None:
    """aprovar não exige observação (observacao_obrigatoria=False na config)."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    # Não deve levantar exceção
    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="aprovar",
        user=user,
        observacao=None,
        ip_address=None,
    )

    assert ordem.status == StatusOrdemEnum.AGUARDANDO_EMPENHO


# ---------------------------------------------------------------------------
# 2. irregularidade — RN-38: observação ≥ 50 chars obrigatória
# ---------------------------------------------------------------------------


async def test_irregularidade_transiciona_para_com_irregularidade() -> None:
    """US-007 RN-39: irregularidade suspende a ordem → COM_IRREGULARIDADE."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)
    obs = "A" * 50  # exatamente 50 chars — valor limite

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="irregularidade",
        user=user,
        observacao=obs,
        ip_address=None,
    )

    assert ordem.status == StatusOrdemEnum.COM_IRREGULARIDADE


async def test_irregularidade_sem_observacao_raises_422() -> None:
    """US-007 RN-38: irregularidade sem observação deve levantar 422."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="irregularidade",
            user=user,
            observacao=None,
            ip_address=None,
        )

    assert exc_info.value.status_code == 422
    # Mensagem deve mencionar o mínimo de caracteres exigido
    assert "50" in exc_info.value.detail


async def test_irregularidade_observacao_curta_raises_422() -> None:
    """US-007 RN-38: observação com 49 chars (< 50) deve levantar 422."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="irregularidade",
            user=user,
            observacao="A" * 49,  # um char abaixo do mínimo
            ip_address=None,
        )

    assert exc_info.value.status_code == 422


async def test_irregularidade_insere_historico() -> None:
    """US-012 RN-60: irregularidade deve inserir historico append-only."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)
    obs = "B" * 60

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="irregularidade",
        user=user,
        observacao=obs,
        ip_address="10.0.0.2",
    )

    db.add.assert_called_once()
    hist = db.add.call_args[0][0]
    assert isinstance(hist, OrdemHistorico)
    assert hist.acao == "irregularidade"
    assert hist.status_novo == StatusOrdemEnum.COM_IRREGULARIDADE
    assert hist.observacao == obs


# ---------------------------------------------------------------------------
# 3. solicitar_documentacao — obs ≥ 20 chars, → AGUARDANDO_DOCUMENTACAO
# ---------------------------------------------------------------------------


async def test_solicitar_documentacao_transiciona_corretamente() -> None:
    """US-007 Cenário 3: Controladoria solicita documentos → AGUARDANDO_DOCUMENTACAO."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="solicitar_documentacao",
        user=user,
        observacao="Nota fiscal de serviço não apresentada.",  # 38 chars
        ip_address=None,
    )

    assert ordem.status == StatusOrdemEnum.AGUARDANDO_DOCUMENTACAO


async def test_solicitar_documentacao_sem_observacao_raises_422() -> None:
    """solicitar_documentacao exige observação (min 20 chars) — RN-37."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="solicitar_documentacao",
            user=user,
            observacao=None,
            ip_address=None,
        )

    assert exc_info.value.status_code == 422


async def test_solicitar_documentacao_observacao_exatamente_20_chars_passa() -> None:
    """Observação com exatamente 20 chars deve ser aceita."""
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="solicitar_documentacao",
        user=user,
        observacao="C" * 20,  # exatamente 20 chars
        ip_address=None,
    )

    assert ordem.status == StatusOrdemEnum.AGUARDANDO_DOCUMENTACAO


# ---------------------------------------------------------------------------
# 4. enviar_documentacao (secretaria) — AGUARDANDO_DOCUMENTACAO → AGUARDANDO_CONTROLADORIA
# ---------------------------------------------------------------------------


async def test_enviar_documentacao_retorna_para_aguardando_controladoria() -> None:
    """US-007 Cenário 4: Secretaria reenvía documentos → volta para AGUARDANDO_CONTROLADORIA."""
    secretaria_id = uuid.uuid4()
    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_DOCUMENTACAO, secretaria_id=secretaria_id)
    db = make_db(ordem)
    user = make_user(RoleEnum.secretaria, secretaria_id=secretaria_id)

    await workflow_engine.execute_transition(
        db=db,
        ordem_id=ordem.id,
        acao="enviar_documentacao",
        user=user,
        observacao="Documentação complementar enviada conforme solicitado.",
        ip_address=None,
    )

    assert ordem.status == StatusOrdemEnum.AGUARDANDO_CONTROLADORIA


async def test_enviar_documentacao_secretaria_errada_raises_403() -> None:
    """US-007 RN-37: secretaria diferente da ordem não pode enviar documentação."""
    from fastapi import HTTPException

    secretaria_ordem = uuid.uuid4()
    secretaria_diferente = uuid.uuid4()

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_DOCUMENTACAO, secretaria_id=secretaria_ordem)
    db = make_db(ordem)
    user = make_user(RoleEnum.secretaria, secretaria_id=secretaria_diferente)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="enviar_documentacao",
            user=user,
            observacao=None,
            ip_address=None,
        )

    assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# 5. Validação de status — RN-37: apenas AGUARDANDO_CONTROLADORIA / AGUARDANDO_DOCUMENTACAO
# ---------------------------------------------------------------------------


async def test_aprovar_em_status_gabinete_raises_422() -> None:
    """US-007 RN-37: ação 'aprovar' em AGUARDANDO_GABINETE deve levantar 422."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_GABINETE)  # status incorreto
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="aprovar",
            user=user,
            observacao=None,
            ip_address=None,
        )

    assert exc_info.value.status_code == 422
    assert "AGUARDANDO_GABINETE" in exc_info.value.detail


async def test_irregularidade_em_status_empenho_raises_422() -> None:
    """Ação de Controladoria em status pós-aprovação deve levantar 422."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_EMPENHO)  # já aprovado
    db = make_db(ordem)
    user = make_user(RoleEnum.controladoria)

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="irregularidade",
            user=user,
            observacao="X" * 50,
            ip_address=None,
        )

    assert exc_info.value.status_code == 422


# ---------------------------------------------------------------------------
# 6. Validação de role — RN-37: somente Controladoria executa ações desta etapa
# ---------------------------------------------------------------------------


async def test_secretaria_nao_pode_aprovar_raises_403() -> None:
    """US-007 RN-37: secretaria não tem permissão para 'aprovar' → 403."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.secretaria)  # role errada

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="aprovar",
            user=user,
            observacao=None,
            ip_address=None,
        )

    assert exc_info.value.status_code == 403
    assert "secretaria" in exc_info.value.detail
    assert "aprovar" in exc_info.value.detail


async def test_gabinete_nao_pode_apontar_irregularidade_raises_403() -> None:
    """Perfil gabinete não pode executar ação de Controladoria → 403."""
    from fastapi import HTTPException

    ordem = make_ordem(StatusOrdemEnum.AGUARDANDO_CONTROLADORIA)
    db = make_db(ordem)
    user = make_user(RoleEnum.gabinete)  # role errada

    with pytest.raises(HTTPException) as exc_info:
        await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem.id,
            acao="irregularidade",
            user=user,
            observacao="X" * 50,
            ip_address=None,
        )

    assert exc_info.value.status_code == 403
