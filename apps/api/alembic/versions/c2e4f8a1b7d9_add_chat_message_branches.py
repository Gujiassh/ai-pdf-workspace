"""add chat message branches

Revision ID: c2e4f8a1b7d9
Revises: b7a1d2e4c6f8
Create Date: 2026-07-15 00:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2e4f8a1b7d9"
down_revision: Union[str, Sequence[str], None] = "b7a1d2e4c6f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column("parent_message_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_chat_messages_parent_message_id",
        "chat_messages",
        "chat_messages",
        ["parent_message_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_chat_messages_parent_message_id",
        "chat_messages",
        ["parent_message_id"],
        unique=False,
    )

    op.add_column(
        "chat_threads",
        sa.Column("active_message_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_chat_threads_active_message_id",
        "chat_threads",
        "chat_messages",
        ["active_message_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Existing conversations were already stored in chronological order. Turn
    # that order into a deterministic parent chain before enabling branching.
    op.execute(
        sa.text(
            """
            WITH ordered AS (
                SELECT
                    id,
                    LAG(id) OVER (
                        PARTITION BY thread_id
                        ORDER BY
                            created_at,
                            CASE role
                                WHEN 'user' THEN 0
                                WHEN 'assistant' THEN 1
                                ELSE 2
                            END,
                            id
                    ) AS parent_id
                FROM chat_messages
            )
            UPDATE chat_messages AS message
            SET parent_message_id = ordered.parent_id
            FROM ordered
            WHERE message.id = ordered.id
            """
        )
    )
    op.execute(
        sa.text(
            """
            WITH latest AS (
                SELECT DISTINCT ON (thread_id) thread_id, id
                FROM chat_messages
                ORDER BY
                    thread_id,
                    created_at DESC,
                    CASE role
                        WHEN 'assistant' THEN 0
                        WHEN 'user' THEN 1
                        ELSE 2
                    END,
                    id DESC
            )
            UPDATE chat_threads AS thread
            SET active_message_id = latest.id
            FROM latest
            WHERE thread.id = latest.thread_id
            """
        )
    )


def downgrade() -> None:
    op.drop_constraint("fk_chat_threads_active_message_id", "chat_threads", type_="foreignkey")
    op.drop_column("chat_threads", "active_message_id")
    op.drop_index("ix_chat_messages_parent_message_id", table_name="chat_messages")
    op.drop_constraint("fk_chat_messages_parent_message_id", "chat_messages", type_="foreignkey")
    op.drop_column("chat_messages", "parent_message_id")
