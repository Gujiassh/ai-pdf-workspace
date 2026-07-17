"""add lexical retrieval indexes

Revision ID: a8c9d0e1f2a3
Revises: f7b8c9d0e1f2
Create Date: 2026-07-16 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "a8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "f7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_chunk_text_trgm")
    op.execute(
        "CREATE INDEX ix_document_chunks_chunk_text_trgm_gist "
        "ON document_chunks USING gist (chunk_text gist_trgm_ops(siglen=64))"
    )
    op.execute(
        "CREATE INDEX ix_document_chunks_chunk_text_fts "
        "ON document_chunks USING gin (to_tsvector('simple', chunk_text))"
    )


def downgrade() -> None:
    op.drop_index("ix_document_chunks_chunk_text_fts", table_name="document_chunks")
    op.drop_index("ix_document_chunks_chunk_text_trgm_gist", table_name="document_chunks")
