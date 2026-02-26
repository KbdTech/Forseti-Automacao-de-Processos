"""Script de seed — cria dados iniciais para desenvolvimento.

Cria:
  - 3 secretarias: Educação (EDU), Saúde (SAU), Obras (OBR)
  - 1 admin:          admin@prefeitura.gov.br / Admin123!
  - 1 secretaria/EDU: sec.edu@prefeitura.gov.br
  - 1 secretaria/SAU: sec.sau@prefeitura.gov.br
  - 1 secretaria/OBR: sec.obr@prefeitura.gov.br
  - 1 gabinete:       gabinete@prefeitura.gov.br
  - 1 controladoria:  controladoria@prefeitura.gov.br
  - 1 contabilidade:  contabilidade@prefeitura.gov.br
  - 1 tesouraria:     tesouraria@prefeitura.gov.br

Senhas padrão (exceto admin): Senha123!  — first_login=True
Senha admin:                   Admin123!  — first_login=False

Uso:
    cd backend
    python -m scripts.seed

Idempotente: ignora registros já existentes (verifica por e-mail/sigla).
"""

from __future__ import annotations

import asyncio
import sys
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Adiciona o diretório raiz do backend ao path para imports absolutos
sys.path.insert(0, ".")

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.secretaria import Secretaria  # noqa: E402
from app.models.user import RoleEnum, User  # noqa: E402


# ---------------------------------------------------------------------------
# Dados de seed
# ---------------------------------------------------------------------------

SECRETARIAS = [
    {"nome": "Secretaria Municipal de Educação", "sigla": "EDU", "orcamento_anual": Decimal("1200000.00")},
    {"nome": "Secretaria Municipal de Saúde",    "sigla": "SAU", "orcamento_anual": Decimal("2500000.00")},
    {"nome": "Secretaria Municipal de Obras",    "sigla": "OBR", "orcamento_anual": Decimal("800000.00")},
]

SENHA_PADRAO = "Senha123!"
SENHA_ADMIN  = "Admin123!"

# Usuários sem secretaria (perfis transversais)
USUARIOS_GLOBAIS = [
    {"email": "admin@prefeitura.gov.br",        "nome": "Administrador do Sistema",   "role": RoleEnum.admin,         "senha": SENHA_ADMIN,  "first_login": False},
    {"email": "gabinete@prefeitura.gov.br",     "nome": "Analista do Gabinete",       "role": RoleEnum.gabinete,      "senha": SENHA_PADRAO, "first_login": True},
    {"email": "controladoria@prefeitura.gov.br","nome": "Fiscal da Controladoria",    "role": RoleEnum.controladoria, "senha": SENHA_PADRAO, "first_login": True},
    {"email": "contabilidade@prefeitura.gov.br","nome": "Contador Municipal",         "role": RoleEnum.contabilidade, "senha": SENHA_PADRAO, "first_login": True},
    {"email": "tesouraria@prefeitura.gov.br",   "nome": "Tesoureiro Municipal",       "role": RoleEnum.tesouraria,    "senha": SENHA_PADRAO, "first_login": True},
]

# Usuários de secretaria — vinculados pela sigla
USUARIOS_SECRETARIA = [
    {"email": "sec.edu@prefeitura.gov.br", "nome": "Servidor — Secretaria de Educação", "sigla": "EDU"},
    {"email": "sec.sau@prefeitura.gov.br", "nome": "Servidor — Secretaria de Saúde",    "sigla": "SAU"},
    {"email": "sec.obr@prefeitura.gov.br", "nome": "Servidor — Secretaria de Obras",    "sigla": "OBR"},
]


# ---------------------------------------------------------------------------
# Funções auxiliares
# ---------------------------------------------------------------------------


