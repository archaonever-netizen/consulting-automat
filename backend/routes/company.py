from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..services import company as company_service
from ..schemas.company import DepartmentCreate
from ..models import Department

router = APIRouter()


@router.get("")
async def get_company(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    return await company_service.list_company(db)


@router.post("/departments", status_code=status.HTTP_201_CREATED)
async def create_department(
    data: DepartmentCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db)
):
    dept = Department(name=data.name, description=data.description, created_by_id=current_user.id)
    db.add(dept)
    try:
        await db.commit()
        await db.refresh(dept)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Department with this name already exists")
    return {"id": dept.id, "name": dept.name}
