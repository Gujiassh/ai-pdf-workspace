"""add message input evidence

Revision ID: d0e2f4a6b8c1
Revises: c9d1e2f3a4b5
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d0e2f4a6b8c1"
down_revision: Union[str, Sequence[str], None] = "c9d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "message_input_evidence",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("target_order", sa.Integer(), nullable=False),
        sa.Column("evidence_locator_id", sa.String(length=36), nullable=False),
        sa.Column("asset_id", sa.String(length=36), nullable=False),
        sa.Column("asset_kind_snapshot", sa.String(length=64), nullable=False),
        sa.Column("asset_title_snapshot", sa.String(length=255), nullable=False),
        sa.Column("excerpt_snapshot", sa.Text(), nullable=False),
        sa.Column("processing_generation_snapshot", sa.Integer(), nullable=False),
        sa.Column("representation_id_snapshot", sa.String(length=36), nullable=False),
        sa.Column("parser_version_snapshot", sa.String(length=64), nullable=False),
        sa.Column("index_version_snapshot", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.ForeignKeyConstraint(["evidence_locator_id"], ["evidence_locators.id"]),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("target_order >= 0", name="ck_message_input_evidence_target_order"),
        sa.UniqueConstraint("evidence_locator_id", name="uq_message_input_evidence_locator"),
        sa.UniqueConstraint("message_id", "target_order", name="uq_message_input_evidence_order"),
    )
    op.create_index(
        "ix_message_input_evidence_asset_id", "message_input_evidence", ["asset_id"]
    )
    op.create_index(
        "ix_message_input_evidence_evidence_locator_id",
        "message_input_evidence",
        ["evidence_locator_id"],
    )
    op.create_index(
        "ix_message_input_evidence_message_id", "message_input_evidence", ["message_id"]
    )
    op.create_index(
        "ix_message_input_evidence_message_order",
        "message_input_evidence",
        ["message_id", "target_order"],
    )
    op.create_index(
        "ix_message_input_evidence_workspace_id", "message_input_evidence", ["workspace_id"]
    )
    op.create_check_constraint(
        "ck_note_sources_source_order",
        "note_sources",
        "source_order >= 0",
    )
    op.create_unique_constraint(
        "uq_note_sources_note_order",
        "note_sources",
        ["note_id", "source_order"],
    )


def downgrade() -> None:
    raise RuntimeError("M304B message input Evidence migration is irreversible")
