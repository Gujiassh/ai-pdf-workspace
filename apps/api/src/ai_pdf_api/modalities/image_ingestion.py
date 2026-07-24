from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from math import isfinite

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ai_pdf_api.modalities.evidence import IMAGE_COORDINATE_SPACE
from ai_pdf_api.modalities.ingestion import IngestionError
from ai_pdf_api.modalities.text import estimate_token_count
from ai_pdf_api.models import (
    Asset,
    AssetRepresentation,
    ContentUnit,
    EvidenceLocator,
    ImageLocatorDetail,
    ImageRepresentationGeometry,
    SpatialLocatorRegion,
)

IMAGE_ORIENTED_CONTENT_TYPE = "image/png"


@dataclass(frozen=True)
class ImageNormalizationResult:
    payload: bytes
    content_sha256: str
    width_pixels: int
    height_pixels: int
    orientation_applied: bool


@dataclass(frozen=True)
class ImageOcrRegionResult:
    text: str
    x: float
    y: float
    width: float
    height: float
    char_start: int
    char_end: int

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError("Image OCR region text must not be empty")
        values = (self.x, self.y, self.width, self.height)
        if not all(isfinite(value) for value in values):
            raise ValueError("Image OCR region coordinates must be finite")
        if self.x < 0 or self.y < 0 or self.width <= 0 or self.height <= 0:
            raise ValueError("Image OCR region coordinates must be positive and normalized")
        if self.x + self.width > 1.0000001 or self.y + self.height > 1.0000001:
            raise ValueError("Image OCR region must remain inside the image")
        if self.char_start < 0 or self.char_end <= self.char_start:
            raise ValueError("Image OCR region character range must be non-empty")


@dataclass(frozen=True)
class ImageAnalysisResult:
    ocr_regions: tuple[ImageOcrRegionResult, ...]
    caption: str
    caption_provider: str
    caption_model: str
    caption_version: str

    def __post_init__(self) -> None:
        if not self.caption.strip():
            raise ValueError("Image caption must not be empty")
        if not self.caption_provider or not self.caption_model or not self.caption_version:
            raise ValueError("Image caption provenance must be complete")


def build_image_oriented_object_key(asset: Asset, processing_generation: int) -> str:
    return (
        f"workspaces/{asset.workspace_id}/assets/{asset.id}/representations/"
        f"{processing_generation}/image-oriented.png"
    )


def persist_image_orientation(
    db: Session,
    *,
    asset: Asset,
    result: ImageNormalizationResult,
    object_key: str,
    processing_generation: int,
    created_at: datetime,
) -> AssetRepresentation:
    if asset.asset_kind != "image":
        raise IngestionError("image_asset_kind_invalid", "Image adapter received a non-image asset.")
    if result.width_pixels < 1 or result.height_pixels < 1 or not result.orientation_applied:
        raise IngestionError(
            "image_geometry_invalid",
            "Normalized image geometry is invalid.",
        )

    representation = AssetRepresentation(
        workspace_id=asset.workspace_id,
        asset_id=asset.id,
        representation_kind="image_oriented",
        processing_generation=processing_generation,
        generator_provider="pillow",
        generator_version="pillow-canonical-png-v1",
        object_key=object_key,
        content_sha256=result.content_sha256,
        created_at=created_at,
    )
    db.add(representation)
    db.flush()
    db.add(
        ImageRepresentationGeometry(
            representation_id=representation.id,
            workspace_id=asset.workspace_id,
            asset_id=asset.id,
            width_pixels=result.width_pixels,
            height_pixels=result.height_pixels,
            orientation_applied=True,
        )
    )
    db.flush()
    return representation


