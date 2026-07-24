from pydantic import BaseModel, Field

from ai_pdf_api.schemas.chat import EvidenceLocatorDto, EvidenceTargetRequest, SourceVersions


class NoteSourceDto(BaseModel):
    id: str
    messageCitationId: str | None
    assetId: str
    assetKind: str
    assetTitle: str
    sourceAvailable: bool
    excerpt: str
    locator: EvidenceLocatorDto
    sourceVersions: SourceVersions
    createdAt: str


class NoteTagDto(BaseModel):
    id: str
    workspaceId: str
    name: str
    slug: str
    color: str | None
    createdAt: str


class NoteDto(BaseModel):
    id: str
    workspaceId: str
    title: str | None
    bodyMd: str
    isPinned: bool
    createdAt: str
    updatedAt: str
    sources: list[NoteSourceDto] = Field(default_factory=list)
    tagIds: list[str] = Field(default_factory=list)
    tags: list[NoteTagDto] = Field(default_factory=list)


class NoteListResponse(BaseModel):
    items: list[NoteDto]
    nextCursor: str | None


class CreateNoteRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    bodyMd: str = Field(min_length=1, max_length=200_000)
    sourceCitationIds: list[str] = Field(default_factory=list, max_length=100)
    evidenceTargets: list[EvidenceTargetRequest] = Field(default_factory=list, max_length=8)


class CreateNoteResponse(BaseModel):
    note: NoteDto
    sources: list[NoteSourceDto]


class UpdateNoteRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    bodyMd: str | None = Field(default=None, min_length=1, max_length=200_000)
    isPinned: bool | None = None


class NoteResponse(BaseModel):
    note: NoteDto


class CreateTagRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, min_length=1, max_length=128)
    color: str | None = Field(default=None, max_length=32)


class UpdateTagRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, min_length=1, max_length=128)
    color: str | None = Field(default=None, max_length=32)


class TagDto(BaseModel):
    id: str
    workspaceId: str
    name: str
    slug: str
    color: str | None
    createdAt: str
    assetIds: list[str] = Field(default_factory=list)
    noteIds: list[str] = Field(default_factory=list)


class TagListResponse(BaseModel):
    items: list[TagDto]
    nextCursor: str | None


class TagResponse(BaseModel):
    tag: TagDto


class TagBindingsRequest(BaseModel):
    tagIds: list[str] = Field(max_length=100)


class TagBindingsResponse(BaseModel):
    assetId: str | None = None
    noteId: str | None = None
    tagIds: list[str]
    tags: list[TagDto]
