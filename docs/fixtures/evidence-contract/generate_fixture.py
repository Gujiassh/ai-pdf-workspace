from __future__ import annotations

import json
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parent
PDF_PATH = ROOT / "pdf-coordinate-fixture.pdf"
MANIFEST_PATH = ROOT / "pdf-coordinate-fixture.json"


def add_page(document: fitz.Document, label: str, rotation: int = 0) -> fitz.Page:
    page = document.new_page(width=612, height=792)
    page.insert_text((54, 58), label, fontsize=18)
    page.insert_text((54, 82), f"rotation={rotation}", fontsize=11)
    page.draw_rect(fitz.Rect(72, 132, 324, 204), color=(0.1, 0.4, 0.8), width=2)
    page.insert_text((82, 158), "Primary evidence region", fontsize=13)
    page.insert_text((82, 181), "Stable text for locator verification.", fontsize=10)
    page.set_rotation(rotation)
    return page


def normalized_display_region(rect: fitz.Rect, page: fitz.Page) -> dict[str, float]:
    display_rect = rect * page.rotation_matrix
    page_rect = page.rect
    return {
        "x": round((display_rect.x0 - page_rect.x0) / page_rect.width, 6),
        "y": round((display_rect.y0 - page_rect.y0) / page_rect.height, 6),
        "width": round(display_rect.width / page_rect.width, 6),
        "height": round(display_rect.height / page_rect.height, 6),
    }


def pdf_user_space_box(page: fitz.Page, box: fitz.Rect) -> list[float]:
    media_box = page.mediabox
    return [
        box.x0,
        media_box.height - box.y1,
        box.x1,
        media_box.height - box.y0,
    ]


