from ai_pdf_worker.ocr import _recognized_text


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
