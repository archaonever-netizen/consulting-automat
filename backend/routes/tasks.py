from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..services import tasks as task_service
from ..schemas.tasks import TaskComplete, TaskCreate, TaskRead, TaskUpdate

router = APIRouter()


@router.get("")
async def list_tasks(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    return await task_service.list_tasks(db, current_user.id)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TaskRead)
async def create_task(
    data: TaskCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    return await task_service.create_task(db, data, current_user.id)


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(
    task_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    task = await task_service.get_task(db, task_id, current_user.id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.put("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    data: TaskUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    task = await task_service.update_task(db, task_id, data, current_user.id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/complete", response_model=TaskRead)
async def complete_task(
    task_id: int,
    data: TaskComplete,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    task = await task_service.complete_task(db, task_id, data, current_user.id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    success = await task_service.delete_task(db, task_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