def line_rect(page: fitz.Page, prefix: str) -> fitz.Rect:
    matches = [
        fitz.Rect(line["bbox"])
        for block in page.get_text("dict")["blocks"]
        if block["type"] == 0
        for line in block["lines"]
        if "".join(str(span["text"]) for span in line["spans"]).startswith(prefix)
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected exactly one line starting with {prefix!r}")
    return matches[0]


def page_fixture(
    page: fitz.Page,
    label: str,
    regions: list[fitz.Rect],
    *,
    artifacts: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    fixture: dict[str, object] = {
        "label": label,
        "pageNumber": page.number + 1,
        "mediaBoxPoints": pdf_user_space_box(page, page.mediabox),
        "cropBoxPoints": pdf_user_space_box(page, page.cropbox),
        "rotationDegrees": page.rotation,
        "displayWidthPoints": page.rect.width,
        "displayHeightPoints": page.rect.height,
        "regions": [normalized_display_region(region, page) for region in regions],
    }
    if artifacts:
        fixture["artifacts"] = [
            {
                **artifact,
                "regions": [
                    normalized_display_region(region, page)
                    for region in artifact["regions"]  # type: ignore[index]
                ],
            }
            for artifact in artifacts
        ]
    return fixture


def build() -> None:
    document = fitz.open()
    pages: list[dict[str, object]] = []

    for rotation in (0, 90, 180, 270):
        page = add_page(document, f"Rotation fixture {rotation}", rotation)
        pages.append(
            page_fixture(
                page,
                f"rotation-{rotation}",
                [fitz.Rect(72, 132, 324, 204)],
            )
        )

    for rotation in (0, 90, 180, 270):
        crop_page = add_page(document, f"CropBox rotation fixture {rotation}")
        crop_page.set_cropbox(fitz.Rect(36, 54, 576, 720))
        crop_region = fitz.Rect(90, 150, 330, 222)
        crop_page.draw_rect(crop_region, color=(0.8, 0.2, 0.2), width=2)
        crop_page.insert_text((100, 178), "Evidence inside CropBox", fontsize=12)
        crop_page.set_rotation(rotation)
        pages.append(
            page_fixture(
                crop_page,
                f"crop-box-rotation-{rotation}",
                [crop_region],
            )
        )

    table_page = add_page(document, "Table fixture")
    x_positions = (72, 220, 368, 516)
    y_positions = (270, 310, 350, 390)
    for x in x_positions:
        table_page.draw_line((x, y_positions[0]), (x, y_positions[-1]), color=(0, 0, 0))
    for y in y_positions:
        table_page.draw_line((x_positions[0], y), (x_positions[-1], y), color=(0, 0, 0))
    table_page.insert_text((82, 295), "Model", fontsize=10)
    table_page.insert_text((230, 295), "Score", fontsize=10)
    table_page.insert_text((82, 335), "Evidence-A", fontsize=10)
    table_page.insert_text((230, 335), "91.4", fontsize=10)
    table_cell = fitz.Rect(220, 310, 368, 350)
    table_rect = fitz.Rect(72, 270, 516, 390)
    pages.append(
        page_fixture(
            table_page,
            "table-cell",
            [table_cell],
            artifacts=[
                {
                    "kind": "pdf_table",
                    "text": "| Model | Score |  |\n| --- | --- | --- |\n| Evidence-A | 91.4 |  |",
                    "regions": [table_rect],
                }
            ],
        )
    )

    chart_page = add_page(document, "Chart and multi-region fixture")
    points = [(90, 430), (180, 360), (270, 390), (360, 290), (450, 250)]
    chart_page.draw_polyline(points, color=(0.1, 0.6, 0.2), width=3)
    for point in points:
        chart_page.draw_circle(point, 4, color=(0.1, 0.6, 0.2), fill=(0.1, 0.6, 0.2))
    chart_page.insert_text((80, 470), "Figure 1. Trend rises after the third point.", fontsize=11)
    chart_page.insert_text((80, 510), "Supporting caption in a separate region.", fontsize=11)
    chart_rect = fitz.Rect(86, 246, 454, 434)
    chart_caption = line_rect(chart_page, "Figure 1.")
    pages.append(
        page_fixture(
            chart_page,
            "chart-multi-region",
            [fitz.Rect(80, 230, 470, 440), fitz.Rect(76, 486, 370, 520)],
            artifacts=[
                {
                    "kind": "pdf_figure",
                    "text": "Figure 1. Trend rises after the third point.\nSupporting caption in a separate region.",
                    "regions": [
                        chart_rect,
                        chart_caption,
                        line_rect(chart_page, "Supporting caption"),
                    ],
                }
            ],
        )
    )

    image_page = add_page(document, "In-page image fixture")
    image_source = fitz.open()
    image_source_page = image_source.new_page(width=300, height=180)
    image_source_page.draw_rect(
        fitz.Rect(0, 0, 300, 180),
        color=(0.1, 0.3, 0.6),
        fill=(0.88, 0.93, 0.98),
    )
    image_source_page.insert_text((28, 72), "Embedded result image", fontsize=22)
    image_pixmap = image_source_page.get_pixmap(alpha=False)
    image_rect = fitz.Rect(90, 280, 522, 500)
    image_page.insert_image(
        image_rect,
        stream=image_pixmap.tobytes("png"),
        keep_proportion=False,
    )
    image_page.insert_text((90, 538), "Figure 2. In-page image caption evidence.", fontsize=12)
    image_caption_rect = line_rect(image_page, "Figure 2.")
    pages.append(
        page_fixture(
            image_page,
            "in-page-image",
            [image_rect],
            artifacts=[
                {
                    "kind": "pdf_figure",
                    "text": "Figure 2. In-page image caption evidence.",
                    "regions": [image_rect, image_caption_rect],
                }
            ],
        )
    )
    image_source.close()

    scan_source = fitz.open()
    scan_page = scan_source.new_page(width=612, height=792)
    scan_page.insert_text((70, 130), "Rasterized scan evidence", fontsize=22)
    scan_page.draw_rect(fitz.Rect(66, 96, 390, 158), color=(0.5, 0.2, 0.7), width=3)
    pixmap = scan_page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    scan_target = document.new_page(width=612, height=792)
    scan_target.insert_image(scan_target.rect, stream=pixmap.tobytes("png"))
    pages.append(
        page_fixture(
            scan_target,
            "raster-scan",
            [fitz.Rect(66, 96, 390, 158)],
        )
    )
    scan_source.close()

    document.set_metadata(
        {
            "title": "AI PDF Workspace Evidence Coordinate Fixture",
            "author": "AI PDF Workspace",
            "subject": "Synthetic non-confidential coordinate and region fixture",
        }
    )
    document.save(PDF_PATH, garbage=4, deflate=True, no_new_id=True)
    document.close()

    MANIFEST_PATH.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "coordinateStatus": "approved-contract-fixture-v1",
                "coordinateBasis": "pdf_crop_box_normalized_top_left_v1",
                "pages": pages,
            },
            ensure_ascii=True,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()
