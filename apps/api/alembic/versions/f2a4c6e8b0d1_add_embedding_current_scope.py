"""add current-chain scope metadata to content unit embeddings

Revision ID: f2a4c6e8b0d1
Revises: e1f3a5c7d9b2
Create Date: 2026-07-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2a4c6e8b0d1"
down_revision: Union[str, Sequence[str], None] = "e1f3a5c7d9b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_unit_embeddings",
        sa.Column("asset_id", sa.String(length=36), nullable=True),
    )
    op.add_column(
        "content_unit_embeddings",
        sa.Column("processing_generation", sa.Integer(), nullable=True),
    )
    op.add_column(
        "content_unit_embeddings",
        sa.Column("index_version", sa.Integer(), nullable=True),
    )
    op.add_column(
        "content_unit_embeddings",
        sa.Column("is_current", sa.Boolean(), server_default=sa.false(), nullable=False),
    )

    op.execute(
        """
        UPDATE content_unit_embeddings AS embedding
        SET asset_id = unit.asset_id,
            processing_generation = locator.processing_generation_snapshot,
            index_version = unit.index_version,
            is_current = (
              locator.processing_generation_snapshot = asset.current_processing_generation
              AND unit.index_version = asset.current_index_version
            )
        FROM content_units AS unit
        JOIN assets AS asset
          ON asset.id = unit.asset_id
         AND asset.workspace_id = unit.workspace_id
        JOIN asset_representations AS representation
          ON representation.id = unit.representation_id
         AND representation.workspace_id = unit.workspace_id
         AND representation.asset_id = unit.asset_id
        JOIN evidence_locators AS locator
          ON locator.id = unit.source_locator_id
         AND locator.workspace_id = unit.workspace_id
         AND locator.asset_id = unit.asset_id
         AND locator.representation_id_snapshot = representation.id
         AND locator.processing_generation_snapshot = representation.processing_generation
        WHERE embedding.content_unit_id = unit.id
          AND embedding.workspace_id = unit.workspace_id
        """
    )
    connection = op.get_bind()
    invalid_count = int(
        connection.scalar(
            sa.text(
                """
                SELECT count(*)
                FROM content_unit_embeddings
                WHERE asset_id IS NULL
                   OR processing_generation IS NULL
                   OR index_version IS NULL
                """
            )
        )
        or 0
    )
    if invalid_count:
        raise RuntimeError(
            "Embedding current-scope backfill found invalid ContentUnit/Asset/Locator chains: "
            f"{invalid_count}"
        )

    op.alter_column("content_unit_embeddings", "asset_id", nullable=False)
    op.alter_column("content_unit_embeddings", "processing_generation", nullable=False)
    op.alter_column("content_unit_embeddings", "index_version", nullable=False)
    op.create_foreign_key(
        "fk_content_unit_embeddings_asset_id",
        "content_unit_embeddings",
        "assets",
        ["asset_id"],
        ["id"],
    )
    op.create_check_constraint(
        "ck_content_unit_embeddings_processing_generation",
        "content_unit_embeddings",
        "processing_generation >= 0",
    )
    op.create_check_constraint(
        "ck_content_unit_embeddings_index_version",
        "content_unit_embeddings",
        "index_version >= 0",
    )
    op.create_index(
        "ix_content_unit_embeddings_asset_id",
        "content_unit_embeddings",
        ["asset_id"],
    )
    op.create_index(
        "ix_content_unit_embeddings_is_current",
        "content_unit_embeddings",
        ["is_current"],
    )
    op.execute(
        """
        CREATE FUNCTION validate_content_unit_embedding_scope()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM new_rows embedding
            LEFT JOIN content_units unit ON unit.id = embedding.content_unit_id
            LEFT JOIN asset_representations representation
              ON representation.id = unit.representation_id
            LEFT JOIN evidence_locators locator
              ON locator.id = unit.source_locator_id
            LEFT JOIN assets asset ON asset.id = unit.asset_id
            WHERE embedding.is_current IS TRUE
              AND (unit.id IS NULL
               OR embedding.workspace_id IS DISTINCT FROM unit.workspace_id
               OR embedding.asset_id IS DISTINCT FROM unit.asset_id
               OR embedding.index_version IS DISTINCT FROM unit.index_version
               OR representation.asset_id IS DISTINCT FROM unit.asset_id
               OR representation.workspace_id IS DISTINCT FROM unit.workspace_id
               OR representation.processing_generation IS DISTINCT FROM embedding.processing_generation
               OR locator.asset_id IS DISTINCT FROM unit.asset_id
               OR locator.workspace_id IS DISTINCT FROM unit.workspace_id
               OR locator.representation_id_snapshot IS DISTINCT FROM representation.id
               OR locator.processing_generation_snapshot IS DISTINCT FROM embedding.processing_generation
               OR asset.current_processing_generation IS DISTINCT FROM embedding.processing_generation
               OR asset.current_index_version IS DISTINCT FROM embedding.index_version)
          ) THEN
            RAISE EXCEPTION 'content_unit_embeddings projection does not match its ContentUnit evidence chain'
              USING ERRCODE = '23514';
          END IF;
          RETURN NULL;
        END;
        $$;
        CREATE TRIGGER trg_content_unit_embeddings_scope_insert
        AFTER INSERT ON content_unit_embeddings
        REFERENCING NEW TABLE AS new_rows
        FOR EACH STATEMENT
        EXECUTE FUNCTION validate_content_unit_embedding_scope();
        CREATE TRIGGER trg_content_unit_embeddings_scope_update
        AFTER UPDATE ON content_unit_embeddings
        REFERENCING NEW TABLE AS new_rows
        FOR EACH STATEMENT
        EXECUTE FUNCTION validate_content_unit_embedding_scope();
        """
    )
    op.drop_index(
        "ix_content_unit_embeddings_embedding_hnsw",
        table_name="content_unit_embeddings",
    )
    op.create_index(
        "ix_content_unit_embeddings_current_embedding_hnsw",
        "content_unit_embeddings",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"ef_construction": 512},
        postgresql_where=sa.text("is_current IS TRUE"),
    )
    op.execute(
        """
        CREATE INDEX ix_content_unit_embeddings_current_embedding_binary_hnsw
          ON content_unit_embeddings
          USING hnsw (
            (binary_quantize(embedding)::bit(1024)) bit_hamming_ops
          )
          WITH (ef_construction=64)
          WHERE is_current IS TRUE
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_content_unit_embeddings_scope_update
          ON content_unit_embeddings;
        DROP TRIGGER IF EXISTS trg_content_unit_embeddings_scope_insert
          ON content_unit_embeddings;
        DROP FUNCTION IF EXISTS validate_content_unit_embedding_scope();
        """
    )
    op.drop_index(
        "ix_content_unit_embeddings_current_embedding_binary_hnsw",
        table_name="content_unit_embeddings",
    )
    op.drop_index(
        "ix_content_unit_embeddings_current_embedding_hnsw",
        table_name="content_unit_embeddings",
    )
    op.create_index(
        "ix_content_unit_embeddings_embedding_hnsw",
        "content_unit_embeddings",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"ef_construction": 128},
    )
    op.drop_index("ix_content_unit_embeddings_is_current", table_name="content_unit_embeddings")
    op.drop_index("ix_content_unit_embeddings_asset_id", table_name="content_unit_embeddings")
    op.drop_constraint(
        "ck_content_unit_embeddings_index_version",
        "content_unit_embeddings",
        type_="check",
    )
    op.drop_constraint(
        "ck_content_unit_embeddings_processing_generation",
        "content_unit_embeddings",
        type_="check",
    )
    op.drop_constraint(
        "fk_content_unit_embeddings_asset_id",
        "content_unit_embeddings",
        type_="foreignkey",
    )
    op.drop_column("content_unit_embeddings", "is_current")
    op.drop_column("content_unit_embeddings", "index_version")
    op.drop_column("content_unit_embeddings", "processing_generation")
    op.drop_column("content_unit_embeddings", "asset_id")
