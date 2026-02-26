from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL.replace(
    "postgresql://", "postgresql+asyncpg://"
)

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Classe base para todos os models SQLAlchemy do projeto."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency do FastAPI que fornece uma sessão de banco de dados async.

    Garante que a sessão seja fechada corretamente após cada request,
    mesmo em caso de exceção.

    Yields:
        AsyncSession: sessão ativa do banco de dados.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
