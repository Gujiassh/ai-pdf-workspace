"""materialize the ContentUnit lexical search vector

Revision ID: e1f3a5c7d9b2
Revises: d0e2f4a6b8c1
Create Date: 2026-07-21
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects.postgresql import TSVECTOR
import sqlalchemy as sa


revision: str = "e1f3a5c7d9b2"
down_revision: Union[str, Sequence[str], None] = "d0e2f4a6b8c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_units",
        sa.Column(
            "search_vector",
            TSVECTOR(),
            sa.Computed("to_tsvector('simple'::regconfig, text_content)", persisted=True),
            nullable=True,
        ),
    )
    op.drop_index("ix_content_units_text_content_fts", table_name="content_units")
    op.create_index(
        "ix_content_units_text_content_fts",
        "content_units",
        ["search_vector"],
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("ix_content_units_text_content_fts", table_name="content_units")
    op.create_index(
        "ix_content_units_text_content_fts",
        "content_units",
        [sa.text("to_tsvector('simple', text_content)")],
        postgresql_using="gin",
    )
    op.drop_column("content_units", "search_vector")
