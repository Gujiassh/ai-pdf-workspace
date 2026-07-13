from __future__ import annotations

from functools import lru_cache

import numpy as np


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


def extract_page_texts_with_ocr(payload: bytes) -> list[tuple[int, str]]:
    import fitz

    ocr = _build_ocr()
    pdf = fitz.open(stream=payload, filetype="pdf")
    try:
        page_texts: list[tuple[int, str]] = []
        for page_number, page in enumerate(pdf, start=1):
            pixmap = page.get_pixmap(dpi=200, alpha=False)
            image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
            result = ocr(image)
            page_texts.append((page_number, _recognized_text(result)))
        return page_texts
    finally:
        pdf.close()
