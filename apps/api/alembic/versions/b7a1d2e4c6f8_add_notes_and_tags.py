"""add notes, tags, and binding tables

Revision ID: b7a1d2e4c6f8
Revises: f4d9c0e7a2b1
Create Date: 2026-07-14 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7a1d2e4c6f8"
down_revision: Union[str, Sequence[str], None] = "f4d9c0e7a2b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("updated_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("body_md", sa.Text(), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notes_workspace_id", "notes", ["workspace_id"], unique=False)
    op.create_index("ix_notes_created_by_user_id", "notes", ["created_by_user_id"], unique=False)
    op.create_index("ix_notes_updated_by_user_id", "notes", ["updated_by_user_id"], unique=False)
    op.create_index("ix_notes_workspace_updated", "notes", ["workspace_id", "updated_at"], unique=False)

    op.create_table(
        "tags",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=128), nullable=False),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "slug", name="uq_tags_workspace_slug"),
    )
    op.create_index("ix_tags_workspace_id", "tags", ["workspace_id"], unique=False)
    op.create_index("ix_tags_created_by_user_id", "tags", ["created_by_user_id"], unique=False)
    op.create_index("ix_tags_workspace_name", "tags", ["workspace_id", "name"], unique=False)

    op.create_table(
        "document_tags",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("tag_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "tag_id", name="uq_document_tags_document_tag"),
    )
    op.create_index("ix_document_tags_workspace_id", "document_tags", ["workspace_id"], unique=False)
    op.create_index("ix_document_tags_document_id", "document_tags", ["document_id"], unique=False)
    op.create_index("ix_document_tags_tag_id", "document_tags", ["tag_id"], unique=False)

    op.create_table(
        "note_sources",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("note_id", sa.String(length=36), nullable=False),
        sa.Column("source_order", sa.Integer(), nullable=False),
        sa.Column("message_citation_id", sa.String(length=36), nullable=True),
        sa.Column("document_id", sa.String(length=36), nullable=True),
        sa.Column("page_number_snapshot", sa.Integer(), nullable=True),
        sa.Column("document_title_snapshot", sa.String(length=255), nullable=True),
        sa.Column("excerpt_snapshot", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["message_citation_id"], ["message_citations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("note_id", "message_citation_id", name="uq_note_sources_note_citation"),
    )
    op.create_index("ix_note_sources_workspace_id", "note_sources", ["workspace_id"], unique=False)
    op.create_index("ix_note_sources_note_id", "note_sources", ["note_id"], unique=False)
    op.create_index("ix_note_sources_message_citation_id", "note_sources", ["message_citation_id"], unique=False)
    op.create_index("ix_note_sources_document_id", "note_sources", ["document_id"], unique=False)
    op.create_index("ix_note_sources_note_order", "note_sources", ["note_id", "source_order"], unique=False)

    op.create_table(
        "note_tags",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("note_id", sa.String(length=36), nullable=False),
        sa.Column("tag_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("note_id", "tag_id", name="uq_note_tags_note_tag"),
    )
    op.create_index("ix_note_tags_workspace_id", "note_tags", ["workspace_id"], unique=False)
    op.create_index("ix_note_tags_note_id", "note_tags", ["note_id"], unique=False)
    op.create_index("ix_note_tags_tag_id", "note_tags", ["tag_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_note_tags_tag_id", table_name="note_tags")
    op.drop_index("ix_note_tags_note_id", table_name="note_tags")
    op.drop_index("ix_note_tags_workspace_id", table_name="note_tags")
    op.drop_table("note_tags")

    op.drop_index("ix_note_sources_note_order", table_name="note_sources")
    op.drop_index("ix_note_sources_document_id", table_name="note_sources")
    op.drop_index("ix_note_sources_message_citation_id", table_name="note_sources")
    op.drop_index("ix_note_sources_note_id", table_name="note_sources")
    op.drop_index("ix_note_sources_workspace_id", table_name="note_sources")
    op.drop_table("note_sources")

    op.drop_index("ix_document_tags_tag_id", table_name="document_tags")
    op.drop_index("ix_document_tags_document_id", table_name="document_tags")
    op.drop_index("ix_document_tags_workspace_id", table_name="document_tags")
    op.drop_table("document_tags")

    op.drop_index("ix_tags_workspace_name", table_name="tags")
    op.drop_index("ix_tags_created_by_user_id", table_name="tags")
    op.drop_index("ix_tags_workspace_id", table_name="tags")
    op.drop_table("tags")

    op.drop_index("ix_notes_workspace_updated", table_name="notes")
    op.drop_index("ix_notes_updated_by_user_id", table_name="notes")
    op.drop_index("ix_notes_created_by_user_id", table_name="notes")
    op.drop_index("ix_notes_workspace_id", table_name="notes")
    op.drop_table("notes")
