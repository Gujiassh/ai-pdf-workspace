"""persist OCR text layer blocks

Revision ID: d5f6a7b8c9e0
Revises: c2e4f8a1b7d9
Create Date: 2026-07-15 00:45:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5f6a7b8c9e0"
down_revision: Union[str, Sequence[str], None] = "c2e4f8a1b7d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "document_pages",
        sa.Column(
            "ocr_blocks",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
    op.alter_column("document_pages", "ocr_blocks", server_default=None)


def downgrade() -> None:
    op.drop_column("document_pages", "ocr_blocks")
