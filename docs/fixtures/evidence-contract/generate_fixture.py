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


def normalized(rect: fitz.Rect, page_rect: fitz.Rect) -> dict[str, float]:
    return {
        "x": round((rect.x0 - page_rect.x0) / page_rect.width, 6),
        "y": round((rect.y0 - page_rect.y0) / page_rect.height, 6),
        "width": round(rect.width / page_rect.width, 6),
        "height": round(rect.height / page_rect.height, 6),
    }


def build() -> None:
    document = fitz.open()
    pages: list[dict[str, object]] = []

    for rotation in (0, 90, 180, 270):
        page = add_page(document, f"Rotation fixture {rotation}", rotation)
        pages.append(
            {
                "label": f"rotation-{rotation}",
                "pageNumber": page.number + 1,
                "rotationDegrees": rotation,
                "regionsInUnrotatedMediaBox": [
                    normalized(fitz.Rect(72, 132, 324, 204), page.mediabox)
                ],
            }
        )

    crop_page = add_page(document, "CropBox fixture")
    crop_page.set_cropbox(fitz.Rect(36, 54, 576, 738))
    crop_region = fitz.Rect(90, 150, 330, 222)
    crop_page.draw_rect(crop_region, color=(0.8, 0.2, 0.2), width=2)
    crop_page.insert_text((100, 178), "Evidence inside CropBox", fontsize=12)
    pages.append(
        {
            "label": "crop-box",
            "pageNumber": crop_page.number + 1,
            "rotationDegrees": 0,
            "mediaBoxPoints": list(crop_page.mediabox),
            "cropBoxPoints": list(crop_page.cropbox),
            "regionsInUnrotatedCropBox": [normalized(crop_region, crop_page.cropbox)],
        }
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
    pages.append(
        {
            "label": "table-cell",
            "pageNumber": table_page.number + 1,
            "rotationDegrees": 0,
            "regionsInUnrotatedCropBox": [normalized(table_cell, table_page.cropbox)],
        }
    )

    chart_page = add_page(document, "Chart and multi-region fixture")
    points = [(90, 430), (180, 360), (270, 390), (360, 290), (450, 250)]
    chart_page.draw_polyline(points, color=(0.1, 0.6, 0.2), width=3)
    for point in points:
        chart_page.draw_circle(point, 4, color=(0.1, 0.6, 0.2), fill=(0.1, 0.6, 0.2))
    chart_page.insert_text((80, 470), "Trend rises after the third point.", fontsize=11)
    chart_page.insert_text((80, 510), "Supporting caption in a separate region.", fontsize=11)
    pages.append(
        {
            "label": "chart-multi-region",
            "pageNumber": chart_page.number + 1,
            "rotationDegrees": 0,
            "regionsInUnrotatedCropBox": [
                normalized(fitz.Rect(80, 230, 470, 440), chart_page.cropbox),
                normalized(fitz.Rect(76, 486, 370, 520), chart_page.cropbox),
            ],
        }
    )

    scan_source = fitz.open()
    scan_page = scan_source.new_page(width=612, height=792)
    scan_page.insert_text((70, 130), "Rasterized scan evidence", fontsize=22)
    scan_page.draw_rect(fitz.Rect(66, 96, 390, 158), color=(0.5, 0.2, 0.7), width=3)
    pixmap = scan_page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    scan_target = document.new_page(width=612, height=792)
    scan_target.insert_image(scan_target.rect, stream=pixmap.tobytes("png"))
    pages.append(
        {
            "label": "raster-scan",
            "pageNumber": scan_target.number + 1,
            "rotationDegrees": 0,
            "regionsInUnrotatedCropBox": [
                normalized(fitz.Rect(66, 96, 390, 158), scan_target.cropbox)
            ],
        }
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
                "coordinateStatus": "draft-fixture-not-approved-contract",
                "coordinateBasis": "unrotated MediaBox or CropBox as named per page",
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
