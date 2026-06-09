from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class OrchestrationStartRequest(BaseModel):
    description: str
    # "pipeline" — LCEL-конвейер v1; "network" — сеть агентов v2 на LangGraph
    mode: str = "pipeline"


class FunctionAnalysisRead(BaseModel):
    id: int
    orchestration_id: int
    function_name: str
    status: str
    result: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrchestrationRunRead(BaseModel):
    id: int
    client_id: int
    description: str
    status: str
    results: Optional[dict] = None
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    analyses: list[FunctionAnalysisRead] = []

    model_config = {"from_attributes": True}


class OrchestrationStartResponse(BaseModel):
    orchestration_id: int
    # для сетевого live-режима Celery не запускается → task_id может отсутствовать
    task_id: Optional[str] = None
    status: str = "pending"
