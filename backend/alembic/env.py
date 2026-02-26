"""Configuração do ambiente Alembic para migrações síncronas.

Usa psycopg2 para migrações (sync), enquanto a aplicação usa asyncpg (async).
Este padrão é recomendado: drivers diferentes para migration vs runtime.

URL de conexão:
  - settings.DATABASE_URL  →  postgresql://...  (psycopg2 — Alembic)
  - app.core.database      →  postgresql+asyncpg://...  (asyncpg — FastAPI)

IMPORTANTE: NÃO usar config.set_main_option() com a DATABASE_URL.
O configparser do alembic.ini trata '%' como interpolação e rejeita URLs
com caracteres URL-encoded (%21, %24, etc.). O engine é criado diretamente
via create_engine(url=...) para contornar esse comportamento.
"""

from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context

# ---------------------------------------------------------------------------
# Configurações da aplicação e models (necessário para autogenerate)
# ---------------------------------------------------------------------------

from app.core.config import settings  # noqa: E402

# Importa Base e todos os models para registrar o metadata antes de autogenerate.
# Ordem de importação respeita dependências de FK (ver app/models/__init__.py).
from app.core.database import Base  # noqa: E402, F401
import app.models  # noqa: E402, F401

# ---------------------------------------------------------------------------
# Setup Alembic padrão
# ---------------------------------------------------------------------------

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# URL de conexão — psycopg2 (sync) para o Alembic
#
# Converte 'postgresql+asyncpg://' → 'postgresql://' caso necessário.
# Se DATABASE_URL já começar com 'postgresql://', nenhuma alteração é feita.
#
# NÃO passamos via config.set_main_option() para evitar o bug de
# interpolação do configparser com '%' em URLs URL-encoded.
# ---------------------------------------------------------------------------

_db_url: str = settings.DATABASE_URL.replace(
    "postgresql+asyncpg://", "postgresql://"
)


# ---------------------------------------------------------------------------
# Funções padrão do Alembic
# ---------------------------------------------------------------------------


def run_migrations_offline() -> None:
    """Executa migrações em modo offline (sem conexão ativa ao banco).

    Gera o SQL das migrações como string, útil para auditar antes de aplicar.
    """
    context.configure(
        url=_db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Executa migrações em modo online (com conexão ativa ao banco).

    Cria engine psycopg2 síncrona, conecta e aplica as migrações.
    """
    connectable = create_engine(url=_db_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
