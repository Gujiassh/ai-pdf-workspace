from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR
from hashlib import sha256
from io import BytesIO

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_pdf_api.modalities.evidence import IMAGE_COORDINATE_SPACE, serialize_evidence_locator
from ai_pdf_api.modalities.evidence_targets import (
    EvidenceTargetError,
    ImageBytesLoader,
    ResolvedEvidenceTarget,
)
from ai_pdf_api.models import (
    Asset,
    AssetRepresentation,
    ContentUnit,
    EvidenceLocator,
    ImageLocatorDetail,
    ImageRepresentationGeometry,
    SpatialLocatorRegion,
)
from ai_pdf_api.schemas.chat import EvidenceTargetRequest, ImageRegionEvidenceTarget, SpatialRegion


class ImageRegionEvidenceTargetResolver:
    kind = "image_region"

    def resolve(
        self,
        db: Session,
        *,
        workspace_id: str,
        target: EvidenceTargetRequest,
        created_at: datetime,
        image_bytes_loader: ImageBytesLoader,
        include_image_payloads: bool,
    ) -> ResolvedEvidenceTarget:
        if not isinstance(target, ImageRegionEvidenceTarget):
            raise EvidenceTargetError(
                "evidence_target_kind_invalid",
                "The Image Evidence target has an invalid payload.",
            )
        return _resolve_image_region_target(
            db,
            workspace_id=workspace_id,
            target=target,
            created_at=created_at,
            image_bytes_loader=image_bytes_loader,
            include_image_payloads=include_image_payloads,
        )


def _resolve_image_region_target(
    db: Session,
    *,
    workspace_id: str,
    target: ImageRegionEvidenceTarget,
    created_at: datetime,
    image_bytes_loader: ImageBytesLoader,
    include_image_payloads: bool,
) -> ResolvedEvidenceTarget:
    asset = db.scalar(
        select(Asset)
        .where(
            Asset.id == target.assetId,
            Asset.workspace_id == workspace_id,
            Asset.asset_kind == "image",
            Asset.status == "ready",
            Asset.deleted_at.is_(None),
        )
        .with_for_update()
    )
    if asset is None:
        raise EvidenceTargetError(
            "evidence_target_asset_unavailable",
            "The selected image is not available in this workspace.",
            404,
        )
    if asset.current_processing_generation != target.processingGeneration:
        raise EvidenceTargetError(
            "evidence_target_generation_changed",
            "The image changed after the region was selected. Select the region again.",
            409,
        )

    oriented_row = db.execute(
        select(AssetRepresentation, ImageRepresentationGeometry)
        .join(
            ImageRepresentationGeometry,
            ImageRepresentationGeometry.representation_id == AssetRepresentation.id,
        )
        .where(
            AssetRepresentation.workspace_id == workspace_id,
            AssetRepresentation.asset_id == asset.id,
            AssetRepresentation.representation_kind == "image_oriented",
            AssetRepresentation.processing_generation == target.processingGeneration,
            ImageRepresentationGeometry.workspace_id == workspace_id,
            ImageRepresentationGeometry.asset_id == asset.id,
        )
    ).one_or_none()
    if oriented_row is None:
        raise EvidenceTargetError(
            "evidence_target_display_missing",
            "The canonical image for this selection is unavailable.",
            409,
        )
    oriented, geometry = oriented_row
    if (
        geometry.width_pixels < 1
        or geometry.height_pixels < 1
        or not geometry.orientation_applied
        or not oriented.object_key
        or not oriented.content_sha256
        or len(oriented.content_sha256) != 64
        or any(character not in "0123456789abcdef" for character in oriented.content_sha256.lower())
    ):
        raise EvidenceTargetError(
            "evidence_target_geometry_invalid",
            "The selected image has invalid canonical geometry.",
            409,
        )

    evidence_units = db.execute(
        select(ContentUnit, AssetRepresentation)
        .join(AssetRepresentation, AssetRepresentation.id == ContentUnit.representation_id)
        .where(
            ContentUnit.workspace_id == workspace_id,
            ContentUnit.asset_id == asset.id,
            ContentUnit.index_version == asset.current_index_version,
            AssetRepresentation.workspace_id == workspace_id,
            AssetRepresentation.asset_id == asset.id,
            AssetRepresentation.processing_generation == target.processingGeneration,
            AssetRepresentation.representation_kind.in_(("image_ocr", "image_caption")),
        )
        .order_by(ContentUnit.unit_order, ContentUnit.id)
    ).all()
    ocr_units: list[
        tuple[ContentUnit, AssetRepresentation, list[SpatialLocatorRegion]]
    ] = []
    caption_units: list[tuple[ContentUnit, AssetRepresentation]] = []
    for unit, representation in evidence_units:
        locator = serialize_evidence_locator(
            db,
            unit.source_locator_id,
            workspace_id=workspace_id,
            asset_id=asset.id,
            processing_generation=target.processingGeneration,
            representation_id=representation.id,
        )
        if (
            locator.widthPixels != geometry.width_pixels
            or locator.heightPixels != geometry.height_pixels
            or not locator.orientationApplied
        ):
            raise EvidenceTargetError(
                "evidence_target_content_invalid",
                "The image Evidence geometry is inconsistent.",
                409,
            )
        if representation.representation_kind == "image_caption":
            if unit.unit_kind != "image_caption":
                raise EvidenceTargetError(
                    "evidence_target_content_invalid",
                    "The image caption Evidence is inconsistent.",
                    409,
                )
            caption_units.append((unit, representation))
            continue
        if unit.unit_kind != "image_ocr_region":
            raise EvidenceTargetError(
                "evidence_target_content_invalid",
                "The image OCR Evidence is inconsistent.",
                409,
            )
        source_regions = db.scalars(
            select(SpatialLocatorRegion).where(
                SpatialLocatorRegion.locator_id == unit.source_locator_id
            )
        ).all()
        ocr_units.append((unit, representation, source_regions))

    if len(caption_units) != 1:
        raise EvidenceTargetError(
            "evidence_target_content_invalid",
            "The image must have exactly one caption Evidence unit.",
            409,
        )
    ocr_representation_ids = {
        representation.id for _unit, representation, _regions in ocr_units
    }
    if len(ocr_representation_ids) > 1:
        raise EvidenceTargetError(
            "evidence_target_representation_ambiguous",
            "The image OCR Evidence uses inconsistent representations.",
            409,
        )

    matches_by_region = [
        [
            (unit, representation)
            for unit, representation, source_regions in ocr_units
            if any(_regions_overlap(source, selected) for source in source_regions)
        ]
        for selected in target.regions
    ]
    if matches_by_region and all(matches_by_region):
        ordered_matches: list[tuple[ContentUnit, AssetRepresentation]] = []
        seen_unit_ids: set[str] = set()
        for matches in matches_by_region:
            for unit, representation in sorted(
                matches,
                key=lambda item: (item[0].unit_order, item[0].id),
            ):
                if unit.id not in seen_unit_ids:
                    seen_unit_ids.add(unit.id)
                    ordered_matches.append((unit, representation))
        representation = ordered_matches[0][1]
        excerpt = "\n".join(unit.text_content.strip() for unit, _representation in ordered_matches)
    else:
        unit, representation = caption_units[0]
        excerpt = unit.text_content.strip()
    if not excerpt:
        raise EvidenceTargetError(
            "evidence_target_excerpt_empty",
            "The selected image region has no usable Evidence text.",
            409,
        )

    locator = EvidenceLocator(
        workspace_id=workspace_id,
        asset_id=asset.id,
        locator_kind="image_region",
        locator_version=1,
        processing_generation_snapshot=target.processingGeneration,
        representation_id_snapshot=representation.id,
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
            orientation_applied=True,
        )
    )
    db.add_all(
        [
            SpatialLocatorRegion(
                locator_id=locator.id,
                region_order=index,
                x=region.x,
                y=region.y,
                width=region.width,
                height=region.height,
            )
            for index, region in enumerate(target.regions)
        ]
    )
    db.flush()

    try:
        payload = image_bytes_loader(oriented.object_key)
        if sha256(payload).hexdigest() != oriented.content_sha256.lower():
            raise EvidenceTargetError(
                "evidence_target_image_invalid",
                "The canonical image bytes do not match the selected Evidence snapshot.",
                409,
            )
        crops = _crop_canonical_image(
            payload,
            width_pixels=geometry.width_pixels,
            height_pixels=geometry.height_pixels,
            regions=target.regions if include_image_payloads else [],
        )
    except EvidenceTargetError:
        raise
    except Exception as error:
        raise EvidenceTargetError(
            "evidence_target_image_invalid",
            "The canonical image bytes do not match the selected Evidence geometry.",
            409,
        ) from error
    return ResolvedEvidenceTarget(
        asset=asset,
        locator=locator,
        representation=representation,
        excerpt=excerpt[:4000],
        image_payloads=crops,
    )


