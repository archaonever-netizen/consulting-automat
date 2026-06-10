from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..services import company as company_service
from ..schemas.company import DepartmentCreate, LinkCreate, FunctionUpdate, DepartmentUpdate
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


# ───────────────────────── детали функции/отдела ─────────────────────────

@router.get("/functions/{function_id}")
async def get_function(
    function_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    detail = await company_service.get_function_detail(db, function_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Function not found")
    return detail


@router.get("/departments/{department_id}")
async def get_department(
    department_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    detail = await company_service.get_department_detail(db, department_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Department not found")
    return detail


@router.patch("/functions/{function_id}")
async def patch_function(
    function_id: int,
    data: FunctionUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    fields = data.model_dump(exclude_unset=True)
    # Списки ContentItem уже сериализованы model_dump в list[dict] — пишутся в JSON.
    ok = await company_service.update_function(db, function_id, fields)
    if not ok:
        raise HTTPException(status_code=404, detail="Function not found")
    return await company_service.get_function_detail(db, function_id)


@router.patch("/departments/{department_id}")
async def patch_department(
    department_id: int,
    data: DepartmentUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    fields = data.model_dump(exclude_unset=True)
    ok = await company_service.update_department(db, department_id, fields)
    if not ok:
        raise HTTPException(status_code=404, detail="Department not found")
    return await company_service.get_department_detail(db, department_id)


# ───────────────────────── связи ─────────────────────────

@router.post("/links", status_code=status.HTTP_201_CREATED)
async def add_link(
    data: LinkCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    try:
        link = await company_service.create_link(
            db,
            function_id=data.function_id,
            department_id=data.department_id,
            relation_type=data.relation_type,
            description=data.description,
            created_by_id=current_user.id,
        )
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Такая связь уже существует")
    return {
        "id": link.id,
        "function_id": link.function_id,
        "department_id": link.department_id,
        "relation_type": link.relation_type,
    }


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_link(
    link_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    ok = await company_service.delete_link(db, link_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")
    return None
