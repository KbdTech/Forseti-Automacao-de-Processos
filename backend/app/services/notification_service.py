"""Serviço de notificações por e-mail — US-014.

Responsabilidades:
  - Determinar destinatários de cada evento de workflow
  - Verificar preferências do usuário (opt-out)
  - Enviar e-mails via SMTP (smtplib padrão)
  - Registrar cada tentativa em notification_log (append-only)

US-014 RN-69: envios assíncronos — chamado como BackgroundTask no router.
US-014 RN-72: falha no envio registrada mas não propaga exceção.
US-014 RN-73: usuário pode desativar eventos específicos.
"""

import logging
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.notification import NotificationLog, NotificationStatusEnum, UserNotificationPrefs
from app.models.ordem import Ordem
from app.models.user import RoleEnum, User

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mapeamento evento → perfis/papéis destinatários
#
# Convenções de destinatários:
#   - string de role (ex.: "gabinete") → busca todos os usuários ativos com aquela role
#   - "_criador" → usuário que criou a ordem
#   - "_secretaria" → todos os usuários ativos da secretaria da ordem
# ---------------------------------------------------------------------------

_EVENT_RECIPIENTS: dict[str, list[str]] = {
    "ordem_aguardando_gabinete": ["gabinete"],
    "ordem_devolvida": ["_criador", "_secretaria"],
    "ordem_aguardando_controladoria": ["controladoria"],
    "ordem_aguardando_empenho": ["contabilidade"],
    "ordem_aguardando_atesto": ["_secretaria"],
    "ordem_aguardando_liquidacao": ["contabilidade"],
    "ordem_aguardando_pagamento": ["tesouraria"],
    "ordem_paga": ["_criador", "_secretaria"],
    "ordem_irregularidade": ["_criador", "_secretaria", "gabinete"],
    "ordem_cancelada": ["_criador", "_secretaria"],
}

# Mapeamento ação do workflow → nome do evento de notificação
ACAO_PARA_EVENTO: dict[str, str] = {
    "autorizar": "ordem_aguardando_controladoria",
    "solicitar_alteracao": "ordem_devolvida",
    "cancelar": "ordem_cancelada",
    "reenviar": "ordem_aguardando_gabinete",
    "aprovar": "ordem_aguardando_empenho",
    "irregularidade": "ordem_irregularidade",
    "empenhar": "ordem_aguardando_atesto",
    "iniciar_atesto": "ordem_aguardando_atesto",
    "atestar": "ordem_aguardando_liquidacao",
    "liquidar": "ordem_aguardando_pagamento",
    "pagar": "ordem_paga",
}


# ---------------------------------------------------------------------------
# NotificationService
# ---------------------------------------------------------------------------


