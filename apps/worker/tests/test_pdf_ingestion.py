from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import fitz
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from ai_pdf_api.db.base import Base
from ai_pdf_api.modalities.ingestion import IngestionError
from ai_pdf_api.modalities.pdf_ingestion import (
    PageRegionResult,
    PageTextResult,
    PdfPageGeometryResult,
    replace_pdf_content,
)
from ai_pdf_api.models import (
    Asset,
    AssetRepresentation,
    ContentUnit,
    EvidenceLocator,
    PdfLocatorDetail,
    PdfPage,
    SpatialLocatorRegion,
)
import ai_pdf_worker.pdf_ingestion as pdf_ingestion_module
from ai_pdf_worker.ocr import OcrRegionResult, OcrTextResult
from ai_pdf_worker.pdf import extract_pdf_page_layout
from ai_pdf_worker.pdf_ingestion import (
    PdfIngestionAdapter,
    _chunk_size,
    extract_page_texts_with_ocr,
)


GEOMETRY = PdfPageGeometryResult(
    media_box_points=(0.0, 0.0, 612.0, 792.0),
    crop_box_points=(0.0, 0.0, 612.0, 792.0),
    rotation_degrees=0,
    display_width_points=612.0,
    display_height_points=792.0,
)
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
PDF_FIXTURE = (
    REPOSITORY_ROOT / "docs" / "fixtures" / "evidence-contract" / "pdf-coordinate-fixture.pdf"
)


def page(
    number: int,
    text: str,
    *,
    source_kind: str = "layout",
    regions: tuple[PageRegionResult, ...] = (),
) -> PageTextResult:
    return PageTextResult(
        page_number=number,
        text=text,
        geometry=GEOMETRY,
        source_kind=source_kind,  # type: ignore[arg-type]
        regions=regions,
    )


def test_pdf_adapter_uses_ocr_only_for_pages_without_native_text() -> None:
    ocr_calls: list[bytes] = []
    adapter = PdfIngestionAdapter(
        layout_extractor=lambda _payload: [page(1, "native"), page(2, "")],
        ocr_extractor=lambda payload: (
            ocr_calls.append(payload)
            or [
                page(1, "ignored OCR", source_kind="ocr"),
                page(2, "scan", source_kind="ocr"),
            ]
        ),
    )

    pages = adapter._parse_pages(b"pdf")

    assert ocr_calls == [b"pdf"]
    assert [(item.text, item.source_kind) for item in pages] == [
        ("native", "layout"),
        ("scan", "ocr"),
    ]
    assert pages[1].geometry is GEOMETRY


def test_extract_page_texts_with_ocr_maps_pixels_to_pdf_regions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakePixmap:
        width = 100
        height = 200
        n = 3
        samples = bytes(width * height * n)

    class FakePage:
        def get_pixmap(self, *, dpi: int, alpha: bool) -> FakePixmap:
            assert dpi == 200
            assert alpha is False
            return FakePixmap()

    class FakePdf:
        def __iter__(self):
            return iter([FakePage()])

        def close(self) -> None:
            pass

    monkeypatch.setattr(fitz, "open", lambda *, stream, filetype: FakePdf())
    monkeypatch.setattr(
        pdf_ingestion_module,
        "recognize_pixels",
        lambda _pixels: OcrTextResult(
            text="扫描文本",
            regions=(
                OcrRegionResult(
                    text="扫描文本",
                    x=0.1,
                    y=0.1,
                    width=0.5,
                    height=0.3,
                    char_start=0,
                    char_end=4,
                ),
            ),
        ),
    )

    pages = extract_page_texts_with_ocr(b"pdf")

    assert len(pages) == 1
    assert pages[0].text == "扫描文本"
    assert pages[0].source_kind == "ocr"
    assert pages[0].regions[0].char_start == 0
    assert pages[0].regions[0].char_end == 4
    assert pages[0].ocr_blocks[0] == {
        "text": "扫描文本",
        "x": 0.1,
        "y": 0.1,
        "width": 0.5,
        "height": 0.3,
    }


