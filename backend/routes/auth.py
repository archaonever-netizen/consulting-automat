from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from ..core.database import get_db
from ..models import User
from ..schemas.auth import LoginRequest, TokenResponse, UserRead
from ..services.auth import authenticate_user, create_access_token, get_current_user

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user_dep(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    return await get_current_user(token, db)


@router.post("/auth/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, data.email, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.get("/auth/me", response_model=UserRead)
async def me(current_user=Depends(get_current_user_dep)):
    return current_user


@router.get("/users")
async def list_app_users(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Сотрудники ШЕФ — для моста с исполнителями внешнего трекера по email."""
    result = await db.execute(
        select(User).where(User.is_active.is_(True)).options(selectinload(User.role))
    )
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "is_founder": u.is_founder,
            "role_name": u.role.name if u.role else None,
        }
        for u in users
    ]


@router.post("/auth/logout")
async def logout():
    return {"status": "ok"}
