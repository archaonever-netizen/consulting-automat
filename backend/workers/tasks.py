"""Celery задачи для фоновых операций оркестрации."""
import asyncio
from datetime import datetime

from ..core.celery_app import celery_app
from ..core.database import AsyncSessionLocal
from ..models import OrchestrationRun


@celery_app.task(bind=True, time_limit=600, soft_time_limit=540, name="backend.workers.tasks.run_orchestration")
def run_orchestration(self, orchestration_id: int, client_id: int, description: str):
    """
    Celery task: запустить оркестрацию проекта.
    Использует asyncio.run() т.к. Celery worker — синхронный процесс.
    """
    async def _run():
        from ..services.orchestrator_service import orchestrate_project
        from ..core.database import engine

        try:
            async with AsyncSessionLocal() as db:
                run = await db.get(OrchestrationRun, orchestration_id)
                if not run:
                    return

                run.status = "running"
                await db.commit()

                try:
                    results = await orchestrate_project(orchestration_id, client_id, description, db)
                    run.status = "completed"
                    run.results = results
                except Exception as exc:
                    # Сессия могла остаться в pending-rollback после DB-ошибки —
                    # откатываем перед записью статуса, иначе commit в finally затрёт ошибку.
                    await db.rollback()
                    run = await db.get(OrchestrationRun, orchestration_id)
                    run.status = "failed"
                    run.error = str(exc)
                finally:
                    run.completed_at = datetime.utcnow()
                    await db.commit()
        finally:
            # Каждый вызов задачи запускает новый event loop через asyncio.run().
            # Пул engine привязан к loop'у — закрываем коннекты, пока loop ещё жив,
            # иначе следующая задача получит "Event loop is closed".
            await engine.dispose()

    asyncio.run(_run())
