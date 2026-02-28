from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routes import auth as auth_router
from app.api.routes import users as users_router
from app.api.routes import ordens as ordens_router
from app.api.routes import secretarias as secretarias_router
from app.api.routes import audit as audit_router
from app.api.routes import dashboard as dashboard_router
from app.api.routes import notifications as notifications_router
from app.api.routes import documentos as documentos_router
from app.services.documento_service import documento_service


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """Garante que o bucket do Supabase Storage existe antes de servir requests."""
    await documento_service.ensure_bucket()
    yield


app = FastAPI(
    title="Sistema OS Prefeitura",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers registrados ---
app.include_router(auth_router.router)        # US-001: /api/auth/*
app.include_router(users_router.router)       # US-002: /api/users/*
app.include_router(ordens_router.router)      # US-003 a US-010: /api/ordens/*
app.include_router(secretarias_router.router) # US-013: /api/secretarias/*
app.include_router(dashboard_router.router)   # US-011: /api/dashboard/*
app.include_router(audit_router.router)       # US-012: /api/ordens/{id}/historico + /api/audit-logs
app.include_router(notifications_router.router) # US-014: /api/notifications/preferences
app.include_router(documentos_router.router)    # US-015: /api/ordens/{id}/documentos + /api/documentos/{id}/*


@app.get("/health", tags=["infra"])
async def health() -> dict[str, str]:
    """Endpoint de health check da aplicação."""
    return {"status": "ok", "version": "1.0.0"}
