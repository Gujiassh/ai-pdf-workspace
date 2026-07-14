"""add pgvector embeddings and chat persistence

Revision ID: f4d9c0e7a2b1
Revises: d7f3aab48fe1
Create Date: 2026-07-14 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


revision: str = "f4d9c0e7a2b1"
down_revision: Union[str, Sequence[str], None] = "d7f3aab48fe1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.add_column("document_chunks", sa.Column("embedding", Vector(1024), nullable=True))
    op.add_column("document_chunks", sa.Column("embedding_dimensions", sa.Integer(), nullable=True))
    op.add_column("document_chunks", sa.Column("embedding_provider", sa.String(length=64), nullable=True))
    op.add_column("document_chunks", sa.Column("embedding_model", sa.String(length=128), nullable=True))
    op.add_column("document_chunks", sa.Column("embedding_version", sa.String(length=64), nullable=True))
    op.create_index(
        "ix_document_chunks_embedding_hnsw",
        "document_chunks",
        ["embedding"],
        unique=False,
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    op.create_table(
        "chat_threads",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_threads_workspace_id", "chat_threads", ["workspace_id"], unique=False)
    op.create_index("ix_chat_threads_created_by_user_id", "chat_threads", ["created_by_user_id"], unique=False)
    op.create_index(
        "ix_chat_threads_workspace_last_message",
        "chat_threads",
        ["workspace_id", "last_message_at"],
        unique=False,
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("model_provider", sa.String(length=64), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=True),
        sa.Column("prompt_version_id", sa.String(length=36), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["chat_threads.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_messages_workspace_id", "chat_messages", ["workspace_id"], unique=False)
    op.create_index("ix_chat_messages_thread_id", "chat_messages", ["thread_id"], unique=False)
    op.create_index("ix_chat_messages_thread_created", "chat_messages", ["thread_id", "created_at"], unique=False)
    op.create_index(
        "ix_chat_messages_workspace_created", "chat_messages", ["workspace_id", "created_at"], unique=False
    )

    op.create_table(
        "message_citations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("citation_index", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=True),
        sa.Column("chunk_id", sa.String(length=36), nullable=True),
        sa.Column("page_number_snapshot", sa.Integer(), nullable=False),
        sa.Column("document_title_snapshot", sa.String(length=255), nullable=False),
        sa.Column("excerpt_snapshot", sa.Text(), nullable=False),
        sa.Column("index_version_snapshot", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["chunk_id"], ["document_chunks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_message_citations_workspace_id", "message_citations", ["workspace_id"], unique=False)
    op.create_index("ix_message_citations_message_id", "message_citations", ["message_id"], unique=False)
    op.create_index(
        "ix_message_citations_message_index", "message_citations", ["message_id", "citation_index"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_message_citations_message_index", table_name="message_citations")
    op.drop_index("ix_message_citations_message_id", table_name="message_citations")
    op.drop_index("ix_message_citations_workspace_id", table_name="message_citations")
    op.drop_table("message_citations")

    op.drop_index("ix_chat_messages_workspace_created", table_name="chat_messages")
    op.drop_index("ix_chat_messages_thread_created", table_name="chat_messages")
    op.drop_index("ix_chat_messages_thread_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_workspace_id", table_name="chat_messages")
    op.drop_table("chat_messages")

    op.drop_index("ix_chat_threads_workspace_last_message", table_name="chat_threads")
    op.drop_index("ix_chat_threads_created_by_user_id", table_name="chat_threads")
    op.drop_index("ix_chat_threads_workspace_id", table_name="chat_threads")
    op.drop_table("chat_threads")

    op.drop_index("ix_document_chunks_embedding_hnsw", table_name="document_chunks")
    op.drop_column("document_chunks", "embedding_version")
    op.drop_column("document_chunks", "embedding_model")
    op.drop_column("document_chunks", "embedding_provider")
    op.drop_column("document_chunks", "embedding_dimensions")
    op.drop_column("document_chunks", "embedding")
