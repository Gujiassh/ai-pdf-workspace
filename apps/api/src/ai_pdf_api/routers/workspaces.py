from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import User, Workspace, WorkspaceMembership
from ai_pdf_api.schemas.workspace import (
    CreateWorkspaceRequest,
    CreateWorkspaceResponse,
    WorkspaceDetailResponse,
    WorkspaceListResponse,
    WorkspaceSummary,
)

router = APIRouter(prefix="/v1/workspaces", tags=["workspaces"])

UserIdHeader = Annotated[str | None, Header(alias="x-user-id")]


def require_user_id(x_user_id: UserIdHeader = None) -> str:
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return x_user_id


def require_existing_user(user_id: str, db: Session) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user not found.",
        )
    return user


def base_workspace_query_for_user(user_id: str) -> Select[tuple[Workspace, str]]:
    return (
        select(Workspace, WorkspaceMembership.role)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
        .where(
            WorkspaceMembership.user_id == user_id,
            Workspace.archived_at.is_(None),
        )
    )


def to_workspace_summary(workspace: Workspace, role: str) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        role=role,
        documentCount=0,
        noteCount=0,
        threadCount=0,
        createdAt=workspace.created_at.astimezone(UTC).isoformat(),
        updatedAt=workspace.updated_at.astimezone(UTC).isoformat(),
    )


def get_accessible_workspace(db: Session, user_id: str, workspace_id: str) -> tuple[Workspace, str]:
    row = db.execute(
        base_workspace_query_for_user(user_id).where(Workspace.id == workspace_id),
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )
    workspace, role = row
    return workspace, role


@router.get("", response_model=WorkspaceListResponse)
def list_workspaces(
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> WorkspaceListResponse:
    require_existing_user(user_id, db)
    rows = db.execute(
        base_workspace_query_for_user(user_id).order_by(Workspace.updated_at.desc(), Workspace.created_at.desc()),
    ).all()
    items = [to_workspace_summary(workspace, role) for workspace, role in rows]
    return WorkspaceListResponse(items=items, nextCursor=None)


@router.post("", response_model=CreateWorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: CreateWorkspaceRequest,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> CreateWorkspaceResponse:
    user = require_existing_user(user_id, db)
    now = datetime.now(UTC)
    workspace = Workspace(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        created_by_user_id=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(workspace)
    db.flush()

    membership = WorkspaceMembership(
        workspace_id=workspace.id,
        user_id=user.id,
        role="owner",
    )
    db.add(membership)
    db.commit()
    db.refresh(workspace)
    return CreateWorkspaceResponse(workspace=to_workspace_summary(workspace, membership.role))


@router.get("/{workspace_id}", response_model=WorkspaceDetailResponse)
def get_workspace(
    workspace_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> WorkspaceDetailResponse:
    require_existing_user(user_id, db)
    workspace, role = get_accessible_workspace(db, user_id, workspace_id)
    return WorkspaceDetailResponse(workspace=to_workspace_summary(workspace, role))


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_workspace(
    workspace_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> Response:
    require_existing_user(user_id, db)
    workspace, role = get_accessible_workspace(db, user_id, workspace_id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners can archive this workspace.",
        )

    now = datetime.now(UTC)
    workspace.archived_at = now
    workspace.updated_at = now
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
