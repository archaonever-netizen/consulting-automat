from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..schemas.kaiten import (
    CardCreate,
    CardUpdate,
    KaitenConnectionRead,
    KaitenConnectRequest,
    MemberRequest,
)
from ..services import kaiten as kaiten_service

router = APIRouter()


# ── Подключение ──
@router.get("/connection", response_model=KaitenConnectionRead)
async def get_connection(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    conn = await kaiten_service.get_connection(db, current_user.id)
    if conn is None:
        return KaitenConnectionRead(connected=False)
    return KaitenConnectionRead(
        connected=True,
        domain=conn.domain,
        kaiten_user_name=conn.kaiten_user_name,
        kaiten_email=conn.kaiten_email,
    )


@router.post("/connection", response_model=KaitenConnectionRead)
async def connect(
    data: KaitenConnectRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    conn = await kaiten_service.connect(db, current_user.id, data.domain, data.token)
    return KaitenConnectionRead(
        connected=True,
        domain=conn.domain,
        kaiten_user_name=conn.kaiten_user_name,
        kaiten_email=conn.kaiten_email,
    )


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    await kaiten_service.disconnect(db, current_user.id)


# ── Пользователи (для назначения исполнителей) ──
@router.get("/users")
async def list_users(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    return await client.list_users()


# ── Пространства и доски ──
@router.get("/spaces")
async def list_spaces(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    return await client.list_spaces()


@router.get("/boards")
async def list_boards(
    space_id: int = Query(...),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    return await client.list_boards(space_id)


@router.get("/boards/{board_id}")
async def get_board(
    board_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    return await client.get_board(board_id)


@router.get("/boards/{board_id}/cards")
async def list_board_cards(
    board_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    return await client.list_cards(board_id)


# ── Карточки ──
@router.get("/cards/{card_id}")
async def get_card(
    card_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    return await client.get_card(card_id)


@router.post("/cards", status_code=status.HTTP_201_CREATED)
async def create_card(
    data: CardCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    payload = data.model_dump(exclude_none=True)
    return await client.create_card(payload)


@router.patch("/cards/{card_id}")
async def update_card(
    card_id: int,
    data: CardUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    # exclude_unset: шлём только переданные поля (позволяет очистить, напр., due_date → null)
    payload = data.model_dump(exclude_unset=True)
    return await client.update_card(card_id, payload)


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(
    card_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    await client.delete_card(card_id)


# ── Исполнители карточки ──
@router.post("/cards/{card_id}/members", status_code=status.HTTP_201_CREATED)
async def add_card_member(
    card_id: int,
    data: MemberRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    return await client.add_member(card_id, data.user_id)


@router.delete("/cards/{card_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_card_member(
    card_id: int,
    user_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await kaiten_service.get_client_for_user(db, current_user.id)
    await client.remove_member(card_id, user_id)
