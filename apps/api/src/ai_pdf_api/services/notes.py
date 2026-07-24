from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ai_pdf_api.models import (
    Asset,
    AssetTag,
    ChatMessage,
    ChatThread,
    MessageCitation,
    Note,
    NoteSource,
    NoteTag,
    Tag,
)
from ai_pdf_api.modalities.evidence import (
    EvidenceContractError,
    clone_evidence_locator,
    serialize_evidence_locator,
)
from ai_pdf_api.services.evidence_targets import EvidenceTargetError, resolve_evidence_targets
from ai_pdf_api.schemas.notes import (
    CreateNoteRequest,
    CreateNoteResponse,
    CreateTagRequest,
    NoteDto,
    NoteListResponse,
    NoteResponse,
    NoteSourceDto,
    NoteTagDto,
    TagBindingsResponse,
    TagDto,
    TagListResponse,
    TagResponse,
    UpdateNoteRequest,
    UpdateTagRequest,
)
from ai_pdf_api.schemas.chat import SourceVersions


class NotesError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def _normalize_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise NotesError("name_required", "Name must not be empty.", 422)
    return normalized


def _normalize_slug(value: str) -> str:
    normalized = re.sub(r"\s+", "-", value.strip().lower()).strip("-")
    if not normalized:
        raise NotesError("slug_required", "Slug must not be empty.", 422)
    return normalized


def _slug_from_name(name: str) -> str:
    slug = re.sub(r"\s+", "-", name.strip().lower()).strip("-")
    return slug or f"tag-{uuid4().hex[:12]}"


