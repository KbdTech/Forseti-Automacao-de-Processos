"""Router de preferências de notificação — US-014.

Endpoints:
  GET  /api/notifications/preferences  — retorna preferências do usuário autenticado
  PUT  /api/notifications/preferences  — atualiza preferências do usuário autenticado

US-014 RN-73: usuário pode configurar quais eventos receber.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.notification_service import ACAO_PARA_EVENTO, notification_service

router = APIRouter(prefix="/api/notifications", tags=["Notificações"])

AnyAuthenticated = Annotated[User, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class NotificationPrefItem(BaseModel):
    """Preferência de notificação de um evento."""

    evento: str
    ativo: bool

    model_config = {"from_attributes": True}


class NotificationPrefsResponse(BaseModel):
    """Lista completa de preferências do usuário."""

    preferences: list[NotificationPrefItem]
    available_events: list[str]


class UpdatePrefsPayload(BaseModel):
    """Payload para atualizar preferências: {evento: ativo}."""

    preferences: dict[str, bool]


# ---------------------------------------------------------------------------
# GET /api/notifications/preferences
# ---------------------------------------------------------------------------


@router.get(
    "/preferences",
    response_model=NotificationPrefsResponse,
    status_code=200,
)
async def get_preferences(
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationPrefsResponse:
    """Retorna preferências de notificação do usuário autenticado.

    Inicializa automaticamente preferências inexistentes com ativo=True.
    US-014 RN-73.
    """
    prefs = await notification_service.get_preferences(db, current_user.id)
    items = [NotificationPrefItem(evento=p.evento, ativo=p.ativo) for p in prefs]
    return NotificationPrefsResponse(
        preferences=items,
        available_events=sorted(set(ACAO_PARA_EVENTO.values())),
    )


# ---------------------------------------------------------------------------
# PUT /api/notifications/preferences
# ---------------------------------------------------------------------------


@router.put(
    "/preferences",
    response_model=NotificationPrefsResponse,
    status_code=200,
)
async def update_preferences(
    payload: UpdatePrefsPayload,
    current_user: AnyAuthenticated,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationPrefsResponse:
    """Atualiza preferências de notificação do usuário autenticado.

    Payload: {"preferences": {"ordem_devolvida": false, ...}}
    US-014 RN-73: cada usuário controla sua própria preferência.
    """
    prefs = await notification_service.update_preferences(
        db, current_user.id, payload.preferences
    )
    items = [NotificationPrefItem(evento=p.evento, ativo=p.ativo) for p in prefs]
    return NotificationPrefsResponse(
        preferences=items,
        available_events=sorted(set(ACAO_PARA_EVENTO.values())),
    )
