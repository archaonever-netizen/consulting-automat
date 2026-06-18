from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import TaskCompletion, UserTask
from ..schemas.tasks import TaskComplete, TaskCreate, TaskUpdate


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
        preparation_notes=data.preparation_notes,
        goal=data.goal,
        action_description=data.action_description,
        expected_result=data.expected_result,
        status='pending',
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def get_task(db: AsyncSession, task_id: int, user_id: int) -> UserTask | None:
    """Задача доступна только своему создателю — чужие id выглядят как 404."""
    result = await db.execute(
        select(UserTask)
        .where(UserTask.id == task_id, UserTask.created_by_id == user_id)
        .options(selectinload(UserTask.client), selectinload(UserTask.assigned_to))
    )
    return result.scalar_one_or_none()


async def update_task(
    db: AsyncSession,
    task_id: int,
    data: TaskUpdate,
    user_id: int,
) -> UserTask | None:
    task = await get_task(db, task_id, user_id)
    if task is None:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return task


async def complete_task(
    db: AsyncSession,
    task_id: int,
    data: TaskComplete,
    user_id: int,
) -> UserTask | None:
    """Завершить задачу: статус completed/failed + запись результатов (TaskCompletion)."""
    task = await get_task(db, task_id, user_id)
    if task is None:
        return None
    task.status = 'failed' if data.is_failure else 'completed'
    result = await db.execute(select(TaskCompletion).where(TaskCompletion.task_id == task_id))
    completion = result.scalar_one_or_none()
    if completion is None:
        completion = TaskCompletion(task_id=task_id)
        db.add(completion)
    completion.actual_result = data.actual_result
    completion.is_failure = data.is_failure
    completion.difficulties = data.difficulties
    completion.how_overcome = data.how_overcome
    completion.next_step = data.next_step
    await db.commit()
    # completion — relationship: подгружаем явно, иначе ленивый доступ упадёт в async
    await db.refresh(task, ["completion"])
    return task


async def delete_task(db: AsyncSession, task_id: int, user_id: int) -> bool:
    task = await get_task(db, task_id, user_id)
    if task is None:
        return False
    await db.delete(task)
    await db.commit()
    return True