class NotificationService:
    """Envia e-mails de notificação de forma assíncrona após transições de workflow."""

    async def notify_workflow_transition(
        self,
        ordem_id: uuid.UUID,
        acao: str,
        app_base_url: str = "http://localhost:5173",
    ) -> None:
        """Ponto de entrada para BackgroundTask após uma transição de workflow.

        Cria sua própria sessão de banco pois a sessão da request já foi fechada.

        US-014 RN-69: deve ser chamado como BackgroundTask.
        US-014 RN-72: erros internos são logados mas não propagados.
        """
        evento = ACAO_PARA_EVENTO.get(acao)
        if not evento:
            logger.debug("Ação '%s' não tem evento de notificação mapeado.", acao)
            return

        try:
            async with AsyncSessionLocal() as db:
                await self._dispatch(db, ordem_id, evento, app_base_url)
        except Exception:
            logger.exception(
                "Falha crítica no serviço de notificação para ordem %s / evento %s",
                ordem_id,
                evento,
            )

    async def _dispatch(
        self,
        db: AsyncSession,
        ordem_id: uuid.UUID,
        evento: str,
        app_base_url: str,
    ) -> None:
        """Determina destinatários, verifica preferências e dispara os e-mails."""
        # Carregar a ordem com secretaria e criador
        result = await db.execute(
            select(Ordem)
            .where(Ordem.id == ordem_id)
        )
        ordem = result.scalar_one_or_none()
        if not ordem:
            logger.warning("notify_workflow_transition: ordem %s não encontrada.", ordem_id)
            return

        destinatario_specs = _EVENT_RECIPIENTS.get(evento, [])
        recipients: list[User] = []

        for spec in destinatario_specs:
            if spec == "_criador":
                criador = await db.get(User, ordem.criado_por)
                if criador and criador.is_active:
                    recipients.append(criador)

            elif spec == "_secretaria":
                result_sec = await db.execute(
                    select(User).where(
                        User.secretaria_id == ordem.secretaria_id,
                        User.is_active.is_(True),
                    )
                )
                recipients.extend(result_sec.scalars().all())

            else:
                # spec é um nome de role
                try:
                    role = RoleEnum(spec)
                except ValueError:
                    logger.warning("Role desconhecida em _EVENT_RECIPIENTS: '%s'", spec)
                    continue
                result_role = await db.execute(
                    select(User).where(
                        User.role == role,
                        User.is_active.is_(True),
                    )
                )
                recipients.extend(result_role.scalars().all())

        # Deduplica por id
        seen: set[uuid.UUID] = set()
        unique_recipients = []
        for u in recipients:
            if u.id not in seen:
                seen.add(u.id)
                unique_recipients.append(u)

        for user in unique_recipients:
            opted_in = await self._check_preference(db, user.id, evento)
            if not opted_in:
                logger.debug("Usuário %s optou por não receber '%s'.", user.id, evento)
                continue

            await self._send_and_log(db, user, ordem, evento, app_base_url)

    async def _check_preference(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        evento: str,
    ) -> bool:
        """Retorna True se o usuário não desativou este evento.

        Se não houver registro → assume ativo=True (opt-out model).
        US-014 RN-73.
        """
        result = await db.execute(
            select(UserNotificationPrefs).where(
                UserNotificationPrefs.user_id == user_id,
                UserNotificationPrefs.evento == evento,
            )
        )
        pref = result.scalar_one_or_none()
        return pref.ativo if pref is not None else True

    async def _send_and_log(
        self,
        db: AsyncSession,
        user: User,
        ordem: Ordem,
        evento: str,
        app_base_url: str,
    ) -> None:
        """Envia o e-mail e registra o resultado em notification_log.

        US-014 RN-72: falha no envio registrada com status='falhou' — nunca levanta.
        """
        status: NotificationStatusEnum
        try:
            if settings.smtp_enabled:
                self._send_email(user, ordem, evento, app_base_url)
            else:
                # SMTP não configurado: simula envio bem-sucedido (dev/staging)
                logger.info(
                    "[SMTP desabilitado] E-mail simulado para %s — evento=%s, protocolo=%s",
                    user.email,
                    evento,
                    ordem.protocolo,
                )
            status = NotificationStatusEnum.enviado
        except Exception:
            logger.exception(
                "Falha ao enviar e-mail para %s — evento=%s", user.email, evento
            )
            status = NotificationStatusEnum.falhou

        log = NotificationLog(
            ordem_id=ordem.id,
            evento=evento,
            destinatario=user.email,
            status=status,
        )
        db.add(log)
        await db.commit()

    def _send_email(
        self,
        user: User,
        ordem: Ordem,
        evento: str,
        app_base_url: str,
    ) -> None:
        """Envia e-mail via SMTP síncrono (executado em background task).

        US-014 RN-71: e-mail contém protocolo, secretaria, etapa atual, observação e link.
        """
        link = f"{app_base_url}/secretaria/ordens/{ordem.id}"
        subject = f"[Forseti] Atualização na ordem {ordem.protocolo}"
        body_html = f"""
        <html><body>
          <h2>Atualização na Ordem de Serviço</h2>
          <p>Olá, <strong>{user.nome_completo}</strong>.</p>
          <p>A ordem <strong>{ordem.protocolo}</strong> teve uma atualização:</p>
          <ul>
            <li><strong>Evento:</strong> {evento.replace('_', ' ').capitalize()}</li>
            <li><strong>Status atual:</strong> {ordem.status.value}</li>
          </ul>
          <p><a href="{link}">Clique aqui para visualizar a ordem</a></p>
          <hr>
          <small>Prefeitura Municipal — Sistema de Gestão de Ordens de Serviço e Compras Públicas</small>
        </body></html>
        """

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM
        msg["To"] = user.email
        msg.attach(MIMEText(body_html, "html", "utf-8"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            if settings.SMTP_STARTTLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM, [user.email], msg.as_string())

    async def get_preferences(
        self, db: AsyncSession, user_id: uuid.UUID
    ) -> list[UserNotificationPrefs]:
        """Retorna preferências do usuário. Cria padrões se inexistentes."""
        result = await db.execute(
            select(UserNotificationPrefs).where(UserNotificationPrefs.user_id == user_id)
        )
        prefs = list(result.scalars().all())

        # Garante que todos os eventos conhecidos têm uma preferência
        existing_events = {p.evento for p in prefs}
        all_events = set(ACAO_PARA_EVENTO.values())
        missing = all_events - existing_events

        if missing:
            for ev in sorted(missing):
                new_pref = UserNotificationPrefs(
                    user_id=user_id,
                    evento=ev,
                    ativo=True,
                )
                db.add(new_pref)
            await db.commit()

            # Recarrega
            result = await db.execute(
                select(UserNotificationPrefs).where(UserNotificationPrefs.user_id == user_id)
            )
            prefs = list(result.scalars().all())

        return sorted(prefs, key=lambda p: p.evento)

    async def update_preferences(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        updates: dict[str, bool],
    ) -> list[UserNotificationPrefs]:
        """Atualiza preferências do usuário.

        updates: {evento: ativo_bool}
        US-014 RN-73: usuário configura preferências individualmente.
        """
        # Garante que os registros existem
        await self.get_preferences(db, user_id)

        # Aplica atualizações
        for evento, ativo in updates.items():
            if evento not in set(ACAO_PARA_EVENTO.values()):
                continue  # ignora eventos desconhecidos

            result = await db.execute(
                select(UserNotificationPrefs).where(
                    UserNotificationPrefs.user_id == user_id,
                    UserNotificationPrefs.evento == evento,
                )
            )
            pref = result.scalar_one_or_none()
            if pref:
                pref.ativo = ativo  # type: ignore[assignment]

        await db.commit()
        return await self.get_preferences(db, user_id)


notification_service = NotificationService()
