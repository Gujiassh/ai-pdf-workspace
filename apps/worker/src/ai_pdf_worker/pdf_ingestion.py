from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime

import fitz
import numpy as np
from sqlalchemy.orm import Session

from ai_pdf_api.modalities.ingestion import IngestionError, IngestionResult
from ai_pdf_api.modalities.pdf_ingestion import (
    CHUNK_SIZE,
    PageRegionResult,
    PageTextExtractor,
    PageTextResult,
    delete_pdf_content,
    replace_pdf_content,
)
from ai_pdf_api.models import Asset

from ai_pdf_worker.ocr import recognize_pixels
from ai_pdf_worker.pdf import extract_pdf_page_layout


def extract_page_texts_with_ocr(payload: bytes) -> list[PageTextResult]:
    pdf = fitz.open(stream=payload, filetype="pdf")
    try:
        page_texts: list[PageTextResult] = []
        for page_number, page in enumerate(pdf, start=1):
            pixmap = page.get_pixmap(dpi=200, alpha=False)
            pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(
                pixmap.height,
                pixmap.width,
                pixmap.n,
            )
            recognized = recognize_pixels(pixels)
            regions = tuple(
                PageRegionResult(
                    text=region.text,
                    unit_kind="pdf_ocr_region",
                    x=region.x,
                    y=region.y,
                    width=region.width,
                    height=region.height,
                    char_start=region.char_start,
                    char_end=region.char_end,
                )
                for region in recognized.regions
            )
            page_texts.append(
                PageTextResult(
                    page_number=page_number,
                    text=recognized.text,
                    source_kind="ocr",
                    regions=regions,
                    ocr_blocks=[region.as_block() for region in recognized.regions],
                )
            )
        return page_texts
    finally:
        pdf.close()


class PdfIngestionAdapter:
    asset_kind = "pdf"

    def __init__(
        self,
        *,
        layout_extractor: PageTextExtractor = extract_pdf_page_layout,
        ocr_extractor: PageTextExtractor = extract_page_texts_with_ocr,
    ) -> None:
        self._layout_extractor = layout_extractor
        self._ocr_extractor = ocr_extractor

    def ingest(
        self,
        db: Session,
        *,
        asset: Asset,
        payload: bytes,
        processing_generation: int,
        config_snapshot: Mapping[str, object],
        created_at: datetime,
    ) -> IngestionResult:
        pages = self._parse_pages(payload)
        replace_pdf_content(
            db,
            asset=asset,
            pages=pages,
            processing_generation=processing_generation,
            chunk_size=_chunk_size(config_snapshot),
            created_at=created_at,
        )
        return IngestionResult()

    def cleanup(self, db: Session, *, asset: Asset) -> None:
        delete_pdf_content(db, asset.id)

    def _parse_pages(self, payload: bytes) -> list[PageTextResult]:
        native_pages = self._layout_extractor(payload)
        _validate_native_pages(native_pages)
        if not native_pages:
            raise IngestionError("empty_pdf", "PDF has no pages.")
        if all(page.text.strip() for page in native_pages):
            return native_pages

        try:
            ocr_pages = _indexed_ocr_pages(self._ocr_extractor(payload))
            expected_numbers = {page.page_number for page in native_pages}
            if set(ocr_pages) != expected_numbers:
                raise ValueError("OCR did not return the complete PDF page set.")
            pages = [
                page if page.text.strip() else _merge_ocr_page(page, ocr_pages[page.page_number])
                for page in native_pages
            ]
        except Exception as error:
            raise IngestionError("ocr_failed", str(error)) from error
        if not any(page.text.strip() for page in pages):
            raise IngestionError("no_extractable_text", "PDF has no extractable text after OCR.")
        return pages


def _chunk_size(snapshot: Mapping[str, object]) -> int:
    value = snapshot.get("chunkSize", CHUNK_SIZE)
    if not isinstance(value, int) or isinstance(value, bool) or not 200 <= value <= 4000:
        raise IngestionError("invalid_chunk_size", "Ingestion job has an invalid chunk size.")
    return value


def _validate_native_pages(pages: list[PageTextResult]) -> None:
    expected_numbers = list(range(1, len(pages) + 1))
    if [page.page_number for page in pages] != expected_numbers:
        raise IngestionError("pdf_page_order_invalid", "PDF parser returned invalid page ordering.")
    if any(page.geometry is None for page in pages):
        raise IngestionError("pdf_geometry_missing", "PDF parser did not return page geometry.")
    if any(page.source_kind != "layout" or page.regions for page in pages):
        raise IngestionError(
            "pdf_layout_invalid",
            "PDF layout parser returned modality content outside its contract.",
        )


def _indexed_ocr_pages(pages: list[PageTextResult]) -> dict[int, PageTextResult]:
    results: dict[int, PageTextResult] = {}
    for page in pages:
        if page.page_number in results:
            raise ValueError("OCR returned duplicate PDF page results.")
        results[page.page_number] = page
    return results


def _merge_ocr_page(native: PageTextResult, ocr: PageTextResult) -> PageTextResult:
    if ocr.source_kind != "ocr":
        raise ValueError("OCR page result has an invalid source kind.")
    return PageTextResult(
        page_number=native.page_number,
        text=ocr.text,
        geometry=native.geometry,
        source_kind="ocr",
        regions=ocr.regions,
        ocr_blocks=ocr.ocr_blocks,
    )
