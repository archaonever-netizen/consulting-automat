from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..services import clients as client_service
from ..services.clients import get_home_data
from ..schemas.clients import ClientCreate, ClientUpdate

router = APIRouter()


@router.get("")
async def list_clients(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    return await client_service.list_clients(db)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_client(
    data: ClientCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    client = await client_service.create_client(db, data)
    return {"id": client.id, "name": client.name}


@router.get("/home")
async def get_home(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    return await get_home_data(db)


@router.get("/{client_id}")
async def get_client(
    client_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    detail = await client_service.get_client_detail(db, client_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return detail


@router.put("/{client_id}")
async def update_client(
    client_id: int,
    data: ClientUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    client = await client_service.update_client(db, client_id, data)
    if client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"id": client.id, "name": client.name}


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    success = await client_service.delete_client(db, client_id)
    if not success:
        raise HTTPException(status_code=404, detail="Client not found")
