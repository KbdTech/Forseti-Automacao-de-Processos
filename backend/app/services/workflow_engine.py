"""Workflow Engine — máquina de estados central das Ordens de Serviço.

Responsabilidades:
  - Validar transições de status conforme tabela TRANSITIONS
  - Verificar permissão de perfil para cada ação (RBAC)
  - Verificar escopo de secretaria para ações operacionais
  - Validar obrigatoriedade de observação com mínimo de caracteres
  - Aplicar efeitos colaterais automáticos (data_empenho, data_atesto, versao)
  - Aplicar dados extras ao modelo Ordem (numero_empenho, valor_empenhado, etc.)
  - Persistir transição em ordem_historico de forma append-only

CLAUDE.md §6: máquina de estados com 13 status e 14 transições válidas.
US-012 RN-60: ordem_historico é append-only — nunca executar UPDATE ou DELETE.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StatusOrdemEnum
from app.models.ordem import Ordem
from app.models.ordem_historico import OrdemHistorico
from app.models.user import RoleEnum, User


# ---------------------------------------------------------------------------
# Configuração imutável de uma transição de estado
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _TransitionConfig:
    """Configuração imutável de uma transição na máquina de estados.

    Attributes:
        novo_status: Status da ordem após a transição.
        roles_permitidos: Tupla de roles autorizados a executar esta ação.
        observacao_obrigatoria: Se True, o campo observacao é exigido.
        min_chars_observacao: Mínimo de caracteres exigido na observação.
    """

    novo_status: StatusOrdemEnum
    roles_permitidos: tuple[RoleEnum, ...]
    observacao_obrigatoria: bool = False
    min_chars_observacao: int = 0


# ---------------------------------------------------------------------------
# WorkflowEngine
# ---------------------------------------------------------------------------


class WorkflowEngine:
    """Máquina de estados central das Ordens de Serviço.

    Todas as transições de status devem passar por este engine.
    O engine valida regras de negócio, aplica a transição e registra
    o histórico de tramitação de forma append-only.

    CLAUDE.md §6: 13 status, 14 transições válidas.
    US-012 RN-60: histórico imutável — nunca UPDATE ou DELETE em ordem_historico.

    Exemplo de uso:
        ordem = await workflow_engine.execute_transition(
            db=db,
            ordem_id=ordem_id,
            acao="autorizar",
            user=current_user,
            observacao=payload.observacao,
            ip_address=client_ip,
            dados_extras=None,
        )
    """

    # ---------------------------------------------------------------------------
    # Tabela de transições válidas (CLAUDE.md §6)
    #
    # Chave:  (StatusOrdemEnum.STATUS_ATUAL, "acao")
    # Valor:  _TransitionConfig com regras da transição
    # ---------------------------------------------------------------------------

    TRANSITIONS: dict[tuple[StatusOrdemEnum, str], _TransitionConfig] = {
        # ------------------------------------------------------------------
        # Gabinete — US-005
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_GABINETE, "autorizar"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_CONTROLADORIA,
            roles_permitidos=(RoleEnum.gabinete,),
        ),
        (StatusOrdemEnum.AGUARDANDO_GABINETE, "solicitar_alteracao"): _TransitionConfig(
            novo_status=StatusOrdemEnum.DEVOLVIDA_PARA_ALTERACAO,
            roles_permitidos=(RoleEnum.gabinete,),
            observacao_obrigatoria=True,
            min_chars_observacao=20,
            # US-005 RN-27: observação obrigatória com mínimo de 20 chars
        ),
        (StatusOrdemEnum.AGUARDANDO_GABINETE, "cancelar"): _TransitionConfig(
            novo_status=StatusOrdemEnum.CANCELADA,
            roles_permitidos=(RoleEnum.gabinete,),
            observacao_obrigatoria=True,
            min_chars_observacao=20,
            # US-005 RN-28: motivo de cancelamento obrigatório
        ),
        # ------------------------------------------------------------------
        # Secretaria — reenvio após devolução (US-006)
        # ------------------------------------------------------------------
        (StatusOrdemEnum.DEVOLVIDA_PARA_ALTERACAO, "reenviar"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_GABINETE,
            roles_permitidos=(RoleEnum.secretaria,),
            # US-006 RN-35: versao incrementada automaticamente no execute_transition
        ),
        # ------------------------------------------------------------------
        # Controladoria — análise de conformidade (US-007)
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_CONTROLADORIA, "aprovar"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_EMPENHO,
            roles_permitidos=(RoleEnum.controladoria,),
        ),
        (StatusOrdemEnum.AGUARDANDO_CONTROLADORIA, "irregularidade"): _TransitionConfig(
            novo_status=StatusOrdemEnum.COM_IRREGULARIDADE,
            roles_permitidos=(RoleEnum.controladoria,),
            observacao_obrigatoria=True,
            min_chars_observacao=50,
            # US-007 RN-38: parecer de irregularidade mínimo 50 chars
        ),
        (StatusOrdemEnum.AGUARDANDO_CONTROLADORIA, "solicitar_documentacao"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_DOCUMENTACAO,
            roles_permitidos=(RoleEnum.controladoria,),
            observacao_obrigatoria=True,
            min_chars_observacao=20,
        ),
        # ------------------------------------------------------------------
        # Secretaria — envio de documentação solicitada (US-007)
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_DOCUMENTACAO, "enviar_documentacao"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_CONTROLADORIA,
            roles_permitidos=(RoleEnum.secretaria,),
        ),
        # ------------------------------------------------------------------
        # Contabilidade — empenho orçamentário (US-008)
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_EMPENHO, "empenhar"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_ATESTO,
            roles_permitidos=(RoleEnum.contabilidade,),
            # US-008 RN-43: data_empenho registrada automaticamente
            # US-009: transição automática para AGUARDANDO_ATESTO na emissão do empenho
        ),
        # ------------------------------------------------------------------
        # Secretaria — início do atesto (US-009)
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_EXECUCAO, "iniciar_atesto"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_ATESTO,
            roles_permitidos=(RoleEnum.secretaria, RoleEnum.admin),
            # admin pode iniciar para destravar execuções bloqueadas
        ),
        # ------------------------------------------------------------------
        # Secretaria — atesto e recusa de nota fiscal (US-009)
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_ATESTO, "atestar"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_LIQUIDACAO,
            roles_permitidos=(RoleEnum.secretaria,),
            # US-009 RN-48/46: data_atesto e atestado_por registrados automaticamente
        ),
        (StatusOrdemEnum.AGUARDANDO_ATESTO, "recusar_atesto"): _TransitionConfig(
            novo_status=StatusOrdemEnum.EXECUCAO_COM_PENDENCIA,
            roles_permitidos=(RoleEnum.secretaria,),
            observacao_obrigatoria=True,
            min_chars_observacao=30,
            # US-009 RN-47: descrição de não conformidade obrigatória
        ),
        # ------------------------------------------------------------------
        # Contabilidade — liquidação (US-010 / US-019)
        # US-019: após liquidar, ordem aguarda assinatura da secretaria
        # antes de seguir para pagamento.
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_LIQUIDACAO, "liquidar"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_ASSINATURA_SECRETARIA,
            roles_permitidos=(RoleEnum.contabilidade,),
        ),
        # ------------------------------------------------------------------
        # Secretaria — assinatura do documento de liquidação (US-019)
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_ASSINATURA_SECRETARIA, "assinar_liquidacao"): _TransitionConfig(
            novo_status=StatusOrdemEnum.AGUARDANDO_PAGAMENTO,
            roles_permitidos=(RoleEnum.secretaria,),
            # US-019: secretaria da ordem assina o documento de liquidação
        ),
        # ------------------------------------------------------------------
        # Tesouraria — pagamento final (US-010)
        # ------------------------------------------------------------------
        (StatusOrdemEnum.AGUARDANDO_PAGAMENTO, "pagar"): _TransitionConfig(
            novo_status=StatusOrdemEnum.PAGA,
            roles_permitidos=(RoleEnum.tesouraria,),
            # US-010 RN-53: status PAGA → somente-leitura para todos os perfis
        ),
    }

    # Ações que exigem verificação de escopo de secretaria.
    # Apenas o perfil `secretaria` passa pela checagem:
    #   user.secretaria_id == ordem.secretaria_id
    # `admin` em `iniciar_atesto` é isento desta verificação.
    _SECRETARIA_SCOPED_ACTIONS: frozenset[str] = frozenset({
        "reenviar",            # US-006: somente a secretaria da ordem
        "enviar_documentacao", # US-007: somente a secretaria da ordem
        "iniciar_atesto",      # US-009: secretaria da ordem (admin isento)
        "atestar",             # US-009 RN-46: somente a secretaria responsável
        "recusar_atesto",      # US-009: somente a secretaria responsável
        "assinar_liquidacao",  # US-019: somente a secretaria da ordem
    })

    async def execute_transition(
        self,
        db: AsyncSession,
        ordem_id: UUID,
        acao: str,
        user: User,
        observacao: str | None,
        ip_address: str | None,
        dados_extras: dict[str, Any] | None = None,
    ) -> Ordem:
        """Executa uma transição de status e registra o histórico.

        Valida e aplica a transição completa em sequência:
          a) Busca a ordem — 404 se não encontrada.
          b) Valida (status_atual, acao) em TRANSITIONS — 422 se inválida.
          c) Valida user.role em roles_permitidos — 403 se não autorizado.
          d) Valida escopo de secretaria para ações operacionais — 403.
          e) Valida observação obrigatória com mínimo de caracteres — 422.
          f) Salva status_anterior para o histórico.
          g) Atualiza ordem.status → novo_status.
          h) Aplica efeitos colaterais automáticos + dados_extras ao modelo.
          i) Insere registro append-only em ordem_historico (US-012 RN-60).
          j) Commit e refresh da ordem.
          k) Retorna a ordem atualizada.

        Args:
            db: Sessão assíncrona do banco de dados.
            ordem_id: UUID da ordem a ser processada.
            acao: Identificador da ação (ex: "autorizar", "empenhar", "pagar").
            user: Usuário autenticado que está executando a ação.
            observacao: Texto de observação (obrigatório em algumas ações).
            ip_address: IP do cliente para registro no histórico (US-012 RN-61).
            dados_extras: Campos adicionais a aplicar à ordem. Exemplos:
                - empenhar:  {"numero_empenho": "EMP-001", "valor_empenhado": Decimal("5000")}
                - liquidar:  {"valor_liquidado": Decimal("4900"), "data_liquidacao": date}
                - pagar:     {"valor_pago": Decimal("4900"), "forma_pagamento": FormaPagamentoEnum.pix}

        Returns:
            Ordem atualizada com o novo status e campos extras aplicados.

        Raises:
            HTTPException 404: Ordem não encontrada.
            HTTPException 422: Ação inválida para o status atual ou
                               observação obrigatória não atendida.
            HTTPException 403: Perfil sem permissão ou fora do escopo de secretaria.
        """

        # ------------------------------------------------------------------
        # a) Buscar a ordem no banco
        # ------------------------------------------------------------------
        result = await db.execute(select(Ordem).where(Ordem.id == ordem_id))
        ordem = result.scalar_one_or_none()

        if ordem is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ordem não encontrada.",
            )

        # ------------------------------------------------------------------
        # b) Validar que (status_atual, acao) é uma transição permitida
        # ------------------------------------------------------------------
        chave = (ordem.status, acao)
        config = self.TRANSITIONS.get(chave)

        if config is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Ação '{acao}' não é permitida para o status atual "
                    f"'{ordem.status.value}'."
                ),
            )

        # ------------------------------------------------------------------
        # c) Verificar permissão de perfil
        # ------------------------------------------------------------------
        if user.role not in config.roles_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Perfil '{user.role.value}' não tem permissão para "
                    f"executar a ação '{acao}'."
                ),
            )

        # ------------------------------------------------------------------
        # d) Verificar escopo de secretaria para ações operacionais.
        #    Somente o perfil `secretaria` passa pela verificação;
        #    `admin` é isento (pode atuar em qualquer secretaria).
        # ------------------------------------------------------------------
        if (
            acao in self._SECRETARIA_SCOPED_ACTIONS
            and user.role == RoleEnum.secretaria
            and user.secretaria_id != ordem.secretaria_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ação permitida apenas para a secretaria responsável pela ordem.",
            )

        # ------------------------------------------------------------------
        # e) Validar observação obrigatória
        # ------------------------------------------------------------------
        obs_texto = observacao.strip() if observacao else ""

        if config.observacao_obrigatoria and len(obs_texto) < config.min_chars_observacao:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Observação obrigatória com mínimo de "
                    f"{config.min_chars_observacao} caracteres."
                ),
            )

        # ------------------------------------------------------------------
        # f) Salvar status anterior para o histórico
        # ------------------------------------------------------------------
        status_anterior = ordem.status

        # ------------------------------------------------------------------
        # g) Atualizar status da ordem
        # ------------------------------------------------------------------
        ordem.status = config.novo_status
        ordem.updated_at = datetime.now(timezone.utc)

        # ------------------------------------------------------------------
        # h) Aplicar efeitos colaterais automáticos por ação
        #
        #   reenviar:    versao += 1 (US-006 RN-35)
        #   empenhar:    data_empenho = now()  (US-008 RN-43)
        #   atestar:     data_atesto = now() + atestado_por = user.id (US-009 RN-48/46)
        #
        # Em seguida, aplica campos extras passados pelo chamador,
        # que têm precedência sobre os efeitos automáticos.
        # ------------------------------------------------------------------
        if acao == "reenviar":
            # US-006 RN-35: incrementa contador de versão a cada reenvio
            ordem.versao = (ordem.versao or 0) + 1

        elif acao == "empenhar":
            # US-008 RN-42: numero_empenho deve ser único no sistema
            numero_empenho = str((dados_extras or {}).get("numero_empenho", "")).strip()
            if numero_empenho:
                dup_result = await db.execute(
                    select(Ordem).where(
                        Ordem.numero_empenho == numero_empenho,
                        Ordem.id != ordem_id,
                    )
                )
                if dup_result.scalar_one_or_none() is not None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"Número de empenho '{numero_empenho}' já vinculado a outra ordem."
                        ),
                    )
            # US-008 RN-43: data_empenho registrada no momento do empenho
            ordem.data_empenho = datetime.now(timezone.utc)

        elif acao == "atestar":
            # US-009 RN-49: numero_nf obrigatório para concluir o atesto
            numero_nf = str((dados_extras or {}).get("numero_nf", "")).strip()
            if not numero_nf:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Número da nota fiscal (numero_nf) é obrigatório para o atesto.",
                )
            # US-009 RN-48: data_atesto registrada automaticamente
            # US-009 RN-46: atestado_por = usuário que executou o atesto
            ordem.data_atesto = datetime.now(timezone.utc)
            ordem.atestado_por = user.id

        elif acao == "liquidar":
            # US-010 RN-50: data_liquidacao não pode ser futura
            data_liq = (dados_extras or {}).get("data_liquidacao")
            if data_liq is not None and data_liq.date() > datetime.now(timezone.utc).date():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="A data de liquidação não pode ser uma data futura.",
                )

        elif acao == "pagar":
            # US-010 RN-51: data_pagamento não pode ser futura
            data_pgto = (dados_extras or {}).get("data_pagamento")
            if data_pgto is not None and data_pgto.date() > datetime.now(timezone.utc).date():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="A data de pagamento não pode ser uma data futura.",
                )
            # US-010 RN-52: valor pago diferente do liquidado exige observação como justificativa
            valor_pago = (dados_extras or {}).get("valor_pago")
            if valor_pago is not None and ordem.valor_liquidado is not None:
                diferenca = abs(float(valor_pago) - float(ordem.valor_liquidado))
                if diferenca > 0.009 and not obs_texto:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                        detail=(
                            "Justificativa (campo 'observacao') obrigatória quando o valor pago "
                            "difere do valor liquidado."
                        ),
                    )

        # Aplica campos extras do chamador (sobrescreve efeitos automáticos se necessário)
        if dados_extras:
            for campo, valor in dados_extras.items():
                if hasattr(ordem, campo):
                    setattr(ordem, campo, valor)

        # ------------------------------------------------------------------
        # i) Inserir em ordem_historico — APPEND-ONLY (US-012 RN-60)
        #    CRÍTICO: nunca executar UPDATE ou DELETE nesta tabela.
        # ------------------------------------------------------------------
        historico = OrdemHistorico(
            ordem_id=ordem.id,
            usuario_id=user.id,
            perfil=user.role.value,        # String(50): armazena o valor do enum
            acao=acao,
            status_anterior=status_anterior,
            status_novo=config.novo_status,
            observacao=obs_texto if obs_texto else None,
            ip_address=ip_address,
        )
        db.add(historico)

        # ------------------------------------------------------------------
        # j) Commit e refresh
        # ------------------------------------------------------------------
        await db.commit()
        await db.refresh(ordem)

        # ------------------------------------------------------------------
        # k) Retornar ordem atualizada
        # ------------------------------------------------------------------
        return ordem


# ---------------------------------------------------------------------------
# Singleton — instância única para uso nos routers e services
# ---------------------------------------------------------------------------

workflow_engine = WorkflowEngine()
