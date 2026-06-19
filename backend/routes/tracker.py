from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..routes.auth import get_current_user_dep
from ..schemas.tracker import (
    TrackerConnectionRead,
    TrackerConnectRequest,
    TrackerIssueCreate,
    TrackerIssueSearch,
    TrackerIssueUpdate,
    TrackerTransitionExecute,
)
from ..services import yandex_tracker as tracker_service

router = APIRouter()


@router.get("/connection", response_model=TrackerConnectionRead)
async def get_connection(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    conn = await tracker_service.get_connection(db, current_user.id)
    return tracker_service.connection_to_read(conn)


@router.post("/connection", response_model=TrackerConnectionRead)
async def connect(
    data: TrackerConnectRequest,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    conn = await tracker_service.connect(db, current_user.id, data)
    return tracker_service.connection_to_read(conn)


@router.delete("/connection", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    await tracker_service.disconnect(db, current_user.id)


@router.get("/queues")
async def list_queues(
    expand: Optional[str] = Query(default=None),
    per_page: int = Query(default=50, ge=1, le=100),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await tracker_service.get_client_for_user(db, current_user.id)
    return await client.list_queues(expand=expand, per_page=per_page)


@router.get("/issues")
async def list_issues(
    queue: Optional[str] = Query(default=None),
    query: Optional[str] = Query(default=None),
    fields: Optional[str] = Query(default=None),
    expand: Optional[str] = Query(default="transitions"),
    per_page: int = Query(default=50, ge=1, le=100),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await tracker_service.get_client_for_user(db, current_user.id)
    payload = {"queue": queue} if queue else {"query": query or "Updated: >= today()-30d"}
    return await client.search_issues(
        payload,
        expand=expand,
        fields=fields,
        per_page=per_page,
    )


@router.post("/issues/search")
async def search_issues(
    data: TrackerIssueSearch,
    fields: Optional[str] = Query(default=None),
    expand: Optional[str] = Query(default="transitions"),
    per_page: int = Query(default=50, ge=1, le=100),
    page: Optional[int] = Query(default=None, ge=1),
    page_id: Optional[str] = Query(default=None, alias="id"),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await tracker_service.get_client_for_user(db, current_user.id)
    payload = data.model_dump(exclude_none=True)
    return await client.search_issues(
        payload,
        expand=expand,
        fields=fields,
        per_page=per_page,
        page=page,
        page_id=page_id,
    )


@router.post("/issues", status_code=status.HTTP_201_CREATED)
async def create_issue(
    data: TrackerIssueCreate,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await tracker_service.get_client_for_user(db, current_user.id)
    payload = data.model_dump(exclude_none=True)
    return await client.create_issue(payload)


@router.get("/issues/{issue_id}/transitions")
async def list_transitions(
    issue_id: str,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await tracker_service.get_client_for_user(db, current_user.id)
    return await client.list_transitions(issue_id)


@router.post("/issues/{issue_id}/transitions/{transition_id}")
async def execute_transition(
    issue_id: str,
    transition_id: str,
    data: TrackerTransitionExecute,
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await tracker_service.get_client_for_user(db, current_user.id)
    payload = data.model_dump(exclude_none=True)
    return await client.execute_transition(issue_id, transition_id, payload)


@router.get("/issues/{issue_id}")
async def get_issue(
    issue_id: str,
    fields: Optional[str] = Query(default=None),
    expand: Optional[str] = Query(default="transitions"),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await tracker_service.get_client_for_user(db, current_user.id)
    return await client.get_issue(issue_id, expand=expand, fields=fields)


@router.patch("/issues/{issue_id}")
async def update_issue(
    issue_id: str,
    data: TrackerIssueUpdate,
    version: Optional[int] = Query(default=None),
    current_user=Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    client = await tracker_service.get_client_for_user(db, current_user.id)
    payload = data.model_dump(exclude_unset=True)
    return await client.update_issue(issue_id, payload, version=version)
