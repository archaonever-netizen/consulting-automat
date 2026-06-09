from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from ..models import UserTask
from ..schemas.tasks import TaskCreate


async def list_tasks(db: AsyncSession, user_id: int) -> list[UserTask]:
    result = await db.execute(
        select(UserTask)
        .where(UserTask.created_by_id == user_id)
        .options(selectinload(UserTask.client), selectinload(UserTask.assigned_to))
        .order_by(desc(UserTask.created_at))
    )
    return result.scalars().all()


async def create_task(db: AsyncSession, data: TaskCreate, user_id: int) -> UserTask:
    task = UserTask(
        title=data.title,
        client_id=data.client_id,
        assigned_to_id=data.assigned_to_id,
        created_by_id=user_id,
        start_time=data.start_time,
        duration_minutes=data.duration_minutes,
        input_data=data.input_data,
        goal=data.goal,
        action_description=data.action_description,
        expected_result=data.expected_result,
        status='pending',
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def get_task(db: AsyncSession, task_id: int) -> UserTask | None:
    result = await db.execute(
        select(UserTask)
        .where(UserTask.id == task_id)
        .options(selectinload(UserTask.client), selectinload(UserTask.assigned_to))
    )
    return result.scalar_one_or_none()


async def delete_task(db: AsyncSession, task_id: int) -> bool:
    task = await get_task(db, task_id)
    if task is None:
        return False
    await db.delete(task)
    await db.commit()
    return True
