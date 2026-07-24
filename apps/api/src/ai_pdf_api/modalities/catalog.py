from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_pdf_api.modalities.registry import CatalogSnapshot, ModalityRegistry
from ai_pdf_api.models import (
    AssetType,
    ContentUnitType,
    EmbeddingSpace,
    LocatorType,
    RepresentationType,
)


def load_catalog_snapshot(db: Session) -> CatalogSnapshot:
    return CatalogSnapshot(
        enabled_assets=frozenset(
            db.execute(
                select(AssetType.kind, AssetType.contract_version).where(AssetType.enabled.is_(True))
            ).all()
        ),
        representations=frozenset(
            db.execute(
                select(
                    RepresentationType.asset_kind,
                    RepresentationType.kind,
                    RepresentationType.contract_version,
                )
            ).all()
        ),
        content_units=frozenset(
            db.execute(
                select(
                    ContentUnitType.asset_kind,
                    ContentUnitType.kind,
                    ContentUnitType.contract_version,
                )
            ).all()
        ),
        locators=frozenset(
            db.execute(
                select(
                    LocatorType.kind,
                    LocatorType.contract_version,
                    LocatorType.detail_family,
                )
            ).all()
        ),
        embedding_spaces=frozenset(
            db.execute(select(EmbeddingSpace.kind, EmbeddingSpace.contract_version)).all()
        ),
    )


def validate_database_catalog(db: Session, registry: ModalityRegistry) -> None:
    registry.validate_catalog(load_catalog_snapshot(db))
