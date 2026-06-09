from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..services import briefs as brief_service
from ..schemas.briefs import BriefCreate, BriefRead, BriefUpdate

router = APIRouter()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_brief(
    data: BriefCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    brief = await brief_service.create_brief(db, data.brief_type, data.client_id)
    return {"id": brief.id, "brief_type": brief.brief_type}


@router.get("/{brief_id}", response_model=BriefRead)
async def get_brief(
    brief_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    brief = await brief_service.get_brief(db, brief_id)
    if brief is None:
        raise HTTPException(status_code=404, detail="Brief not found")
    return brief


@router.get("/{brief_id}/questions")
async def get_brief_questions(
    brief_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    brief = await brief_service.get_brief(db, brief_id)
    if brief is None:
        raise HTTPException(status_code=404, detail="Brief not found")
    questions = brief_service.get_brief_questions(brief.brief_type)
    answers: dict = {}
    for sec in brief.sections:
        if sec.data:
            answers.update(sec.data)
    return {"questions": questions, "answers": answers, "status": brief.status}


@router.put("/{brief_id}")
async def update_brief(
    brief_id: int,
    data: BriefUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    brief = await brief_service.update_brief(db, brief_id, data)
    if brief is None:
        raise HTTPException(status_code=404, detail="Brief not found")
    return {"id": brief.id, "status": brief.status}


@router.delete("/{brief_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_brief(
    brief_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    success = await brief_service.delete_brief(db, brief_id)
    if not success:
        raise HTTPException(status_code=404, detail="Brief not found")
