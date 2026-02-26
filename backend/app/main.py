from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(
    title="Sistema OS Prefeitura",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers serão registrados aqui com prefixo /api
# Exemplo: app.include_router(auth.router, prefix="/api/auth", tags=["auth"])


@app.get("/health", tags=["infra"])
async def health() -> dict[str, str]:
    """Endpoint de health check da aplicação."""
    return {"status": "ok", "version": "1.0.0"}
