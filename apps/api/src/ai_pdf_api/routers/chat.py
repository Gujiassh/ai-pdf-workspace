from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import ChatMessage, ChatThread, MessageCitation
from ai_pdf_api.routers.deps import get_accessible_workspace, require_user_id
from ai_pdf_api.schemas.chat import (
    ChatStreamRequest,
    Citation,
    CreateThreadRequest,
    CreateThreadResponse,
    Message,
    ThreadListResponse,
    ThreadMessagesResponse,
    ThreadSummary,
)
from ai_pdf_api.services.chat import ChatError, complete_chat

router = APIRouter(prefix="/v1/workspaces/{workspace_id}", tags=["chat"])


def to_thread_summary(thread: ChatThread) -> ThreadSummary:
    return ThreadSummary(
        id=thread.id,
        workspaceId=thread.workspace_id,
        title=thread.title,
        lastMessageAt=thread.last_message_at.astimezone(UTC).isoformat(),
        createdAt=thread.created_at.astimezone(UTC).isoformat(),
    )


def to_citation(citation: MessageCitation) -> Citation:
    return Citation(
        id=citation.id,
        messageId=citation.message_id,
        citationIndex=citation.citation_index,
        documentId=citation.document_id,
        documentTitle=citation.document_title_snapshot,
        pageNumber=citation.page_number_snapshot,
        chunkId=citation.chunk_id,
        excerpt=citation.excerpt_snapshot,
    )


def to_message(message: ChatMessage, citations: list[MessageCitation]) -> Message:
    return Message(
        id=message.id,
        workspaceId=message.workspace_id,
        threadId=message.thread_id,
        role=message.role,
        content=message.content,
        status=message.status,
        modelProvider=message.model_provider,
        modelName=message.model_name,
        createdAt=message.created_at.astimezone(UTC).isoformat(),
        citations=[to_citation(citation) for citation in citations],
    )


def get_workspace_thread(db: Session, workspace_id: str, thread_id: str) -> ChatThread:
    thread = db.scalar(
        select(ChatThread).where(
            ChatThread.id == thread_id,
            ChatThread.workspace_id == workspace_id,
            ChatThread.archived_at.is_(None),
        )
    )
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return thread


@router.get("/threads", response_model=ThreadListResponse)
def list_threads(
    workspace_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> ThreadListResponse:
    get_accessible_workspace(db, user_id, workspace_id)
    threads = db.scalars(
        select(ChatThread)
        .where(ChatThread.workspace_id == workspace_id, ChatThread.archived_at.is_(None))
        .order_by(ChatThread.last_message_at.desc(), ChatThread.created_at.desc())
    ).all()
    return ThreadListResponse(items=[to_thread_summary(thread) for thread in threads], nextCursor=None)


@router.post("/threads", response_model=CreateThreadResponse, status_code=status.HTTP_201_CREATED)
def create_thread(
    workspace_id: str,
    payload: CreateThreadRequest,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> CreateThreadResponse:
    get_accessible_workspace(db, user_id, workspace_id)
    now = datetime.now(UTC)
    thread = ChatThread(
        workspace_id=workspace_id,
        created_by_user_id=user_id,
        title=payload.title.strip() if payload.title and payload.title.strip() else None,
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return CreateThreadResponse(thread=to_thread_summary(thread))


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_thread(
    workspace_id: str,
    thread_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
):
    _workspace, role = get_accessible_workspace(db, user_id, workspace_id)
    thread = get_workspace_thread(db, workspace_id, thread_id)
    if role != "owner" and thread.created_by_user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot archive this thread.")
    thread.archived_at = datetime.now(UTC)
    thread.updated_at = thread.archived_at
    db.commit()
    return None


@router.get("/threads/{thread_id}/messages", response_model=ThreadMessagesResponse)
def list_thread_messages(
    workspace_id: str,
    thread_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> ThreadMessagesResponse:
    get_accessible_workspace(db, user_id, workspace_id)
    thread = get_workspace_thread(db, workspace_id, thread_id)
    messages = db.scalars(
        select(ChatMessage).where(ChatMessage.thread_id == thread.id).order_by(ChatMessage.created_at, ChatMessage.id)
    ).all()
    citations = db.scalars(
        select(MessageCitation)
        .where(MessageCitation.message_id.in_([message.id for message in messages]))
        .order_by(MessageCitation.message_id, MessageCitation.citation_index)
    ).all() if messages else []
    citation_by_message: dict[str, list[MessageCitation]] = {}
    for citation in citations:
        citation_by_message.setdefault(citation.message_id, []).append(citation)
    return ThreadMessagesResponse(
        thread=to_thread_summary(thread),
        messages=[to_message(message, citation_by_message.get(message.id, [])) for message in messages],
    )


@router.post("/chat/stream")
def stream_chat(
    workspace_id: str,
    payload: ChatStreamRequest,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    get_accessible_workspace(db, user_id, workspace_id)
    thread = get_workspace_thread(db, workspace_id, payload.threadId)
    try:
        result = complete_chat(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            thread=thread,
            question=payload.question,
            selection_text=payload.selectionText,
        )
    except ChatError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    citations = [to_citation(citation).model_dump() for citation in result.citations]

    def events():
        yield _sse("meta", {"threadId": thread.id, "userMessageId": result.user_message.id, "assistantMessageId": result.assistant_message.id})
        answer = result.assistant_message.content
        for start in range(0, len(answer), 48):
            yield _sse("delta", {"text": answer[start : start + 48]})
        yield _sse("citations", {"items": citations})
        yield _sse("done", {"threadId": thread.id, "assistantMessageId": result.assistant_message.id})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
