"""migrate documents to the multimodal asset and evidence kernel

Revision ID: c9d1e2f3a4b5
Revises: a8c9d0e1f2a3
Create Date: 2026-07-17 13:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa


revision: str = "c9d1e2f3a4b5"
down_revision: Union[str, Sequence[str], None] = "a8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _locator_id(namespace: str, id_expression: str) -> str:
    digest = f"md5('{namespace}:' || {id_expression})"
    return (
        f"substr({digest}, 1, 8) || '-' || substr({digest}, 9, 4) || '-' || "
        f"substr({digest}, 13, 4) || '-' || substr({digest}, 17, 4) || '-' || "
        f"substr({digest}, 21, 12)"
    )


def _preflight_legacy_data() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM message_citations
            WHERE document_id IS NULL OR page_number_snapshot IS NULL
          ) THEN
            RAISE EXCEPTION 'asset migration requires every legacy citation to retain document and page snapshots';
          END IF;
          IF EXISTS (
            SELECT 1 FROM note_sources
            WHERE document_id IS NULL
               OR page_number_snapshot IS NULL
               OR document_title_snapshot IS NULL
               OR excerpt_snapshot IS NULL
          ) THEN
            RAISE EXCEPTION 'asset migration requires every legacy note source to retain document and display snapshots';
          END IF;
          IF EXISTS (
            SELECT 1 FROM document_chunks
            WHERE embedding IS NOT NULL
              AND (
                embedding_dimensions IS NULL
                OR embedding_provider IS NULL
                OR embedding_model IS NULL
                OR embedding_version IS NULL
              )
          ) THEN
            RAISE EXCEPTION 'asset migration will not invent metadata for legacy embeddings';
          END IF;
        END $$;
        """
    )


