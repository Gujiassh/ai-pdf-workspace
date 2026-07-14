from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ai_pdf_api.db.base import Base


class MessageCitation(Base):
    __tablename__ = "message_citations"
    __table_args__ = (Index("ix_message_citations_message_index", "message_id", "citation_index"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), index=True)
    message_id: Mapped[str] = mapped_column(String(36), ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True)
    citation_index: Mapped[int] = mapped_column(Integer)
    document_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    chunk_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("document_chunks.id", ondelete="SET NULL"), nullable=True
    )
    page_number_snapshot: Mapped[int] = mapped_column(Integer)
    document_title_snapshot: Mapped[str] = mapped_column(String(255))
    excerpt_snapshot: Mapped[str] = mapped_column(Text)
    index_version_snapshot: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
