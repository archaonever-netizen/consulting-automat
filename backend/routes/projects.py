from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..schemas.projects import ProjectCreate, ProjectUpdate
from ..services import projects as project_service

router = APIRouter()


@router.get("")
async def list_projects(
    client_id: int | None = Query(default=None),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    return await project_service.list_projects(db, client_id=client_id)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.create_project(db, data)
    if project is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"id": project.id, "client_id": project.client_id, "name": project.name}


@router.get("/{project_id}")
async def get_project(
    project_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    project = await project_service.update_project(db, project_id, data)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"id": project.id, "client_id": project.client_id, "name": project.name}


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    success = await project_service.delete_project(db, project_id)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
