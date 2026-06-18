from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Client, ClientUser
from ..schemas.portal_users import PortalUserCreate, PortalUserUpdate


class EmailExists(Exception):
    """Email уже занят другим пользователем портала."""


def _to_dict(u: ClientUser) -> dict:
    return {
        "id": u.id,
        "client_id": u.client_id,
        "full_name": u.full_name,
        "email": u.email,
        "role": u.role or "",
        "sections": u.sections or [],
        "is_active": u.is_active,
        "created_at": u.created_at,
    }


async def list_portal_users(db: AsyncSession, client_id: int) -> list[dict]:
    result = await db.execute(
        select(ClientUser)
        .where(ClientUser.client_id == client_id)
        .order_by(ClientUser.full_name)
    )
    return [_to_dict(u) for u in result.scalars().all()]


async def _email_taken(db: AsyncSession, email: str, exclude_id: int | None = None) -> bool:
    stmt = select(ClientUser).where(ClientUser.email == email)
    if exclude_id is not None:
        stmt = stmt.where(ClientUser.id != exclude_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def create_portal_user(
    db: AsyncSession,
    client_id: int,
    data: PortalUserCreate,
    created_by_id: int | None = None,
) -> dict | None:
    client = await db.get(Client, client_id)
    if client is None:
        return None
    if await _email_taken(db, data.email):
        raise EmailExists()
    user = ClientUser(
        client_id=client_id,
        email=data.email,
        full_name=data.full_name,
        role=data.role or "",
        sections=data.sections,
        created_by_id=created_by_id,
    )
    user.set_password(data.password)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _to_dict(user)


async def _get_in_client(db: AsyncSession, client_id: int, user_id: int) -> ClientUser | None:
    result = await db.execute(
        select(ClientUser).where(
            ClientUser.id == user_id, ClientUser.client_id == client_id
        )
    )
    return result.scalar_one_or_none()


async def update_portal_user(
    db: AsyncSession, client_id: int, user_id: int, data: PortalUserUpdate
) -> dict | None:
    user = await _get_in_client(db, client_id, user_id)
    if user is None:
        return None
    if data.email is not None and data.email != user.email:
        if await _email_taken(db, data.email, exclude_id=user.id):
            raise EmailExists()
        user.email = data.email
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.role is not None:
        user.role = data.role
    if data.sections is not None:
        user.sections = data.sections
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password:
        user.set_password(data.password)
    await db.commit()
    await db.refresh(user)
    return _to_dict(user)


async def delete_portal_user(db: AsyncSession, client_id: int, user_id: int) -> bool:
    user = await _get_in_client(db, client_id, user_id)
    if user is None:
        return False
    await db.delete(user)
    await db.commit()
    return True
