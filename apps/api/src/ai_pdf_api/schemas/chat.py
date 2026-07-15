from pydantic import BaseModel, Field


class ThreadSummary(BaseModel):
    id: str
    workspaceId: str
    title: str | None
    lastMessageAt: str
    createdAt: str


class ThreadListResponse(BaseModel):
    items: list[ThreadSummary]
    nextCursor: str | None


class CreateThreadRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class CreateThreadResponse(BaseModel):
    thread: ThreadSummary


class Citation(BaseModel):
    id: str
    messageId: str
    citationIndex: int
    documentId: str | None
    documentTitle: str
    pageNumber: int
    chunkId: str | None
    excerpt: str


class Message(BaseModel):
    id: str
    workspaceId: str
    threadId: str
    parentMessageId: str | None
    role: str
    content: str
    status: str
    modelProvider: str | None
    modelName: str | None
    createdAt: str
    citations: list[Citation]


class ThreadMessagesResponse(BaseModel):
    thread: ThreadSummary
    messages: list[Message]


class ChatStreamRequest(BaseModel):
    threadId: str
    question: str = Field(min_length=1, max_length=12000)
    selectionText: str | None = Field(default=None, max_length=12000)
    parentMessageId: str | None = None
    editMessageId: str | None = None
