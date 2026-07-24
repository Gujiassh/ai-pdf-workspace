from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from math import isclose, isfinite
from typing import Literal

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ai_pdf_api.models import (
    Asset,
    AssetRepresentation,
    ContentUnit,
    EvidenceLocator,
    PdfLocatorDetail,
    PdfPage,
    SpatialLocatorRegion,
)
from ai_pdf_api.modalities.evidence import PDF_COORDINATE_SPACE
from ai_pdf_api.modalities.text import estimate_token_count

CHUNK_SIZE = 1_200
CHUNK_OVERLAP = 200


@dataclass(frozen=True)
class PdfPageGeometryResult:
    media_box_points: tuple[float, float, float, float]
    crop_box_points: tuple[float, float, float, float]
    rotation_degrees: int
    display_width_points: float
    display_height_points: float

    def __post_init__(self) -> None:
        if self.rotation_degrees not in {0, 90, 180, 270}:
            raise ValueError("PDF rotation must be 0, 90, 180, or 270 degrees")
        for name, box in (
            ("MediaBox", self.media_box_points),
            ("CropBox", self.crop_box_points),
        ):
            if len(box) != 4 or not all(isfinite(value) for value in box):
                raise ValueError(f"{name} must contain four finite points")
            if box[2] <= box[0] or box[3] <= box[1]:
                raise ValueError(f"{name} must have positive width and height")
        if not isfinite(self.display_width_points) or self.display_width_points <= 0:
            raise ValueError("PDF display width must be positive")
        if not isfinite(self.display_height_points) or self.display_height_points <= 0:
            raise ValueError("PDF display height must be positive")
        crop_width = self.crop_box_points[2] - self.crop_box_points[0]
        crop_height = self.crop_box_points[3] - self.crop_box_points[1]
        expected_width, expected_height = (
            (crop_height, crop_width)
            if self.rotation_degrees in {90, 270}
            else (crop_width, crop_height)
        )
        if not isclose(self.display_width_points, expected_width, abs_tol=0.01):
            raise ValueError("PDF display width does not match the rotated CropBox")
        if not isclose(self.display_height_points, expected_height, abs_tol=0.01):
            raise ValueError("PDF display height does not match the rotated CropBox")


@dataclass(frozen=True)
class PageRegionResult:
    text: str
    unit_kind: Literal["pdf_ocr_region"]
    x: float
    y: float
    width: float
    height: float
    char_start: int
    char_end: int

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError("PDF region text must not be empty")
        values = (self.x, self.y, self.width, self.height)
        if not all(isfinite(value) for value in values):
            raise ValueError("PDF region coordinates must be finite")
        if self.x < 0 or self.y < 0 or self.width <= 0 or self.height <= 0:
            raise ValueError("PDF region coordinates must be positive and normalized")
        if self.x + self.width > 1.0000001 or self.y + self.height > 1.0000001:
            raise ValueError("PDF region must remain inside the page")
        if self.char_start < 0 or self.char_end <= self.char_start:
            raise ValueError("PDF region character range must be non-empty")


@dataclass(frozen=True)
class SpatialRegionResult:
    x: float
    y: float
    width: float
    height: float

    def __post_init__(self) -> None:
        values = (self.x, self.y, self.width, self.height)
        if not all(isfinite(value) for value in values):
            raise ValueError("PDF artifact coordinates must be finite")
        if self.x < 0 or self.y < 0 or self.width <= 0 or self.height <= 0:
            raise ValueError("PDF artifact coordinates must be positive and normalized")
        if self.x + self.width > 1.0000001 or self.y + self.height > 1.0000001:
            raise ValueError("PDF artifact region must remain inside the page")


@dataclass(frozen=True)
class PageArtifactResult:
    text: str
    unit_kind: Literal["pdf_table", "pdf_figure"]
    regions: tuple[SpatialRegionResult, ...]
    char_ranges: tuple[tuple[int, int], ...]

    def __post_init__(self) -> None:
        if not self.text.strip():
            raise ValueError("PDF artifact text must not be empty")
        if not self.regions:
            raise ValueError("PDF artifact requires at least one region")
        if not self.char_ranges:
            raise ValueError("PDF artifact requires source character ranges")
        previous_end = -1
        for start, end in self.char_ranges:
            if start < 0 or end <= start or start < previous_end:
                raise ValueError("PDF artifact character ranges must be ordered and non-overlapping")
            previous_end = end


