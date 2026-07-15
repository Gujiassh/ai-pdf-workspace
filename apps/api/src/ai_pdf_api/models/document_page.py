from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ai_pdf_api.db.base import Base


class DocumentPage(Base):
    __tablename__ = "document_pages"
    __table_args__ = (UniqueConstraint("document_id", "page_number", name="uq_document_pages_document_page"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(String(36), ForeignKey("workspaces.id"), index=True)
    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), index=True)
    page_number: Mapped[int] = mapped_column(Integer)
    extracted_text: Mapped[str] = mapped_column(Text)
    char_count: Mapped[int] = mapped_column(Integer)
    ocr_blocks: Mapped[list[dict[str, object]]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
