"""Service de gestão de usuários — lógica de negócio da US-002.

Responsabilidades:
  - Listar usuários com filtros e paginação (US-002)
  - Criar usuário com validação de e-mail único e secretaria (US-002)
  - Atualizar dados do usuário (US-002)
  - Alterar perfil com proteção de auto-remoção de admin (US-002 RN-9)
  - Registrar em audit_logs e role_change_log (US-002 RN-10)
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.audit import AuditLog
from app.models.secretaria import Secretaria
from app.models.user import RoleChangeLog, RoleEnum, User
from app.schemas.user import UserCreate, UserListResponse, UserResponse, UserUpdate


# ---------------------------------------------------------------------------
# UserService — classe principal
# ---------------------------------------------------------------------------


class UserService:
    """Encapsula toda a lógica de negócio de gestão de usuários da US-002."""

    async def list_users(
        self,
        db: AsyncSession,
        page: int = 1,
        limit: int = 20,
        role_filter: Optional[str] = None,
        secretaria_filter: Optional[UUID] = None,
    ) -> UserListResponse:
        """Lista usuários com filtros opcionais e paginação.

        US-002: visibilidade total apenas para admin.
        US-004 RN-24: paginação padrão de 20 registros por página.
        Ordenado por nome_completo ASC para exibição consistente.

        Args:
            page: Página atual (1-based).
            limit: Registros por página.
            role_filter: Filtrar por perfil (string, ex.: 'secretaria').
            secretaria_filter: Filtrar por UUID da secretaria.

        Returns:
            UserListResponse com items, total, page e limit.
        """
        base_query = select(User)
        count_query = select(func.count()).select_from(User)

        # Filtro por role
        if role_filter:
            try:
                role_enum = RoleEnum(role_filter)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Perfil inválido: '{role_filter}'. Valores aceitos: {[r.value for r in RoleEnum]}",
                )
            base_query = base_query.where(User.role == role_enum)
            count_query = count_query.where(User.role == role_enum)

        # Filtro por secretaria
        if secretaria_filter:
            base_query = base_query.where(User.secretaria_id == secretaria_filter)
            count_query = count_query.where(User.secretaria_id == secretaria_filter)

        # Total de registros com filtros aplicados
        total_result = await db.execute(count_query)
        total: int = total_result.scalar_one()

        # Paginação e ordenação
        offset = (page - 1) * limit
        paginated_query = (
            base_query.order_by(User.nome_completo.asc()).offset(offset).limit(limit)
        )
        result = await db.execute(paginated_query)
        users = result.scalars().all()

        return UserListResponse(
            items=[UserResponse.model_validate(u) for u in users],
            total=total,
            page=page,
            limit=limit,
        )

    async def create_user(
        self,
        db: AsyncSession,
        data: UserCreate,
        created_by: UUID,
    ) -> UserResponse:
        """Cria um novo usuário no sistema.

        Fluxo:
          1. Verificar unicidade do e-mail (case-insensitive)
          2. Se role='secretaria': validar que secretaria existe e está ativa
          3. Hash da senha com bcrypt
          4. first_login=True (US-001 RN-5: troca obrigatória no primeiro acesso)
          5. Registrar em audit_logs action='user_created'

        Args:
            data: Payload de criação do usuário.
            created_by: UUID do admin que está criando o usuário.

        Returns:
            UserResponse do usuário criado.

        Raises:
            HTTPException 409: E-mail já cadastrado.
            HTTPException 404: Secretaria não encontrada.
            HTTPException 422: Secretaria desativada.
        """
        # Verificar unicidade do e-mail (case-insensitive — US-002)
        existing_result = await db.execute(
            select(User).where(func.lower(User.email) == data.email.lower())
        )
        if existing_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="E-mail já cadastrado.",
            )

        # US-002 RN-7: secretaria_id obrigatório e válido para perfil 'secretaria'
        secretaria_id_final: UUID | None = None
        if data.role == "secretaria":
            sec_result = await db.execute(
                select(Secretaria).where(Secretaria.id == data.secretaria_id)
            )
            sec = sec_result.scalar_one_or_none()
            if sec is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Secretaria não encontrada.",
                )
            if not sec.ativo:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Secretaria desativada. Escolha uma secretaria ativa.",
                )
            secretaria_id_final = data.secretaria_id

        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            nome_completo=data.nome,
            role=RoleEnum(data.role),
            secretaria_id=secretaria_id_final,
            is_active=True,
            first_login=True,  # US-001 RN-5: troca de senha obrigatória
        )
        db.add(user)
        await db.flush()  # persiste para obter user.id antes do audit

        # Audit log — append-only (US-012 RN-60)
        log = AuditLog(user_id=created_by, action="user_created")
        db.add(log)
        await db.flush()

        await db.commit()
        await db.refresh(user)
        return UserResponse.model_validate(user)

    async def update_user(
        self,
        db: AsyncSession,
        user_id: UUID,
        data: UserUpdate,
        updated_by: UUID,
    ) -> UserResponse:
        """Atualiza dados de um usuário existente (PATCH semântico).

        Apenas os campos informados (não-None) são atualizados.
        Para alterar o perfil, usar update_role.

        Args:
            user_id: UUID do usuário a ser atualizado.
            data: Campos a atualizar (todos opcionais).
            updated_by: UUID do admin que está realizando a alteração.

        Returns:
            UserResponse atualizado.

        Raises:
            HTTPException 404: Usuário não encontrado.
            HTTPException 409: Novo e-mail já está em uso por outro usuário.
        """
        result = await db.execute(select(User).where(User.id == user_id))
        user: User | None = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado.",
            )

        # Verificar unicidade do e-mail se foi alterado
        if data.email is not None and data.email.lower() != user.email.lower():
            dup_result = await db.execute(
                select(User).where(func.lower(User.email) == data.email.lower())
            )
            if dup_result.scalar_one_or_none() is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="E-mail já cadastrado.",
                )
            user.email = data.email

        # Atualizar apenas campos fornecidos
        if data.nome is not None:
            user.nome_completo = data.nome
        if data.is_active is not None:
            user.is_active = data.is_active
        if data.secretaria_id is not None:
            user.secretaria_id = data.secretaria_id

        user.updated_at = datetime.now(timezone.utc)

        # Audit log — append-only (US-012 RN-60)
        log = AuditLog(user_id=updated_by, action="user_updated")
        db.add(log)
        await db.flush()

        await db.commit()
        await db.refresh(user)
        return UserResponse.model_validate(user)

    async def reset_password(
        self,
        db: AsyncSession,
        user_id: UUID,
        reset_by: UUID,
    ) -> UserResponse:
        """Reseta a senha de um usuário forçando troca no próximo acesso.

        Define first_login=True, login_attempts=0 e locked_until=None.
        O usuário será redirecionado para PrimeiroAcessoPage no próximo login.

        Args:
            user_id: UUID do usuário que terá a senha resetada.
            reset_by: UUID do admin que solicitou o reset.

        Returns:
            UserResponse atualizado.

        Raises:
            HTTPException 404: Usuário não encontrado.
        """
        result = await db.execute(select(User).where(User.id == user_id))
        user: User | None = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado.",
            )

        user.first_login = True
        user.login_attempts = 0
        user.locked_until = None
        user.updated_at = datetime.now(timezone.utc)

        # audit_logs — append-only (US-012 RN-60)
        log = AuditLog(user_id=reset_by, action="password_reset")
        db.add(log)
        await db.flush()

        await db.commit()
        await db.refresh(user)
        return UserResponse.model_validate(user)

    async def update_role(
        self,
        db: AsyncSession,
        user_id: UUID,
        new_role: str,
        updated_by: UUID,
    ) -> UserResponse:
        """Altera o perfil de acesso de um usuário.

        Fluxo:
          1. Buscar usuário ou 404
          2. Impedir que admin remova seu próprio perfil (US-002 RN-9)
          3. Atualizar role e secretaria_id
          4. Registrar em role_change_log (US-002 RN-10 — append-only)
          5. Registrar em audit_logs action='role_changed'

        Args:
            user_id: UUID do usuário que terá o perfil alterado.
            new_role: String do novo perfil (ex.: 'gabinete').
            updated_by: UUID do admin que está realizando a alteração.

        Returns:
            UserResponse com novo perfil.

        Raises:
            HTTPException 404: Usuário não encontrado.
            HTTPException 422: Admin tentando remover próprio perfil de admin.
        """
        result = await db.execute(select(User).where(User.id == user_id))
        user: User | None = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Usuário não encontrado.",
            )

        # US-002 RN-9: admin não pode remover seu próprio perfil de admin
        if user_id == updated_by and new_role != "admin":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Não é possível remover seu próprio perfil de administrador.",
            )

        old_role = user.role
        new_role_enum = RoleEnum(new_role)

        user.role = new_role_enum
        # Limpar secretaria_id para perfis transversais (não-secretaria)
        if new_role != "secretaria":
            user.secretaria_id = None
        user.updated_at = datetime.now(timezone.utc)

        # role_change_log — append-only (US-002 RN-10)
        role_log = RoleChangeLog(
            user_id=user_id,
            old_role=old_role,
            new_role=new_role_enum,
            changed_by=updated_by,
        )
        db.add(role_log)

        # audit_logs — append-only (US-012 RN-60)
        audit = AuditLog(user_id=updated_by, action="role_changed")
        db.add(audit)
        await db.flush()

        await db.commit()
        await db.refresh(user)
        return UserResponse.model_validate(user)


# ---------------------------------------------------------------------------
# Singleton — instância única para uso nos routers
# ---------------------------------------------------------------------------

user_service = UserService()