async def _get_or_create_secretaria(
    db: AsyncSession, dados: dict
) -> tuple[Secretaria, bool]:
    """Retorna (secretaria, criada). Se já existir, apenas retorna."""
    result = await db.execute(
        select(Secretaria).where(Secretaria.sigla == dados["sigla"])
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing, False

    sec = Secretaria(
        nome=dados["nome"],
        sigla=dados["sigla"],
        orcamento_anual=dados["orcamento_anual"],
        ativo=True,
    )
    db.add(sec)
    await db.flush()  # obtém sec.id antes de usar como FK
    return sec, True


async def _get_or_create_user(
    db: AsyncSession,
    email: str,
    nome: str,
    role: RoleEnum,
    senha: str,
    first_login: bool,
    secretaria_id=None,
) -> tuple[User, bool]:
    """Retorna (user, criado). Se já existir, apenas retorna."""
    result = await db.execute(select(User).where(User.email == email))
    existing = result.scalar_one_or_none()
    if existing:
        return existing, False

    user = User(
        email=email,
        password_hash=hash_password(senha),
        nome_completo=nome,
        role=role,
        secretaria_id=secretaria_id,
        is_active=True,
        first_login=first_login,
    )
    db.add(user)
    await db.flush()
    return user, True


# ---------------------------------------------------------------------------
# Função principal
# ---------------------------------------------------------------------------


async def seed() -> None:
    """Executa o seed completo dentro de uma única transaction."""
    async with AsyncSessionLocal() as db:
        print("🌱 Iniciando seed do banco de dados...")

        # --- Secretarias ---
        secretaria_map: dict[str, Secretaria] = {}
        for dados in SECRETARIAS:
            sec, criada = await _get_or_create_secretaria(db, dados)
            secretaria_map[dados["sigla"]] = sec
            status = "criada" if criada else "já existe"
            print(f"  Secretaria [{dados['sigla']}] {dados['nome']}: {status}")

        # --- Usuários globais (sem secretaria) ---
        for u in USUARIOS_GLOBAIS:
            _, criado = await _get_or_create_user(
                db=db,
                email=u["email"],
                nome=u["nome"],
                role=u["role"],
                senha=u["senha"],
                first_login=u["first_login"],
                secretaria_id=None,
            )
            status = "criado" if criado else "já existe"
            first_msg = " (sem troca de senha)" if not u["first_login"] else " (troca obrigatória)"
            print(f"  Usuário [{u['role'].value}] {u['email']}: {status}{first_msg}")

        # --- Usuários de secretaria ---
        for u in USUARIOS_SECRETARIA:
            sec = secretaria_map[u["sigla"]]
            _, criado = await _get_or_create_user(
                db=db,
                email=u["email"],
                nome=u["nome"],
                role=RoleEnum.secretaria,
                senha=SENHA_PADRAO,
                first_login=True,
                secretaria_id=sec.id,
            )
            status = "criado" if criado else "já existe"
            print(f"  Usuário [secretaria/{u['sigla']}] {u['email']}: {status} (troca obrigatória)")

        await db.commit()

        print("\n✅ Seed concluído!")
        print("\nCredenciais de acesso:")
        print(f"  Admin:          admin@prefeitura.gov.br  /  {SENHA_ADMIN}")
        print(f"  Secretaria EDU: sec.edu@prefeitura.gov.br / {SENHA_PADRAO}")
        print(f"  Secretaria SAU: sec.sau@prefeitura.gov.br / {SENHA_PADRAO}")
        print(f"  Secretaria OBR: sec.obr@prefeitura.gov.br / {SENHA_PADRAO}")
        print(f"  Gabinete:       gabinete@prefeitura.gov.br / {SENHA_PADRAO}")
        print(f"  Controladoria:  controladoria@prefeitura.gov.br / {SENHA_PADRAO}")
        print(f"  Contabilidade:  contabilidade@prefeitura.gov.br / {SENHA_PADRAO}")
        print(f"  Tesouraria:     tesouraria@prefeitura.gov.br / {SENHA_PADRAO}")
        print("\n⚠️  Usuários com first_login=True precisam trocar a senha no primeiro acesso.")


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    asyncio.run(seed())
