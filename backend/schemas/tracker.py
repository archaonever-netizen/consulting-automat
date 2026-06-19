from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, model_validator


TokenType = Literal["oauth", "iam"]


class TrackerConnectRequest(BaseModel):
    token: str
    org_id: Optional[str] = None
    cloud_org_id: Optional[str] = None
    token_type: TokenType = "oauth"
    default_queue: Optional[str] = None

    @model_validator(mode="after")
    def validate_org(self):
        if not (self.org_id or self.cloud_org_id):
            raise ValueError("Укажите org_id или cloud_org_id")
        if self.org_id and self.cloud_org_id:
            raise ValueError("Укажите только один тип организации")
        if self.token_type == "iam" and not self.cloud_org_id:
            raise ValueError("IAM-токен поддерживается только с cloud_org_id")
        return self


class TrackerConnectionRead(BaseModel):
    connected: bool
    org_id: Optional[str] = None
    cloud_org_id: Optional[str] = None
    token_type: Optional[TokenType] = None
    tracker_user_id: Optional[str] = None
    tracker_user_name: Optional[str] = None
    tracker_email: Optional[str] = None
    default_queue: Optional[str] = None


class TrackerIssueCreate(BaseModel):
    model_config = ConfigDict(extra="allow")

    queue: str | int | dict[str, Any]
    summary: str
    description: Optional[str] = None
    assignee: Optional[str | int | dict[str, Any]] = None
    type: Optional[str | int | dict[str, Any]] = None
    priority: Optional[str | int | dict[str, Any]] = None
    tags: Optional[list[str]] = None


class TrackerIssueUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    summary: Optional[str] = None
    description: Optional[str] = None
    assignee: Optional[str | int | dict[str, Any] | None] = None
    type: Optional[str | int | dict[str, Any]] = None
    priority: Optional[str | int | dict[str, Any]] = None
    tags: Optional[list[str] | dict[str, list[str]]] = None


class TrackerIssueSearch(BaseModel):
    queue: Optional[str] = None
    keys: Optional[str | list[str]] = None
    filter: Optional[dict[str, Any]] = None
    filterId: Optional[int] = None
    query: Optional[str] = None
    order: Optional[str] = None


class TrackerTransitionExecute(BaseModel):
    model_config = ConfigDict(extra="allow")

    comment: Optional[str] = None