def _regions_overlap(source: SpatialLocatorRegion, selected: SpatialRegion) -> bool:
    return (
        min(source.x + source.width, selected.x + selected.width) > max(source.x, selected.x)
        and min(source.y + source.height, selected.y + selected.height) > max(source.y, selected.y)
    )


def _crop_canonical_image(
    payload: bytes,
    *,
    width_pixels: int,
    height_pixels: int,
    regions: list[SpatialRegion],
) -> tuple[bytes, ...]:
    with Image.open(BytesIO(payload)) as image:
        image.load()
        if image.format != "PNG" or image.size != (width_pixels, height_pixels):
            raise EvidenceTargetError(
                "evidence_target_image_invalid",
                "The canonical image bytes do not match the selected Evidence geometry.",
                409,
            )
        crops: list[bytes] = []
        for region in regions:
            bounds = (
                max(0, _pixel_floor(region.x, width_pixels)),
                max(0, _pixel_floor(region.y, height_pixels)),
                min(width_pixels, _pixel_ceil(region.x, region.width, width_pixels)),
                min(height_pixels, _pixel_ceil(region.y, region.height, height_pixels)),
            )
            if bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
                raise EvidenceTargetError(
                    "evidence_target_region_empty",
                    "The selected image region has no pixels.",
                    422,
                )
            output = BytesIO()
            image.crop(bounds).save(output, format="PNG")
            crops.append(output.getvalue())
        return tuple(crops)


def _pixel_floor(value: float, dimension: int) -> int:
    return int((Decimal(str(value)) * dimension).to_integral_value(rounding=ROUND_FLOOR))


def _pixel_ceil(origin: float, extent: float, dimension: int) -> int:
    edge = (Decimal(str(origin)) + Decimal(str(extent))) * dimension
    return int(edge.to_integral_value(rounding=ROUND_CEILING))
