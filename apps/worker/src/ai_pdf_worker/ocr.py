from __future__ import annotations

from functools import lru_cache
from math import isfinite
from typing import Any

import numpy as np

from ai_pdf_api.services.ingestion import PageTextResult


@lru_cache(maxsize=1)
def _build_ocr():
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def _recognized_text(result: object) -> str:
    """Extract text lines from RapidOCR's ``(rows, elapsed)`` result."""
    if isinstance(result, tuple):
        result = result[0]
    if not isinstance(result, list):
        return ""

    lines: list[str] = []
    for item in result:
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        text = item[1]
        if isinstance(text, str) and text.strip():
            lines.append(text.strip())
    return "\n".join(lines)


def _recognized_rows(result: object) -> list[object]:
    if isinstance(result, tuple):
        result = result[0]
    return result if isinstance(result, list) else []


def _normalize_bbox(raw_bbox: object, width: int, height: int) -> tuple[float, float, float, float] | None:
    if width <= 0 or height <= 0:
        return None
    try:
        points = list(raw_bbox)  # type: ignore[arg-type]
    except TypeError:
        return None
    coordinates: list[tuple[float, float]] = []
    for point in points:
        try:
            x = float(point[0])  # type: ignore[index]
            y = float(point[1])  # type: ignore[index]
        except (IndexError, TypeError, ValueError):
            return None
        if not isfinite(x) or not isfinite(y):
            return None
        coordinates.append((x, y))
    if len(coordinates) < 2:
        return None

    x_min = max(0.0, min(1.0, min(x for x, _ in coordinates) / width))
    y_min = max(0.0, min(1.0, min(y for _, y in coordinates) / height))
    x_max = max(0.0, min(1.0, max(x for x, _ in coordinates) / width))
    y_max = max(0.0, min(1.0, max(y for _, y in coordinates) / height))
    if x_max <= x_min or y_max <= y_min:
        return None
    return x_min, y_min, x_max, y_max


def _recognized_blocks(result: object, width: int, height: int) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for item in _recognized_rows(result):
        if not isinstance(item, (list, tuple)) or len(item) < 2:
            continue
        text = item[1]
        if not isinstance(text, str) or not text.strip():
            continue
        bbox = _normalize_bbox(item[0], width, height)
        if bbox is None:
            continue
        x_min, y_min, x_max, y_max = bbox
        block: dict[str, Any] = {
            "text": text.strip(),
            "x": x_min,
            "y": y_min,
            "width": x_max - x_min,
            "height": y_max - y_min,
        }
        blocks.append(block)
    return blocks


def extract_page_texts_with_ocr(payload: bytes) -> list[PageTextResult]:
    import fitz

    ocr = _build_ocr()
    pdf = fitz.open(stream=payload, filetype="pdf")
    try:
        page_texts: list[PageTextResult] = []
        for page_number, page in enumerate(pdf, start=1):
            pixmap = page.get_pixmap(dpi=200, alpha=False)
            image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
            result = ocr(image)
            page_texts.append(
                PageTextResult(
                    page_number=page_number,
                    text=_recognized_text(result),
                    ocr_blocks=_recognized_blocks(result, pixmap.width, pixmap.height),
                )
            )
        return page_texts
    finally:
        pdf.close()
