"""«Add methodology» API — founder-only. Upload PDF → estimate → run → status.

The expensive «run» also requires the bots password-lock (X-Edit-Unlock): adding
a source spends money, so it must be a deliberate, unlocked action.
"""
import asyncio

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..routes.bots import require_edit_unlock
from ..services import source_admin as svc

router = APIRouter()


async def require_founder(current_user=Depends(get_current_user_dep)):
    if not current_user.is_founder:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Добавление методологий доступно только основателю",
        )
    return current_user


@router.post("/sources/upload")
async def upload_source(
    file: UploadFile = File(...),
    title: str = Form(...),
    key: str = Form(...),
    methodology: str = Form(""),
    language: str = Form("en"),
    confidential: bool = Form(False),
    framework_key: str = Form(""),
    framework_name: str = Form(""),
    user=Depends(require_founder),
    db: AsyncSession = Depends(get_db),
):
    """Store the PDF, count pages, return an (approximate) cost estimate + draft job."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    try:
        return await svc.create_job(
            db, key=key, file_bytes=data, title=title,
            methodology=methodology or None, language=language, confidential=confidential,
            framework_key=framework_key or None, framework_name=framework_name or None,
            created_by_id=user.id,
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/sources/jobs/{job_id}/run")
async def run_source(
    job_id: int,
    user=Depends(require_founder),
    _=Depends(require_edit_unlock),
    db: AsyncSession = Depends(get_db),
):
    """Start the background import (queue-of-one). Requires the password-lock."""
    try:
        result = await svc.start_job(db, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    from ..services.source_ingest_runner import run_ingest_job
    asyncio.create_task(run_ingest_job(job_id))  # in-process background; no extra infra
    return result


@router.post("/sources/jobs/{job_id}/cancel")
async def cancel_source(
    job_id: int,
    user=Depends(require_founder),
    _=Depends(require_edit_unlock),
    db: AsyncSession = Depends(get_db),
):
    """Cancel/abandon an import (e.g. a stuck job): clean data + PDF. Requires lock."""
    try:
        return await svc.cancel_job(db, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/sources/jobs/{job_id}")
async def get_job(job_id: int, user=Depends(require_founder), db: AsyncSession = Depends(get_db)):
    """Poll status/progress/tokens for the progress bar."""
    st = await svc.job_status(db, job_id)
    if st is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return st


@router.get("/sources/{key}/sample-cards")
async def get_sample_cards(key: str, user=Depends(require_founder), db: AsyncSession = Depends(get_db)):
    """2–3 example cards for the success panel."""
    return await svc.sample_cards(db, key)