def test_pdf_adapter_rejects_incomplete_or_malformed_ocr_page_sets() -> None:
    adapter = PdfIngestionAdapter(
        layout_extractor=lambda _payload: [page(1, ""), page(2, "")],
        ocr_extractor=lambda _payload: [page(1, "scan", source_kind="ocr")],
    )

    with pytest.raises(IngestionError, match="complete PDF page set"):
        adapter._parse_pages(b"pdf")


def test_pdf_adapter_skips_ocr_when_every_page_has_native_text() -> None:
    adapter = PdfIngestionAdapter(
        layout_extractor=lambda _payload: [page(1, "native")],
        ocr_extractor=lambda _payload: (_ for _ in ()).throw(AssertionError("OCR must not run")),
    )

    assert adapter._parse_pages(b"pdf")[0].text == "native"


def test_pdf_adapter_validates_chunk_size_at_its_modality_boundary() -> None:
    assert _chunk_size({}) == 1200
    assert _chunk_size({"chunkSize": 4000}) == 4000
    with pytest.raises(IngestionError, match="invalid chunk size"):
        _chunk_size({"chunkSize": 199})


def test_real_artifact_fixture_persists_unique_region_content_units() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    now = datetime.now(UTC)
    try:
        with Session(engine) as db:
            asset = Asset(
                workspace_id="workspace-fixture",
                created_by_user_id="user-fixture",
                asset_kind="pdf",
                title="Evidence fixture",
                source_filename=PDF_FIXTURE.name,
                object_key="fixtures/pdf-coordinate-fixture.pdf",
                mime_type="application/pdf",
                byte_size=PDF_FIXTURE.stat().st_size,
                status="parsing",
                current_processing_generation=1,
                current_index_version=1,
                created_at=now,
                updated_at=now,
            )
            db.add(asset)
            db.flush()
            parsed_pages = extract_pdf_page_layout(PDF_FIXTURE.read_bytes())

            replace_pdf_content(
                db,
                asset=asset,
                pages=parsed_pages,
                processing_generation=1,
                chunk_size=1200,
                created_at=now,
            )
            db.flush()

            pages = db.scalars(
                select(PdfPage).where(PdfPage.asset_id == asset.id).order_by(PdfPage.page_number)
            ).all()
            representations = db.scalars(
                select(AssetRepresentation).where(AssetRepresentation.asset_id == asset.id)
            ).all()
            units = db.scalars(
                select(ContentUnit).where(ContentUnit.asset_id == asset.id)
            ).all()
            artifact_units = sorted(
                (unit for unit in units if unit.unit_kind in {"pdf_table", "pdf_figure"}),
                key=lambda unit: (unit.unit_kind, unit.text_content),
            )

            assert len(pages) == 12
            assert {representation.representation_kind for representation in representations} == {
                "pdf_page_layout",
                "pdf_table",
                "pdf_figure",
            }
            assert [unit.unit_kind for unit in artifact_units] == [
                "pdf_figure",
                "pdf_figure",
                "pdf_table",
            ]
            assert all(
                unit.char_start is None and unit.char_end is None
                for unit in artifact_units
            )
            assert sum("Evidence-A" in unit.text_content for unit in units) == 1
            assert sum("Trend rises" in unit.text_content for unit in units) == 1
            assert sum("In-page image caption" in unit.text_content for unit in units) == 1

            artifact_pages: dict[int, list[ContentUnit]] = {}
            for unit in artifact_units:
                locator = db.get(EvidenceLocator, unit.source_locator_id)
                detail = db.get(PdfLocatorDetail, unit.source_locator_id)
                regions = db.scalars(
                    select(SpatialLocatorRegion)
                    .where(SpatialLocatorRegion.locator_id == unit.source_locator_id)
                    .order_by(SpatialLocatorRegion.region_order)
                ).all()
                assert locator is not None and locator.locator_kind == "pdf_region"
                assert detail is not None
                assert detail.coordinate_space == "pdf_crop_box_normalized_top_left_v1"
                assert [region.region_order for region in regions] == list(range(len(regions)))
                assert regions
                artifact_pages.setdefault(detail.page_number, []).append(unit)
            assert set(artifact_pages) == {9, 10, 11}
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