def _create_type_catalogs() -> None:
    op.create_table(
        "asset_types",
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("contract_version", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.PrimaryKeyConstraint("kind"),
    )
    op.create_table(
        "representation_types",
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("asset_kind", sa.String(length=64), nullable=False),
        sa.Column("contract_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["asset_kind"], ["asset_types.kind"]),
        sa.PrimaryKeyConstraint("kind"),
    )
    op.create_index("ix_representation_types_asset_kind", "representation_types", ["asset_kind"])
    op.create_table(
        "content_unit_types",
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("asset_kind", sa.String(length=64), nullable=False),
        sa.Column("contract_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["asset_kind"], ["asset_types.kind"]),
        sa.PrimaryKeyConstraint("kind"),
    )
    op.create_index("ix_content_unit_types_asset_kind", "content_unit_types", ["asset_kind"])
    op.create_table(
        "locator_types",
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("contract_version", sa.Integer(), nullable=False),
        sa.Column("detail_family", sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint("kind"),
    )
    op.create_table(
        "embedding_spaces",
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("contract_version", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("kind"),
    )

    op.execute("INSERT INTO asset_types VALUES ('pdf', 1, true), ('image', 1, false)")
    op.execute(
        """
        INSERT INTO representation_types(kind, asset_kind, contract_version) VALUES
          ('pdf_text_legacy', 'pdf', 1),
          ('pdf_page_layout', 'pdf', 1),
          ('pdf_ocr', 'pdf', 1),
          ('pdf_table', 'pdf', 1),
          ('pdf_figure', 'pdf', 1),
          ('image_oriented', 'image', 1),
          ('image_ocr', 'image', 1),
          ('image_caption', 'image', 1)
        """
    )
    op.execute(
        """
        INSERT INTO content_unit_types(kind, asset_kind, contract_version) VALUES
          ('pdf_text_chunk', 'pdf', 1),
          ('pdf_ocr_region', 'pdf', 1),
          ('pdf_table', 'pdf', 1),
          ('pdf_figure', 'pdf', 1),
          ('image_ocr_region', 'image', 1),
          ('image_caption', 'image', 1)
        """
    )
    op.execute(
        """
        INSERT INTO locator_types(kind, contract_version, detail_family) VALUES
          ('pdf_page', 1, 'spatial'),
          ('pdf_region', 1, 'spatial'),
          ('image_region', 1, 'spatial')
        """
    )
    op.execute("INSERT INTO embedding_spaces VALUES ('text', 1)")


def _migrate_assets_and_representations() -> None:
    op.rename_table("documents", "assets")
    op.execute("ALTER INDEX ix_documents_workspace_id RENAME TO ix_assets_workspace_id")
    op.execute("ALTER INDEX ix_documents_created_by_user_id RENAME TO ix_assets_created_by_user_id")
    op.execute("ALTER INDEX ix_documents_status RENAME TO ix_assets_status")
    op.add_column(
        "assets",
        sa.Column("asset_kind", sa.String(length=64), server_default="pdf", nullable=False),
    )
    op.add_column("assets", sa.Column("source_sha256", sa.String(length=64), nullable=True))
    op.add_column(
        "assets",
        sa.Column("current_processing_generation", sa.Integer(), server_default="1", nullable=False),
    )
    op.create_foreign_key("fk_assets_asset_kind", "assets", "asset_types", ["asset_kind"], ["kind"])
    op.create_index("ix_assets_asset_kind", "assets", ["asset_kind"])
    op.alter_column("assets", "asset_kind", server_default=None)
    op.alter_column("assets", "current_processing_generation", server_default=None)

    op.create_table(
        "asset_representations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("asset_id", sa.String(length=36), nullable=False),
        sa.Column("representation_kind", sa.String(length=64), nullable=False),
        sa.Column("processing_generation", sa.Integer(), nullable=False),
        sa.Column("generator_provider", sa.String(length=64), nullable=True),
        sa.Column("generator_model", sa.String(length=128), nullable=True),
        sa.Column("generator_version", sa.String(length=64), nullable=False),
        sa.Column("object_key", sa.String(length=1024), nullable=True),
        sa.Column("content_sha256", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.ForeignKeyConstraint(["representation_kind"], ["representation_types.kind"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "asset_id",
            "representation_kind",
            "processing_generation",
            name="uq_asset_representations_asset_kind_generation",
        ),
    )
    op.create_index("ix_asset_representations_workspace_id", "asset_representations", ["workspace_id"])
    op.create_index("ix_asset_representations_asset_id", "asset_representations", ["asset_id"])
    op.create_index(
        "ix_asset_representations_representation_kind",
        "asset_representations",
        ["representation_kind"],
    )
    op.execute(
        """
        INSERT INTO asset_representations(
          id, workspace_id, asset_id, representation_kind, processing_generation,
          generator_version, object_key, content_sha256, created_at
        )
        SELECT
          id, workspace_id, id, 'pdf_text_legacy', 1,
          'legacy-pdf-v1', NULL, source_sha256, created_at
        FROM assets
        """
    )


def _migrate_pdf_pages() -> None:
    op.rename_table("document_pages", "pdf_pages")
    op.alter_column("pdf_pages", "document_id", new_column_name="asset_id")
    op.alter_column("pdf_pages", "ocr_blocks", new_column_name="legacy_ocr_blocks")
    op.execute("ALTER INDEX ix_document_pages_workspace_id RENAME TO ix_pdf_pages_workspace_id")
    op.execute("ALTER INDEX ix_document_pages_document_id RENAME TO ix_pdf_pages_asset_id")
    op.add_column("pdf_pages", sa.Column("representation_id", sa.String(length=36), nullable=True))
    for column in (
        "media_x0_points",
        "media_y0_points",
        "media_x1_points",
        "media_y1_points",
        "crop_x0_points",
        "crop_y0_points",
        "crop_x1_points",
        "crop_y1_points",
        "display_width_points",
        "display_height_points",
    ):
        op.add_column("pdf_pages", sa.Column(column, sa.Float(), nullable=True))
    op.add_column("pdf_pages", sa.Column("rotation_degrees", sa.Integer(), nullable=True))
    op.execute("UPDATE pdf_pages SET representation_id = asset_id")
    op.alter_column("pdf_pages", "representation_id", nullable=False)
    op.create_foreign_key(
        "fk_pdf_pages_representation_id",
        "pdf_pages",
        "asset_representations",
        ["representation_id"],
        ["id"],
    )
    op.create_index("ix_pdf_pages_representation_id", "pdf_pages", ["representation_id"])
    op.drop_constraint("uq_document_pages_document_page", "pdf_pages", type_="unique")
    op.create_unique_constraint(
        "uq_pdf_pages_asset_representation_page",
        "pdf_pages",
        ["asset_id", "representation_id", "page_number"],
    )
    op.create_table(
        "image_representation_geometry",
        sa.Column("representation_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("asset_id", sa.String(length=36), nullable=False),
        sa.Column("width_pixels", sa.Integer(), nullable=False),
        sa.Column("height_pixels", sa.Integer(), nullable=False),
        sa.Column("orientation_applied", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["representation_id"], ["asset_representations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.PrimaryKeyConstraint("representation_id"),
    )
    op.create_index(
        "ix_image_representation_geometry_workspace_id",
        "image_representation_geometry",
        ["workspace_id"],
    )
    op.create_index(
        "ix_image_representation_geometry_asset_id",
        "image_representation_geometry",
        ["asset_id"],
    )


def _create_locator_tables() -> None:
    op.create_table(
        "evidence_locators",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("asset_id", sa.String(length=36), nullable=False),
        sa.Column("locator_kind", sa.String(length=64), nullable=False),
        sa.Column("locator_version", sa.Integer(), nullable=False),
        sa.Column("processing_generation_snapshot", sa.Integer(), nullable=False),
        sa.Column("representation_id_snapshot", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.ForeignKeyConstraint(["locator_kind"], ["locator_types.kind"]),
        sa.ForeignKeyConstraint(["representation_id_snapshot"], ["asset_representations.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evidence_locators_workspace_id", "evidence_locators", ["workspace_id"])
    op.create_index("ix_evidence_locators_asset_id", "evidence_locators", ["asset_id"])
    op.create_index("ix_evidence_locators_locator_kind", "evidence_locators", ["locator_kind"])
    op.create_table(
        "pdf_locator_details",
        sa.Column("locator_id", sa.String(length=36), nullable=False),
        sa.Column("page_id", sa.String(length=36), nullable=True),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("coordinate_space", sa.String(length=64), nullable=True),
        sa.Column("crop_x0_points", sa.Float(), nullable=True),
        sa.Column("crop_y0_points", sa.Float(), nullable=True),
        sa.Column("crop_x1_points", sa.Float(), nullable=True),
        sa.Column("crop_y1_points", sa.Float(), nullable=True),
        sa.Column("rotation_degrees", sa.Integer(), nullable=True),
        sa.Column("display_width_points", sa.Float(), nullable=True),
        sa.Column("display_height_points", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["locator_id"], ["evidence_locators.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["page_id"], ["pdf_pages.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("locator_id"),
    )
    op.create_table(
        "image_locator_details",
        sa.Column("locator_id", sa.String(length=36), nullable=False),
        sa.Column("coordinate_space", sa.String(length=64), nullable=False),
        sa.Column("width_pixels", sa.Integer(), nullable=False),
        sa.Column("height_pixels", sa.Integer(), nullable=False),
        sa.Column("orientation_applied", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["locator_id"], ["evidence_locators.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("locator_id"),
    )
    op.create_table(
        "spatial_locator_regions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("locator_id", sa.String(length=36), nullable=False),
        sa.Column("region_order", sa.Integer(), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("width", sa.Float(), nullable=False),
        sa.Column("height", sa.Float(), nullable=False),
        sa.CheckConstraint("x >= 0 AND x <= 1", name="ck_spatial_locator_regions_x"),
        sa.CheckConstraint("y >= 0 AND y <= 1", name="ck_spatial_locator_regions_y"),
        sa.CheckConstraint("width > 0 AND width <= 1", name="ck_spatial_locator_regions_width"),
        sa.CheckConstraint("height > 0 AND height <= 1", name="ck_spatial_locator_regions_height"),
        sa.CheckConstraint("x + width <= 1", name="ck_spatial_locator_regions_x_width"),
        sa.CheckConstraint("y + height <= 1", name="ck_spatial_locator_regions_y_height"),
        sa.ForeignKeyConstraint(["locator_id"], ["evidence_locators.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "locator_id", "region_order", name="uq_spatial_locator_regions_locator_order"
        ),
    )
    op.create_index(
        "ix_spatial_locator_regions_locator_id", "spatial_locator_regions", ["locator_id"]
    )


def _migrate_content_units_and_embeddings() -> None:
    op.rename_table("document_chunks", "content_units")
    op.alter_column("content_units", "document_id", new_column_name="asset_id")
    op.alter_column("content_units", "chunk_index", new_column_name="unit_order")
    op.alter_column("content_units", "chunk_text", new_column_name="text_content")
    op.execute("ALTER INDEX ix_document_chunks_workspace_id RENAME TO ix_content_units_workspace_id")
    op.execute("ALTER INDEX ix_document_chunks_document_id RENAME TO ix_content_units_asset_id")
    op.execute(
        "ALTER INDEX ix_document_chunks_chunk_text_trgm_gist "
        "RENAME TO ix_content_units_text_content_trgm_gist"
    )
    op.execute(
        "ALTER INDEX ix_document_chunks_chunk_text_fts "
        "RENAME TO ix_content_units_text_content_fts"
    )
    op.drop_index("ix_document_chunks_embedding_hnsw", table_name="content_units")

    content_locator_id = _locator_id("content-unit", "cu.id")
    op.execute(
        f"""
        INSERT INTO evidence_locators(
          id, workspace_id, asset_id, locator_kind, locator_version,
          processing_generation_snapshot, representation_id_snapshot, created_at
        )
        SELECT
          {content_locator_id}, cu.workspace_id, cu.asset_id, 'pdf_page', 1,
          a.current_processing_generation, a.id, cu.created_at
        FROM content_units cu
        JOIN assets a ON a.id = cu.asset_id
        """
    )
    op.execute(
        f"""
        INSERT INTO pdf_locator_details(locator_id, page_id, page_number)
        SELECT {content_locator_id}, p.id, p.page_number
        FROM content_units cu
        JOIN pdf_pages p ON p.id = cu.page_id
        """
    )

    op.add_column("content_units", sa.Column("representation_id", sa.String(length=36), nullable=True))
    op.add_column("content_units", sa.Column("source_locator_id", sa.String(length=36), nullable=True))
    op.add_column("content_units", sa.Column("unit_kind", sa.String(length=64), nullable=True))
    content_locator_update_id = _locator_id("content-unit", "id")
    op.execute(
        f"""
        UPDATE content_units
        SET representation_id = asset_id,
            source_locator_id = {content_locator_update_id},
            unit_kind = 'pdf_text_chunk'
        """
    )
    for column in ("representation_id", "source_locator_id", "unit_kind"):
        op.alter_column("content_units", column, nullable=False)
    op.create_foreign_key(
        "fk_content_units_representation_id",
        "content_units",
        "asset_representations",
        ["representation_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_content_units_source_locator_id",
        "content_units",
        "evidence_locators",
        ["source_locator_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_content_units_unit_kind",
        "content_units",
        "content_unit_types",
        ["unit_kind"],
        ["kind"],
    )
    op.create_index("ix_content_units_representation_id", "content_units", ["representation_id"])
    op.create_index("ix_content_units_source_locator_id", "content_units", ["source_locator_id"])
    op.create_index("ix_content_units_unit_kind", "content_units", ["unit_kind"])

    op.create_table(
        "content_unit_embeddings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("content_unit_id", sa.String(length=36), nullable=False),
        sa.Column("embedding_space", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("dimensions", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("embedding", Vector(1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["content_unit_id"], ["content_units.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["embedding_space"], ["embedding_spaces.kind"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "content_unit_id",
            "embedding_space",
            "provider",
            "model",
            "version",
            name="uq_content_unit_embeddings_unit_space_model_version",
        ),
    )
    op.create_index(
        "ix_content_unit_embeddings_workspace_id", "content_unit_embeddings", ["workspace_id"]
    )
    op.create_index(
        "ix_content_unit_embeddings_content_unit_id",
        "content_unit_embeddings",
        ["content_unit_id"],
    )
    op.create_index(
        "ix_content_unit_embeddings_embedding_space",
        "content_unit_embeddings",
        ["embedding_space"],
    )
    embedding_id = _locator_id("embedding", "cu.id")
    op.execute(
        f"""
        INSERT INTO content_unit_embeddings(
          id, workspace_id, content_unit_id, embedding_space, provider, model,
          dimensions, version, embedding, created_at
        )
        SELECT
          {embedding_id}, workspace_id, id, 'text', embedding_provider, embedding_model,
          embedding_dimensions, embedding_version, embedding, created_at
        FROM content_units cu
        WHERE embedding IS NOT NULL
        """
    )
    op.create_index(
        "ix_content_unit_embeddings_embedding_hnsw",
        "content_unit_embeddings",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"ef_construction": 128},
    )

    op.drop_constraint("uq_document_chunks_document_page_index_version", "content_units", type_="unique")
    op.drop_column("content_units", "page_id")
    for column in (
        "embedding",
        "embedding_dimensions",
        "embedding_provider",
        "embedding_model",
        "embedding_version",
    ):
        op.drop_column("content_units", column)
    op.alter_column("content_units", "char_start", nullable=True)
    op.alter_column("content_units", "char_end", nullable=True)
    op.create_unique_constraint(
        "uq_content_units_asset_representation_locator_order_version",
        "content_units",
        ["asset_id", "representation_id", "source_locator_id", "unit_order", "index_version"],
    )


def _migrate_citations() -> None:
    citation_locator_id = _locator_id("citation", "c.id")
    op.execute(
        f"""
        INSERT INTO evidence_locators(
          id, workspace_id, asset_id, locator_kind, locator_version,
          processing_generation_snapshot, representation_id_snapshot, created_at
        )
        SELECT
          {citation_locator_id}, c.workspace_id, c.document_id, 'pdf_page', 1,
          a.current_processing_generation, a.id, c.created_at
        FROM message_citations c
        JOIN assets a ON a.id = c.document_id
        """
    )
    op.execute(
        f"""
        INSERT INTO pdf_locator_details(locator_id, page_id, page_number)
        SELECT {citation_locator_id}, p.id, c.page_number_snapshot
        FROM message_citations c
        LEFT JOIN pdf_pages p
          ON p.asset_id = c.document_id
         AND p.representation_id = c.document_id
         AND p.page_number = c.page_number_snapshot
        """
    )
    columns = (
        sa.Column("evidence_locator_id", sa.String(length=36), nullable=True),
        sa.Column("asset_id", sa.String(length=36), nullable=True),
        sa.Column("asset_kind_snapshot", sa.String(length=64), nullable=True),
        sa.Column("asset_title_snapshot", sa.String(length=255), nullable=True),
        sa.Column("processing_generation_snapshot", sa.Integer(), nullable=True),
        sa.Column("representation_id_snapshot", sa.String(length=36), nullable=True),
        sa.Column("parser_version_snapshot", sa.String(length=64), nullable=True),
    )
    for column in columns:
        op.add_column("message_citations", column)
    op.execute(
        f"""
        UPDATE message_citations c
        SET evidence_locator_id = {citation_locator_id},
            asset_id = c.document_id,
            asset_kind_snapshot = 'pdf',
            asset_title_snapshot = c.document_title_snapshot,
            processing_generation_snapshot = a.current_processing_generation,
            representation_id_snapshot = a.id,
            parser_version_snapshot = 'legacy-pdf-v1'
        FROM assets a
        WHERE a.id = c.document_id
        """
    )
    for column in (
        "evidence_locator_id",
        "asset_id",
        "asset_kind_snapshot",
        "asset_title_snapshot",
        "processing_generation_snapshot",
        "representation_id_snapshot",
        "parser_version_snapshot",
    ):
        op.alter_column("message_citations", column, nullable=False)
    op.create_foreign_key(
        "fk_message_citations_evidence_locator_id",
        "message_citations",
        "evidence_locators",
        ["evidence_locator_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_message_citations_asset_id",
        "message_citations",
        "assets",
        ["asset_id"],
        ["id"],
    )
    op.create_index(
        "ix_message_citations_evidence_locator_id", "message_citations", ["evidence_locator_id"]
    )
    op.create_index("ix_message_citations_asset_id", "message_citations", ["asset_id"])
    for column in ("chunk_id", "document_id", "page_number_snapshot", "document_title_snapshot"):
        op.drop_column("message_citations", column)


def _migrate_note_sources() -> None:
    source_locator_id = _locator_id("note-source", "ns.id")
    op.execute(
        f"""
        INSERT INTO evidence_locators(
          id, workspace_id, asset_id, locator_kind, locator_version,
          processing_generation_snapshot, representation_id_snapshot, created_at
        )
        SELECT
          {source_locator_id}, ns.workspace_id, ns.document_id, 'pdf_page', 1,
          a.current_processing_generation, a.id, ns.created_at
        FROM note_sources ns
        JOIN assets a ON a.id = ns.document_id
        """
    )
    op.execute(
        f"""
        INSERT INTO pdf_locator_details(locator_id, page_id, page_number)
        SELECT {source_locator_id}, p.id, ns.page_number_snapshot
        FROM note_sources ns
        LEFT JOIN pdf_pages p
          ON p.asset_id = ns.document_id
         AND p.representation_id = ns.document_id
         AND p.page_number = ns.page_number_snapshot
        """
    )
    columns = (
        sa.Column("evidence_locator_id", sa.String(length=36), nullable=True),
        sa.Column("asset_id", sa.String(length=36), nullable=True),
        sa.Column("asset_kind_snapshot", sa.String(length=64), nullable=True),
        sa.Column("asset_title_snapshot", sa.String(length=255), nullable=True),
        sa.Column("processing_generation_snapshot", sa.Integer(), nullable=True),
        sa.Column("representation_id_snapshot", sa.String(length=36), nullable=True),
        sa.Column("parser_version_snapshot", sa.String(length=64), nullable=True),
        sa.Column("index_version_snapshot", sa.Integer(), nullable=True),
    )
    for column in columns:
        op.add_column("note_sources", column)
    op.execute(
        f"""
        UPDATE note_sources ns
        SET evidence_locator_id = {source_locator_id},
            asset_id = ns.document_id,
            asset_kind_snapshot = 'pdf',
            asset_title_snapshot = ns.document_title_snapshot,
            processing_generation_snapshot = a.current_processing_generation,
            representation_id_snapshot = a.id,
            parser_version_snapshot = 'legacy-pdf-v1',
            index_version_snapshot = COALESCE(
              (
                SELECT c.index_version_snapshot
                FROM message_citations c
                WHERE c.id = ns.message_citation_id
              ),
              0
            )
        FROM assets a
        WHERE a.id = ns.document_id
        """
    )
    for column in (
        "evidence_locator_id",
        "asset_id",
        "asset_kind_snapshot",
        "asset_title_snapshot",
        "processing_generation_snapshot",
        "representation_id_snapshot",
        "parser_version_snapshot",
        "index_version_snapshot",
    ):
        op.alter_column("note_sources", column, nullable=False)
    op.alter_column("note_sources", "excerpt_snapshot", nullable=False)
    op.create_foreign_key(
        "fk_note_sources_evidence_locator_id",
        "note_sources",
        "evidence_locators",
        ["evidence_locator_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_note_sources_asset_id", "note_sources", "assets", ["asset_id"], ["id"]
    )
    op.create_index("ix_note_sources_evidence_locator_id", "note_sources", ["evidence_locator_id"])
    op.create_index("ix_note_sources_asset_id", "note_sources", ["asset_id"])
    for column in (
        "document_id",
        "page_number_snapshot",
        "document_title_snapshot",
    ):
        op.drop_column("note_sources", column)


def _create_retrieval_scope_tables() -> None:
    op.create_table(
        "message_retrieval_scopes",
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("scope_mode", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "scope_mode IN ('all_ready', 'selected')",
            name="ck_message_retrieval_scopes_scope_mode",
        ),
        sa.ForeignKeyConstraint(["message_id"], ["chat_messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("message_id"),
    )
    op.create_index(
        "ix_message_retrieval_scopes_workspace_id", "message_retrieval_scopes", ["workspace_id"]
    )
    op.create_table(
        "message_retrieval_scope_assets",
        sa.Column("message_id", sa.String(length=36), nullable=False),
        sa.Column("asset_id", sa.String(length=36), nullable=False),
        sa.Column("asset_order", sa.Integer(), nullable=False),
        sa.Column("asset_kind_snapshot", sa.String(length=64), nullable=False),
        sa.Column("asset_title_snapshot", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(
            ["message_id"], ["message_retrieval_scopes.message_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.PrimaryKeyConstraint("message_id", "asset_id"),
        sa.UniqueConstraint(
            "message_id", "asset_order", name="uq_message_retrieval_scope_assets_order"
        ),
    )


def _rename_remaining_document_ownership() -> None:
    op.rename_table("document_tags", "asset_tags")
    op.alter_column("asset_tags", "document_id", new_column_name="asset_id")
    op.execute("ALTER INDEX ix_document_tags_workspace_id RENAME TO ix_asset_tags_workspace_id")
    op.execute("ALTER INDEX ix_document_tags_document_id RENAME TO ix_asset_tags_asset_id")
    op.execute("ALTER INDEX ix_document_tags_tag_id RENAME TO ix_asset_tags_tag_id")
    op.drop_constraint("uq_document_tags_document_tag", "asset_tags", type_="unique")
    op.create_unique_constraint("uq_asset_tags_asset_tag", "asset_tags", ["asset_id", "tag_id"])

    op.alter_column("ingestion_jobs", "document_id", new_column_name="asset_id")
    op.execute("ALTER INDEX ix_ingestion_jobs_document_id RENAME TO ix_ingestion_jobs_asset_id")
    op.drop_column("assets", "page_count")


def upgrade() -> None:
    _preflight_legacy_data()
    _create_type_catalogs()
    _migrate_assets_and_representations()
    _migrate_pdf_pages()
    _create_locator_tables()
    _migrate_content_units_and_embeddings()
    _migrate_citations()
    _migrate_note_sources()
    _create_retrieval_scope_tables()
    _rename_remaining_document_ownership()


def downgrade() -> None:
    raise RuntimeError(
        "The Asset migration is intentionally irreversible in place. "
        "Restore the pre-migration backup to recover the Document schema."
    )
