"""add persisted workspace AI settings

Revision ID: f7b8c9d0e1f2
Revises: e6a7b8c9d0f1
Create Date: 2026-07-15 13:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "e6a7b8c9d0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_SYSTEM_PROMPT = (
    "You are an AI research assistant. Answer using only the supplied PDF context and cite supporting sources."
)


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column(
            "system_prompt",
            sa.Text(),
            nullable=False,
            server_default=sa.text(f"'{DEFAULT_SYSTEM_PROMPT}'"),
        ),
    )
    op.add_column(
        "workspaces",
        sa.Column("retrieval_top_k", sa.Integer(), nullable=False, server_default="6"),
    )
    op.add_column(
        "workspaces",
        sa.Column("chunk_size", sa.Integer(), nullable=False, server_default="1200"),
    )
    op.alter_column("workspaces", "system_prompt", server_default=None)
    op.alter_column("workspaces", "retrieval_top_k", server_default=None)
    op.alter_column("workspaces", "chunk_size", server_default=None)


def downgrade() -> None:
    op.drop_column("workspaces", "chunk_size")
    op.drop_column("workspaces", "retrieval_top_k")
    op.drop_column("workspaces", "system_prompt")