def _unique_ids(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        if not normalized:
            raise NotesError("id_required", "IDs must not be empty.", 422)
        if normalized not in seen:
            result.append(normalized)
            seen.add(normalized)
    return result


def _get_note(db: Session, workspace_id: str, note_id: str) -> Note:
    note = db.scalar(
        select(Note).where(
            Note.id == note_id,
            Note.workspace_id == workspace_id,
            Note.archived_at.is_(None),
        )
    )
    if note is None:
        raise NotesError("note_not_found", "Note not found.", 404)
    return note


def _get_tag(db: Session, workspace_id: str, tag_id: str) -> Tag:
    tag = db.scalar(select(Tag).where(Tag.id == tag_id, Tag.workspace_id == workspace_id))
    if tag is None:
        raise NotesError("tag_not_found", "Tag not found.", 404)
    return tag


def _get_asset(db: Session, workspace_id: str, asset_id: str) -> Asset:
    asset = db.scalar(
        select(Asset).where(
            Asset.id == asset_id,
            Asset.workspace_id == workspace_id,
            Asset.deleted_at.is_(None),
        )
    )
    if asset is None:
        raise NotesError("asset_not_found", "Asset not found.", 404)
    return asset


def _to_source_dto_with_db(db: Session, source: NoteSource) -> NoteSourceDto:
    asset = db.get(Asset, source.asset_id)
    return NoteSourceDto(
        id=source.id,
        messageCitationId=source.message_citation_id,
        assetId=source.asset_id,
        assetKind=source.asset_kind_snapshot,
        assetTitle=source.asset_title_snapshot,
        sourceAvailable=asset is not None and asset.deleted_at is None,
        excerpt=source.excerpt_snapshot,
        locator=serialize_evidence_locator(
            db,
            source.evidence_locator_id,
            workspace_id=source.workspace_id,
            asset_id=source.asset_id,
            processing_generation=source.processing_generation_snapshot,
            representation_id=source.representation_id_snapshot,
        ),
        sourceVersions=SourceVersions(
            parserVersion=source.parser_version_snapshot,
            processingGeneration=source.processing_generation_snapshot,
            representationId=source.representation_id_snapshot,
            indexVersion=source.index_version_snapshot,
        ),
        createdAt=_iso(source.created_at),
    )


def _to_note_tag_dto(tag: Tag) -> NoteTagDto:
    return NoteTagDto(
        id=tag.id,
        workspaceId=tag.workspace_id,
        name=tag.name,
        slug=tag.slug,
        color=tag.color,
        createdAt=_iso(tag.created_at),
    )


def _load_note_relations(
    db: Session,
    workspace_id: str,
    note_ids: list[str],
) -> tuple[dict[str, list[NoteSource]], dict[str, list[Tag]]]:
    sources_by_note: dict[str, list[NoteSource]] = defaultdict(list)
    tags_by_note: dict[str, list[Tag]] = defaultdict(list)
    if not note_ids:
        return sources_by_note, tags_by_note

    sources = db.scalars(
        select(NoteSource)
        .where(NoteSource.workspace_id == workspace_id, NoteSource.note_id.in_(note_ids))
        .order_by(NoteSource.note_id, NoteSource.source_order, NoteSource.id)
    ).all()
    for source in sources:
        sources_by_note[source.note_id].append(source)

    tag_rows = db.execute(
        select(NoteTag, Tag)
        .join(Tag, Tag.id == NoteTag.tag_id)
        .where(
            NoteTag.workspace_id == workspace_id,
            NoteTag.note_id.in_(note_ids),
            Tag.workspace_id == workspace_id,
        )
        .order_by(NoteTag.note_id, NoteTag.created_at, NoteTag.id)
    ).all()
    for relation, tag in tag_rows:
        tags_by_note[relation.note_id].append(tag)
    return sources_by_note, tags_by_note


def _to_note_dtos(db: Session, workspace_id: str, notes: list[Note]) -> list[NoteDto]:
    sources_by_note, tags_by_note = _load_note_relations(db, workspace_id, [note.id for note in notes])
    return [
        NoteDto(
            id=note.id,
            workspaceId=note.workspace_id,
            title=note.title,
            bodyMd=note.body_md,
            isPinned=note.is_pinned,
            createdAt=_iso(note.created_at),
            updatedAt=_iso(note.updated_at),
            sources=[_to_source_dto_with_db(db, source) for source in sources_by_note.get(note.id, [])],
            tagIds=[tag.id for tag in tags_by_note.get(note.id, [])],
            tags=[_to_note_tag_dto(tag) for tag in tags_by_note.get(note.id, [])],
        )
        for note in notes
    ]


def _to_tag_dtos(db: Session, workspace_id: str, tags: list[Tag]) -> list[TagDto]:
    asset_ids_by_tag: dict[str, list[str]] = defaultdict(list)
    note_ids_by_tag: dict[str, list[str]] = defaultdict(list)
    tag_ids = [tag.id for tag in tags]
    if tag_ids:
        asset_rows = db.execute(
            select(AssetTag.tag_id, AssetTag.asset_id)
            .join(Asset, Asset.id == AssetTag.asset_id)
            .where(
                AssetTag.workspace_id == workspace_id,
                AssetTag.tag_id.in_(tag_ids),
                Asset.workspace_id == workspace_id,
                Asset.deleted_at.is_(None),
            )
            .order_by(AssetTag.tag_id, AssetTag.created_at, AssetTag.id)
        ).all()
        for tag_id, asset_id in asset_rows:
            asset_ids_by_tag[tag_id].append(asset_id)

        note_rows = db.execute(
            select(NoteTag.tag_id, NoteTag.note_id)
            .join(Note, Note.id == NoteTag.note_id)
            .where(
                NoteTag.workspace_id == workspace_id,
                NoteTag.tag_id.in_(tag_ids),
                Note.workspace_id == workspace_id,
                Note.archived_at.is_(None),
            )
            .order_by(NoteTag.tag_id, NoteTag.created_at, NoteTag.id)
        ).all()
        for tag_id, note_id in note_rows:
            note_ids_by_tag[tag_id].append(note_id)

    return [
        TagDto(
            id=tag.id,
            workspaceId=tag.workspace_id,
            name=tag.name,
            slug=tag.slug,
            color=tag.color,
            createdAt=_iso(tag.created_at),
            assetIds=asset_ids_by_tag.get(tag.id, []),
            noteIds=note_ids_by_tag.get(tag.id, []),
        )
        for tag in tags
    ]


def _binding_response(
    db: Session,
    workspace_id: str,
    *,
    asset_id: str | None = None,
    note_id: str | None = None,
    tag_ids: list[str],
) -> TagBindingsResponse:
    tags = (
        db.scalars(
            select(Tag).where(Tag.workspace_id == workspace_id, Tag.id.in_(tag_ids)).order_by(Tag.created_at, Tag.id)
        ).all()
        if tag_ids
        else []
    )
    tags_by_id = {tag.id: tag for tag in tags}
    ordered_tags = [tags_by_id[tag_id] for tag_id in tag_ids]
    return TagBindingsResponse(
        assetId=asset_id,
        noteId=note_id,
        tagIds=tag_ids,
        tags=_to_tag_dtos(db, workspace_id, ordered_tags),
    )


def list_notes(db: Session, workspace_id: str) -> NoteListResponse:
    notes = db.scalars(
        select(Note)
        .where(Note.workspace_id == workspace_id, Note.archived_at.is_(None))
        .order_by(Note.is_pinned.desc(), Note.updated_at.desc(), Note.created_at.desc())
    ).all()
    return NoteListResponse(items=_to_note_dtos(db, workspace_id, notes), nextCursor=None)


def get_note(db: Session, workspace_id: str, note_id: str) -> NoteResponse:
    note = _get_note(db, workspace_id, note_id)
    return NoteResponse(note=_to_note_dtos(db, workspace_id, [note])[0])


def _find_citations(db: Session, workspace_id: str, citation_ids: list[str]) -> dict[str, MessageCitation]:
    if not citation_ids:
        return {}
    rows = db.execute(
        select(MessageCitation, ChatMessage, ChatThread)
        .join(ChatMessage, ChatMessage.id == MessageCitation.message_id)
        .join(ChatThread, ChatThread.id == ChatMessage.thread_id)
        .where(
            MessageCitation.id.in_(citation_ids),
            MessageCitation.workspace_id == workspace_id,
            ChatMessage.workspace_id == workspace_id,
            ChatThread.workspace_id == workspace_id,
        )
    ).all()
    citations = {citation.id: citation for citation, _message, _thread in rows}
    if len(citations) != len(citation_ids):
        raise NotesError("citation_not_found", "One or more citations were not found in this workspace.", 404)
    return citations


def create_note(
    db: Session,
    workspace_id: str,
    user_id: str,
    payload: CreateNoteRequest,
) -> CreateNoteResponse:
    citation_ids = _unique_ids(payload.sourceCitationIds)
    try:
        citations = _find_citations(db, workspace_id, citation_ids)
        now = _now()
        resolved_targets = resolve_evidence_targets(
            db,
            workspace_id=workspace_id,
            targets=payload.evidenceTargets,
            created_at=now,
            include_image_payloads=False,
        )
        note = Note(
            workspace_id=workspace_id,
            created_by_user_id=user_id,
            updated_by_user_id=user_id,
            title=payload.title.strip() if payload.title and payload.title.strip() else None,
            body_md=payload.bodyMd,
            is_pinned=False,
            created_at=now,
            updated_at=now,
        )
        db.add(note)
        db.flush()
        sources: list[NoteSource] = []
        for index, citation_id in enumerate(citation_ids):
            citation = citations[citation_id]
            locator = clone_evidence_locator(
                db,
                citation.evidence_locator_id,
                created_at=now,
                workspace_id=citation.workspace_id,
                asset_id=citation.asset_id,
                processing_generation=citation.processing_generation_snapshot,
                representation_id=citation.representation_id_snapshot,
            )
            sources.append(
                NoteSource(
                    workspace_id=workspace_id,
                    note_id=note.id,
                    source_order=index,
                    message_citation_id=citation_id,
                    evidence_locator_id=locator.id,
                    asset_id=citation.asset_id,
                    asset_kind_snapshot=citation.asset_kind_snapshot,
                    asset_title_snapshot=citation.asset_title_snapshot,
                    excerpt_snapshot=citation.excerpt_snapshot,
                    processing_generation_snapshot=citation.processing_generation_snapshot,
                    representation_id_snapshot=citation.representation_id_snapshot,
                    parser_version_snapshot=citation.parser_version_snapshot,
                    index_version_snapshot=citation.index_version_snapshot,
                    created_at=now,
                )
            )
        source_offset = len(sources)
        for index, target in enumerate(resolved_targets):
            sources.append(
                NoteSource(
                    workspace_id=workspace_id,
                    note_id=note.id,
                    source_order=source_offset + index,
                    message_citation_id=None,
                    evidence_locator_id=target.locator.id,
                    asset_id=target.asset.id,
                    asset_kind_snapshot=target.asset.asset_kind,
                    asset_title_snapshot=target.asset.title,
                    excerpt_snapshot=target.excerpt,
                    processing_generation_snapshot=target.locator.processing_generation_snapshot,
                    representation_id_snapshot=target.locator.representation_id_snapshot,
                    parser_version_snapshot=target.representation.generator_version,
                    index_version_snapshot=target.asset.current_index_version,
                    created_at=now,
                )
            )
        db.add_all(sources)
        db.commit()
        db.refresh(note)
        note_dto = _to_note_dtos(db, workspace_id, [note])[0]
        return CreateNoteResponse(note=note_dto, sources=note_dto.sources)
    except NotesError:
        db.rollback()
        raise
    except EvidenceContractError as error:
        db.rollback()
        raise NotesError(
            "evidence_contract_invalid",
            "A citation contains invalid evidence.",
            500,
        ) from error
    except EvidenceTargetError as error:
        db.rollback()
        raise NotesError(error.code, error.message, error.status_code) from error
    except IntegrityError as error:
        db.rollback()
        raise NotesError("note_create_failed", "Note could not be created.", 409) from error


def update_note(
    db: Session,
    workspace_id: str,
    note_id: str,
    user_id: str,
    payload: UpdateNoteRequest,
) -> NoteResponse:
    try:
        note = _get_note(db, workspace_id, note_id)
        fields = payload.model_fields_set
        if "title" in fields:
            note.title = payload.title.strip() if payload.title and payload.title.strip() else None
        if "bodyMd" in fields and payload.bodyMd is not None:
            note.body_md = payload.bodyMd
        if "isPinned" in fields and payload.isPinned is not None:
            note.is_pinned = payload.isPinned
        note.updated_by_user_id = user_id
        note.updated_at = _now()
        db.commit()
        db.refresh(note)
        return NoteResponse(note=_to_note_dtos(db, workspace_id, [note])[0])
    except NotesError:
        db.rollback()
        raise


def archive_note(db: Session, workspace_id: str, note_id: str) -> None:
    try:
        note = _get_note(db, workspace_id, note_id)
        now = _now()
        note.archived_at = now
        note.updated_at = now
        db.commit()
    except NotesError:
        db.rollback()
        raise


def list_tags(db: Session, workspace_id: str) -> TagListResponse:
    tags = db.scalars(select(Tag).where(Tag.workspace_id == workspace_id).order_by(Tag.created_at, Tag.id)).all()
    return TagListResponse(items=_to_tag_dtos(db, workspace_id, tags), nextCursor=None)


def get_tag(db: Session, workspace_id: str, tag_id: str) -> TagResponse:
    tag = _get_tag(db, workspace_id, tag_id)
    return TagResponse(tag=_to_tag_dtos(db, workspace_id, [tag])[0])


def create_tag(
    db: Session,
    workspace_id: str,
    user_id: str,
    payload: CreateTagRequest,
) -> TagResponse:
    name = _normalize_name(payload.name)
    slug = _normalize_slug(payload.slug) if payload.slug is not None else _slug_from_name(name)
    try:
        if db.scalar(select(Tag.id).where(Tag.workspace_id == workspace_id, Tag.slug == slug)) is not None:
            raise NotesError("tag_slug_conflict", "A tag with this slug already exists in the workspace.", 409)
        tag = Tag(
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            color=payload.color.strip() if payload.color and payload.color.strip() else None,
            created_by_user_id=user_id,
            created_at=_now(),
        )
        db.add(tag)
        db.commit()
        db.refresh(tag)
        return TagResponse(tag=_to_tag_dtos(db, workspace_id, [tag])[0])
    except NotesError:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        raise NotesError("tag_slug_conflict", "A tag with this slug already exists in the workspace.", 409) from error


def update_tag(
    db: Session,
    workspace_id: str,
    tag_id: str,
    payload: UpdateTagRequest,
) -> TagResponse:
    try:
        tag = _get_tag(db, workspace_id, tag_id)
        fields = payload.model_fields_set
        if "name" in fields and payload.name is not None:
            tag.name = _normalize_name(payload.name)
        if "slug" in fields and payload.slug is not None:
            next_slug = _normalize_slug(payload.slug)
            if db.scalar(
                select(Tag.id).where(
                    Tag.workspace_id == workspace_id,
                    Tag.slug == next_slug,
                    Tag.id != tag.id,
                )
            ) is not None:
                raise NotesError("tag_slug_conflict", "A tag with this slug already exists in the workspace.", 409)
            tag.slug = next_slug
        if "color" in fields:
            tag.color = payload.color.strip() if payload.color and payload.color.strip() else None
        db.commit()
        db.refresh(tag)
        return TagResponse(tag=_to_tag_dtos(db, workspace_id, [tag])[0])
    except NotesError:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        raise NotesError("tag_slug_conflict", "A tag with this slug already exists in the workspace.", 409) from error


def delete_tag(db: Session, workspace_id: str, tag_id: str) -> None:
    try:
        tag = _get_tag(db, workspace_id, tag_id)
        db.execute(delete(AssetTag).where(AssetTag.workspace_id == workspace_id, AssetTag.tag_id == tag.id))
        db.execute(delete(NoteTag).where(NoteTag.workspace_id == workspace_id, NoteTag.tag_id == tag.id))
        db.delete(tag)
        db.commit()
    except NotesError:
        db.rollback()
        raise


def _validate_tag_ids(db: Session, workspace_id: str, tag_ids: list[str]) -> list[str]:
    normalized_ids = _unique_ids(tag_ids)
    if not normalized_ids:
        return []
    tags = db.scalars(select(Tag.id).where(Tag.workspace_id == workspace_id, Tag.id.in_(normalized_ids))).all()
    if len(tags) != len(normalized_ids):
        raise NotesError("tag_not_found", "One or more tags were not found in this workspace.", 404)
    return normalized_ids


def replace_asset_tags(
    db: Session,
    workspace_id: str,
    asset_id: str,
    tag_ids: list[str],
) -> TagBindingsResponse:
    try:
        asset = _get_asset(db, workspace_id, asset_id)
        normalized_ids = _validate_tag_ids(db, workspace_id, tag_ids)
        db.execute(
            delete(AssetTag).where(
                AssetTag.workspace_id == workspace_id,
                AssetTag.asset_id == asset.id,
            )
        )
        now = _now()
        db.add_all(
            [
                AssetTag(
                    workspace_id=workspace_id,
                    asset_id=asset.id,
                    tag_id=tag_id,
                    created_at=now,
                )
                for tag_id in normalized_ids
            ]
        )
        db.commit()
        return _binding_response(db, workspace_id, asset_id=asset.id, tag_ids=normalized_ids)
    except NotesError:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        raise NotesError("asset_tags_update_failed", "Asset tags could not be updated.", 409) from error


def replace_note_tags(
    db: Session,
    workspace_id: str,
    note_id: str,
    tag_ids: list[str],
) -> TagBindingsResponse:
    try:
        note = _get_note(db, workspace_id, note_id)
        normalized_ids = _validate_tag_ids(db, workspace_id, tag_ids)
        db.execute(
            delete(NoteTag).where(
                NoteTag.workspace_id == workspace_id,
                NoteTag.note_id == note.id,
            )
        )
        now = _now()
        db.add_all(
            [
                NoteTag(
                    workspace_id=workspace_id,
                    note_id=note.id,
                    tag_id=tag_id,
                    created_at=now,
                )
                for tag_id in normalized_ids
            ]
        )
        db.commit()
        return _binding_response(db, workspace_id, note_id=note.id, tag_ids=normalized_ids)
    except NotesError:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        raise NotesError("note_tags_update_failed", "Note tags could not be updated.", 409) from error