def persist_image_analysis(
    db: Session,
    *,
    asset: Asset,
    oriented_representation: AssetRepresentation,
    geometry: ImageNormalizationResult,
    result: ImageAnalysisResult,
    processing_generation: int,
    created_at: datetime,
) -> None:
    if asset.asset_kind != "image" or oriented_representation.asset_id != asset.id:
        raise IngestionError(
            "image_asset_kind_invalid",
            "Image analysis received invalid asset state.",
        )
    if (
        oriented_representation.representation_kind != "image_oriented"
        or oriented_representation.processing_generation != processing_generation
    ):
        raise IngestionError(
            "image_representation_invalid",
            "Image analysis requires the oriented representation for this generation.",
        )
    persisted_geometry = db.get(ImageRepresentationGeometry, oriented_representation.id)
    if persisted_geometry is None or (
        persisted_geometry.width_pixels,
        persisted_geometry.height_pixels,
        persisted_geometry.orientation_applied,
    ) != (
        geometry.width_pixels,
        geometry.height_pixels,
        geometry.orientation_applied,
    ):
        raise IngestionError(
            "image_geometry_mismatch",
            "Image analysis geometry does not match the oriented representation.",
        )

    db.execute(delete(ContentUnit).where(ContentUnit.asset_id == asset.id))
    ocr_representation: AssetRepresentation | None = None
    if result.ocr_regions:
        ocr_representation = AssetRepresentation(
            workspace_id=asset.workspace_id,
            asset_id=asset.id,
            representation_kind="image_ocr",
            processing_generation=processing_generation,
            generator_provider="rapidocr",
            generator_version="rapidocr-image-region-v1",
            created_at=created_at,
        )
        db.add(ocr_representation)

    caption_representation = AssetRepresentation(
        workspace_id=asset.workspace_id,
        asset_id=asset.id,
        representation_kind="image_caption",
        processing_generation=processing_generation,
        generator_provider=result.caption_provider,
        generator_model=result.caption_model,
        generator_version=result.caption_version,
        created_at=created_at,
    )
    db.add(caption_representation)
    db.flush()

    if ocr_representation is not None:
        for unit_order, region in enumerate(result.ocr_regions):
            locator = _persist_image_locator(
                db,
                asset=asset,
                evidence_representation=ocr_representation,
                geometry=geometry,
                processing_generation=processing_generation,
                regions=((region.x, region.y, region.width, region.height),),
                created_at=created_at,
            )
            text = region.text.strip()
            db.add(
                ContentUnit(
                    workspace_id=asset.workspace_id,
                    asset_id=asset.id,
                    representation_id=ocr_representation.id,
                    source_locator_id=locator.id,
                    unit_kind="image_ocr_region",
                    unit_order=unit_order,
                    text_content=text,
                    token_count=estimate_token_count(text),
                    char_start=None,
                    char_end=None,
                    index_version=asset.current_index_version,
                    created_at=created_at,
                )
            )

    caption_locator = _persist_image_locator(
        db,
        asset=asset,
        evidence_representation=caption_representation,
        geometry=geometry,
        processing_generation=processing_generation,
        regions=((0.0, 0.0, 1.0, 1.0),),
        created_at=created_at,
    )
    caption = result.caption.strip()
    db.add(
        ContentUnit(
            workspace_id=asset.workspace_id,
            asset_id=asset.id,
            representation_id=caption_representation.id,
            source_locator_id=caption_locator.id,
            unit_kind="image_caption",
            unit_order=0,
            text_content=caption,
            token_count=estimate_token_count(caption),
            char_start=None,
            char_end=None,
            index_version=asset.current_index_version,
            created_at=created_at,
        )
    )
    db.flush()


def _persist_image_locator(
    db: Session,
    *,
    asset: Asset,
    evidence_representation: AssetRepresentation,
    geometry: ImageNormalizationResult,
    processing_generation: int,
    regions: tuple[tuple[float, float, float, float], ...],
    created_at: datetime,
) -> EvidenceLocator:
    if (
        evidence_representation.asset_id != asset.id
        or evidence_representation.processing_generation != processing_generation
        or evidence_representation.representation_kind not in {"image_ocr", "image_caption"}
    ):
        raise IngestionError(
            "image_evidence_representation_invalid",
            "Image locator requires an evidence representation from the same generation.",
        )
    locator = EvidenceLocator(
        workspace_id=asset.workspace_id,
        asset_id=asset.id,
        locator_kind="image_region",
        locator_version=1,
        processing_generation_snapshot=processing_generation,
        representation_id_snapshot=evidence_representation.id,
        created_at=created_at,
    )
    db.add(locator)
    db.flush()
    db.add(
        ImageLocatorDetail(
            locator_id=locator.id,
            coordinate_space=IMAGE_COORDINATE_SPACE,
            width_pixels=geometry.width_pixels,
            height_pixels=geometry.height_pixels,
            orientation_applied=geometry.orientation_applied,
        )
    )
    db.add_all(
        [
            SpatialLocatorRegion(
                locator_id=locator.id,
                region_order=region_order,
                x=x,
                y=y,
                width=width,
                height=height,
            )
            for region_order, (x, y, width, height) in enumerate(regions)
        ]
    )
    return locator


def delete_image_content(db: Session, asset_id: str) -> None:
    db.execute(delete(ContentUnit).where(ContentUnit.asset_id == asset_id))
    db.execute(
        delete(ImageRepresentationGeometry).where(
            ImageRepresentationGeometry.asset_id == asset_id
        )
    )
