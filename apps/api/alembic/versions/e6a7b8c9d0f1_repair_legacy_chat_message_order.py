"""repair legacy chat message order

Revision ID: e6a7b8c9d0f1
Revises: d5f6a7b8c9e0
Create Date: 2026-07-15 11:58:00.000000

"""

from collections import defaultdict
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6a7b8c9d0f1"
down_revision: Union[str, Sequence[str], None] = "d5f6a7b8c9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT id, thread_id, role, status, created_at
            FROM chat_messages
            ORDER BY thread_id, created_at, id
            """
        )
    ).mappings().all()

    messages_by_thread: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        messages_by_thread[row["thread_id"]].append(dict(row))

    for thread_id, messages in messages_by_thread.items():
        # The pre-branch schema wrote a user message and its answer in one
        # transaction with the same timestamp. UUID order is not conversation order.
        ordered = sorted(
            messages,
            key=lambda row: (
                row["created_at"],
                0 if row["role"] == "user" else 1 if row["role"] == "assistant" else 2,
                row["id"],
            ),
        )
        parent_id: str | None = None
        for message in ordered:
            connection.execute(
                sa.text(
                    "UPDATE chat_messages SET parent_message_id = :parent_id WHERE id = :message_id"
                ),
                {"parent_id": parent_id, "message_id": message["id"]},
            )
            parent_id = str(message["id"])

        completed_ids = [message["id"] for message in ordered if message["status"] == "completed"]
        connection.execute(
            sa.text("UPDATE chat_threads SET active_message_id = :active_id WHERE id = :thread_id"),
            {"active_id": completed_ids[-1] if completed_ids else None, "thread_id": thread_id},
        )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("UPDATE chat_threads SET active_message_id = NULL"))
    connection.execute(sa.text("UPDATE chat_messages SET parent_message_id = NULL"))
