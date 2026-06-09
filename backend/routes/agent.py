from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from ..core.database import get_db
from ..models import Client, OrchestrationRun
from ..routes.auth import get_current_user_dep
from ..schemas.agent import (
    OrchestrationRunRead,
    OrchestrationStartRequest,
    OrchestrationStartResponse,
)
from ..workers.tasks import run_orchestration

router = APIRouter()


@router.post(
    "/project/{client_id}",
    response_model=OrchestrationStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_orchestration(
    client_id: int,
    req: OrchestrationStartRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Запустить оркестрацию проекта (Celery задача в фоне)."""
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    run = OrchestrationRun(
        client_id=client_id,
        description=req.description,
        status="pending",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    task = run_orchestration.delay(run.id, client_id, req.description)

    return OrchestrationStartResponse(
        orchestration_id=run.id,
        task_id=str(task.id),
        status="pending",
    )


@router.get("/orchestration/{orchestration_id}", response_model=OrchestrationRunRead)
async def get_orchestration(
    orchestration_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Получить статус и результаты оркестрации (для polling)."""
    result = await db.execute(
        select(OrchestrationRun)
        .where(OrchestrationRun.id == orchestration_id)
        .options(selectinload(OrchestrationRun.analyses))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Orchestration not found")
    return run


@router.get("/client/{client_id}/orchestrations", response_model=list[OrchestrationRunRead])
async def list_client_orchestrations(
    client_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Список всех оркестраций для клиента."""
    result = await db.execute(
        select(OrchestrationRun)
        .where(OrchestrationRun.client_id == client_id)
        .options(selectinload(OrchestrationRun.analyses))
        .order_by(OrchestrationRun.created_at.desc())
    )
    return result.scalars().all()
