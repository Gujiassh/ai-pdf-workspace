from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ai_pdf_api.db.base import Base


class NoteSource(Base):
    __tablename__ = "note_sources"
    __table_args__ = (
        UniqueConstraint("note_id", "message_citation_id", name="uq_note_sources_note_citation"),
        Index("ix_note_sources_note_order", "note_id", "source_order"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), index=True)
    note_id: Mapped[str] = mapped_column(String(36), ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    source_order: Mapped[int] = mapped_column(Integer)
    message_citation_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("message_citations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    document_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    page_number_snapshot: Mapped[int | None] = mapped_column(Integer, nullable=True)
    document_title_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    excerpt_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
