import fitz
import pytest

import ai_pdf_worker.ocr as ocr_module
from ai_pdf_worker.ocr import _recognized_text
from ai_pdf_worker.ocr import _recognized_blocks, extract_page_texts_with_ocr


def test_recognized_text_unwraps_rapidocr_result() -> None:
    result = (
        [
            ([[0, 0], [10, 0], [10, 10], [0, 10]], "第一页标题", 0.99),
            ([[0, 20], [10, 20], [10, 30], [0, 30]], "正文内容", 0.98),
        ],
        [0.1, 0.2, 0.3],
    )

    assert _recognized_text(result) == "第一页标题\n正文内容"


def test_recognized_text_ignores_empty_and_malformed_rows() -> None:
    result = [
        None,
        [],
        ([[0, 0]], "  ", 0.1),
        ([[0, 0]], "有效文本", 0.9),
        ("invalid", 1),
    ]

    assert _recognized_text(result) == "有效文本"


def test_recognized_blocks_normalizes_and_clamps_bbox() -> None:
    result = [
        ([[-10, -20], [120, 0], [120, 220], [-10, 220]], "边界文本", 1.4),
        ([[20, 40], [60, 40], [60, 80], [20, 80]], "第二块", 0.75),
    ]

    blocks = _recognized_blocks(result, width=100, height=200)

    assert blocks[0] == {"text": "边界文本", "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}
    assert blocks[1]["text"] == "第二块"
    assert blocks[1]["x"] == pytest.approx(0.2)
    assert blocks[1]["y"] == pytest.approx(0.2)
    assert blocks[1]["width"] == pytest.approx(0.4)
    assert blocks[1]["height"] == pytest.approx(0.2)


def test_extract_page_texts_with_ocr_returns_page_blocks(monkeypatch: pytest.MonkeyPatch) -> None:
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
        ocr_module,
        "_build_ocr",
        lambda: lambda image: (
            [([[10, 20], [60, 20], [60, 80], [10, 80]], "扫描文本", 0.91)],
            [0.01],
        ),
    )

    pages = extract_page_texts_with_ocr(b"pdf")

    assert len(pages) == 1
    assert pages[0].page_number == 1
    assert pages[0].text == "扫描文本"
    assert pages[0].ocr_blocks[0]["text"] == "扫描文本"
    assert pages[0].ocr_blocks[0]["x"] == pytest.approx(0.1)
    assert pages[0].ocr_blocks[0]["y"] == pytest.approx(0.1)
    assert pages[0].ocr_blocks[0]["width"] == pytest.approx(0.5)
    assert pages[0].ocr_blocks[0]["height"] == pytest.approx(0.3)