@dataclass(frozen=True)
class PageTextResult:
    page_number: int
    text: str
    geometry: PdfPageGeometryResult | None = None
    source_kind: Literal["layout", "ocr"] = "layout"
    regions: tuple[PageRegionResult, ...] = ()
    artifacts: tuple[PageArtifactResult, ...] = ()
    ocr_blocks: list[dict[str, object]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.page_number < 1:
            raise ValueError("PDF page number must be positive")
        for region in self.regions:
            if region.char_end > len(self.text):
                raise ValueError("PDF region character range exceeds the page text")
            if self.text[region.char_start : region.char_end] != region.text:
                raise ValueError("PDF region text does not match its page character range")
        artifact_ranges: list[tuple[int, int]] = []
        for artifact in self.artifacts:
            for start, end in artifact.char_ranges:
                if end > len(self.text) or not self.text[start:end].strip():
                    raise ValueError("PDF artifact character range does not map to page text")
                artifact_ranges.append((start, end))
        for (_, previous_end), (next_start, _) in zip(
            sorted(artifact_ranges),
            sorted(artifact_ranges)[1:],
        ):
            if next_start < previous_end:
                raise ValueError("PDF artifact character ranges must not overlap")


PageTextExtractor = Callable[[bytes], list[PageTextResult]]


def split_page_text(text: str, chunk_size: int = CHUNK_SIZE) -> list[tuple[int, int, str]]:
    chunks: list[tuple[int, int, str]] = []
    start = 0
    text_length = len(text)
    overlap = min(CHUNK_OVERLAP, max(1, chunk_size // 2))
    while start < text_length:
        end = min(start + chunk_size, text_length)
        if end < text_length:
            boundary = text.rfind("\n", start + chunk_size // 2, end)
            if boundary <= start:
                boundary = text.rfind(" ", start + chunk_size // 2, end)
            if boundary > start:
                end = boundary
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append((start, end, chunk_text))
        if end == text_length:
            break
        start = max(end - overlap, start + 1)
    return chunks


def _regions_for_char_range(
    regions: tuple[PageRegionResult, ...],
    char_start: int,
    char_end: int,
) -> tuple[PageRegionResult, ...]:
    return tuple(
        region
        for region in regions
        if region.char_start < char_end and region.char_end > char_start
    )


def _regions_cover_text_range(
    text: str,
    regions: tuple[PageRegionResult, ...],
    char_start: int,
    char_end: int,
) -> bool:
    return all(
        character.isspace()
        or any(region.char_start <= index < region.char_end for region in regions)
        for index, character in enumerate(text[char_start:char_end], start=char_start)
    )


def _mask_artifact_text(
    text: str,
    artifacts: tuple[PageArtifactResult, ...],
) -> str:
    characters = list(text)
    for artifact in artifacts:
        for start, end in artifact.char_ranges:
            for index in range(start, end):
                if characters[index] not in {"\n", "\r"}:
                    characters[index] = " "
    return "".join(characters)


def replace_pdf_content(
    db: Session,
    *,
    asset: Asset,
    pages: list[PageTextResult],
    processing_generation: int,
    chunk_size: int,
    created_at: datetime,
) -> None:
    db.execute(delete(ContentUnit).where(ContentUnit.asset_id == asset.id))
    db.execute(delete(PdfPage).where(PdfPage.asset_id == asset.id))
    db.flush()

    layout_representation = AssetRepresentation(
        workspace_id=asset.workspace_id,
        asset_id=asset.id,
        representation_kind="pdf_page_layout",
        processing_generation=processing_generation,
        generator_version="pdf-layout-v1",
        created_at=created_at,
    )
    db.add(layout_representation)
    db.flush()
    ocr_representation: AssetRepresentation | None = None
    if any(page.source_kind == "ocr" for page in pages):
        ocr_representation = AssetRepresentation(
            workspace_id=asset.workspace_id,
            asset_id=asset.id,
            representation_kind="pdf_ocr",
            processing_generation=processing_generation,
            generator_version="rapidocr-region-v1",
            created_at=created_at,
        )
        db.add(ocr_representation)
        db.flush()
    artifact_representations: dict[str, AssetRepresentation] = {}
    for unit_kind, representation_kind, generator_version in (
        ("pdf_table", "pdf_table", "pymupdf-table-v1"),
        ("pdf_figure", "pdf_figure", "pymupdf-figure-v1"),
    ):
        if any(
            artifact.unit_kind == unit_kind
            for page in pages
            for artifact in page.artifacts
        ):
            representation = AssetRepresentation(
                workspace_id=asset.workspace_id,
                asset_id=asset.id,
                representation_kind=representation_kind,
                processing_generation=processing_generation,
                generator_version=generator_version,
                created_at=created_at,
            )
            db.add(representation)
            db.flush()
            artifact_representations[unit_kind] = representation

    for page_result in pages:
        geometry = page_result.geometry
        if geometry is None:
            raise ValueError("PDF parser did not return page geometry")
        page = PdfPage(
            workspace_id=asset.workspace_id,
            asset_id=asset.id,
            representation_id=layout_representation.id,
            page_number=page_result.page_number,
            media_x0_points=geometry.media_box_points[0],
            media_y0_points=geometry.media_box_points[1],
            media_x1_points=geometry.media_box_points[2],
            media_y1_points=geometry.media_box_points[3],
            crop_x0_points=geometry.crop_box_points[0],
            crop_y0_points=geometry.crop_box_points[1],
            crop_x1_points=geometry.crop_box_points[2],
            crop_y1_points=geometry.crop_box_points[3],
            rotation_degrees=geometry.rotation_degrees,
            display_width_points=geometry.display_width_points,
            display_height_points=geometry.display_height_points,
            extracted_text=page_result.text,
            char_count=len(page_result.text),
            legacy_ocr_blocks=page_result.ocr_blocks,
            created_at=created_at,
        )
        db.add(page)
        db.flush()
        source_representation = (
            ocr_representation if page_result.source_kind == "ocr" else layout_representation
        )
        if source_representation is None:
            raise RuntimeError("PDF page representation is missing")
        chunk_source_text = (
            _mask_artifact_text(page_result.text, page_result.artifacts)
            if page_result.source_kind == "layout"
            else page_result.text
        )
        for chunk_index, (char_start, char_end, chunk_text) in enumerate(
            split_page_text(chunk_source_text, chunk_size=chunk_size)
        ):
            chunk_regions = _regions_for_char_range(
                page_result.regions,
                char_start,
                char_end,
            )
            has_region_locator = (
                page_result.source_kind == "ocr"
                and bool(chunk_regions)
                and _regions_cover_text_range(
                    page_result.text,
                    chunk_regions,
                    char_start,
                    char_end,
                )
            )
            locator = EvidenceLocator(
                workspace_id=asset.workspace_id,
                asset_id=asset.id,
                locator_kind="pdf_region" if has_region_locator else "pdf_page",
                locator_version=1,
                processing_generation_snapshot=processing_generation,
                representation_id_snapshot=source_representation.id,
                created_at=created_at,
            )
            db.add(locator)
            db.flush()
            db.add(
                PdfLocatorDetail(
                    locator_id=locator.id,
                    page_id=page.id,
                    page_number=page.page_number,
                    coordinate_space=PDF_COORDINATE_SPACE if has_region_locator else None,
                    crop_x0_points=(geometry.crop_box_points[0] if has_region_locator else None),
                    crop_y0_points=(geometry.crop_box_points[1] if has_region_locator else None),
                    crop_x1_points=(geometry.crop_box_points[2] if has_region_locator else None),
                    crop_y1_points=(geometry.crop_box_points[3] if has_region_locator else None),
                    rotation_degrees=(geometry.rotation_degrees if has_region_locator else None),
                    display_width_points=(
                        geometry.display_width_points if has_region_locator else None
                    ),
                    display_height_points=(
                        geometry.display_height_points if has_region_locator else None
                    ),
                )
            )
            if has_region_locator:
                db.add_all(
                    [
                        SpatialLocatorRegion(
                            locator_id=locator.id,
                            region_order=region_order,
                            x=region.x,
                            y=region.y,
                            width=region.width,
                            height=region.height,
                        )
                        for region_order, region in enumerate(chunk_regions)
                    ]
                )
            db.add(
                ContentUnit(
                    workspace_id=asset.workspace_id,
                    asset_id=asset.id,
                    representation_id=source_representation.id,
                    source_locator_id=locator.id,
                    unit_kind=("pdf_ocr_region" if has_region_locator else "pdf_text_chunk"),
                    unit_order=chunk_index,
                    text_content=chunk_text,
                    token_count=estimate_token_count(chunk_text),
                    char_start=char_start,
                    char_end=char_end,
                    index_version=asset.current_index_version,
                    created_at=created_at,
                )
            )

        for artifact_index, artifact in enumerate(page_result.artifacts):
            representation = artifact_representations[artifact.unit_kind]
            locator = EvidenceLocator(
                workspace_id=asset.workspace_id,
                asset_id=asset.id,
                locator_kind="pdf_region",
                locator_version=1,
                processing_generation_snapshot=processing_generation,
                representation_id_snapshot=representation.id,
                created_at=created_at,
            )
            db.add(locator)
            db.flush()
            db.add(
                PdfLocatorDetail(
                    locator_id=locator.id,
                    page_id=page.id,
                    page_number=page.page_number,
                    coordinate_space=PDF_COORDINATE_SPACE,
                    crop_x0_points=geometry.crop_box_points[0],
                    crop_y0_points=geometry.crop_box_points[1],
                    crop_x1_points=geometry.crop_box_points[2],
                    crop_y1_points=geometry.crop_box_points[3],
                    rotation_degrees=geometry.rotation_degrees,
                    display_width_points=geometry.display_width_points,
                    display_height_points=geometry.display_height_points,
                )
            )
            db.add_all(
                [
                    SpatialLocatorRegion(
                        locator_id=locator.id,
                        region_order=region_order,
                        x=region.x,
                        y=region.y,
                        width=region.width,
                        height=region.height,
                    )
                    for region_order, region in enumerate(artifact.regions)
                ]
            )
            db.add(
                ContentUnit(
                    workspace_id=asset.workspace_id,
                    asset_id=asset.id,
                    representation_id=representation.id,
                    source_locator_id=locator.id,
                    unit_kind=artifact.unit_kind,
                    unit_order=artifact_index,
                    text_content=artifact.text,
                    token_count=estimate_token_count(artifact.text),
                    char_start=None,
                    char_end=None,
                    index_version=asset.current_index_version,
                    created_at=created_at,
                )
            )
    db.flush()


def delete_pdf_content(db: Session, asset_id: str) -> None:
    db.execute(delete(ContentUnit).where(ContentUnit.asset_id == asset_id))
    db.execute(delete(PdfPage).where(PdfPage.asset_id == asset_id))
