from __future__ import annotations

import json
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parent
PDF_PATH = ROOT / "pdf-artifact-matrix-fixture.pdf"
MANIFEST_PATH = ROOT / "pdf-artifact-matrix-fixture.json"
CROP_BOX = fitz.Rect(36, 54, 576, 720)


def normalized_display_region(rect: fitz.Rect, page: fitz.Page) -> dict[str, float]:
    display_rect = rect * page.rotation_matrix
    return {
        "x": round(display_rect.x0 / page.rect.width, 6),
        "y": round(display_rect.y0 / page.rect.height, 6),
        "width": round(display_rect.width / page.rect.width, 6),
        "height": round(display_rect.height / page.rect.height, 6),
    }


def pdf_user_space_box(page: fitz.Page, box: fitz.Rect) -> list[float]:
    media_box = page.mediabox
    return [box.x0, media_box.height - box.y1, box.x1, media_box.height - box.y0]


def caption_rect(page: fitz.Page, prefix: str) -> fitz.Rect:
    matches = [
        fitz.Rect(line["bbox"])
        for block in page.get_text("dict")["blocks"]
        if block["type"] == 0
        for line in block["lines"]
        if "".join(str(span["text"]) for span in line["spans"]).startswith(prefix)
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected exactly one caption starting with {prefix!r}")
    return matches[0]


def add_base_page(document: fitz.Document, kind: str, rotation: int) -> fitz.Page:
    page = document.new_page(width=612, height=792)
    page.set_cropbox(CROP_BOX)
    page.insert_text((54, 72), f"{kind} artifact rotation {rotation}", fontsize=16)
    page.insert_text((54, 106), "Model Score", fontsize=11)
    return page


def table_artifact(page: fitz.Page) -> tuple[fitz.Rect, str, list[fitz.Rect]]:
    table_rect = fitz.Rect(72, 250, 468, 370)
    x_positions = (72, 270, 468)
    y_positions = (250, 310, 370)
    for x in x_positions:
        page.draw_line((x, y_positions[0]), (x, y_positions[-1]), color=(0.85, 0.05, 0.05))
    for y in y_positions:
        page.draw_line((x_positions[0], y), (x_positions[-1], y), color=(0.85, 0.05, 0.05))
    page.insert_text((88, 286), "Model", fontsize=11)
    page.insert_text((286, 286), "Score", fontsize=11)
    page.insert_text((88, 346), "Atlas", fontsize=11)
    page.insert_text((286, 346), "91.4", fontsize=11)
    return (
        table_rect,
        "| Model | Score |\n| --- | --- |\n| Atlas | 91.4 |",
        [table_rect],
    )


def raster_artifact(page: fitz.Page, rotation: int) -> tuple[fitz.Rect, str, list[fitz.Rect]]:
    image_document = fitz.open()
    image_page = image_document.new_page(width=360, height=180)
    image_page.draw_rect(image_page.rect, fill=(0.05, 0.35, 0.85), color=(0.05, 0.35, 0.85))
    image_page.insert_text((54, 98), "Raster evidence", fontsize=24, color=(1, 1, 1))
    pixmap = image_page.get_pixmap(alpha=False)
    source_rect = fitz.Rect(90, 230, 450, 410)
    page.insert_image(source_rect, stream=pixmap.tobytes("png"), keep_proportion=False)
    image_document.close()
    caption = f"Figure {rotation + 1}. Raster result evidence."
    page.insert_text((90, 442), caption, fontsize=11)
    caption_box = caption_rect(page, f"Figure {rotation + 1}.")
    return source_rect, caption, [source_rect, caption_box]


def vector_artifact(page: fitz.Page, rotation: int) -> tuple[fitz.Rect, str, list[fitz.Rect]]:
    points = [(96, 390), (180, 330), (270, 360), (360, 270), (450, 244)]
    page.draw_polyline(points, color=(0.05, 0.65, 0.2), width=4)
    for point in points:
        page.draw_circle(point, 5, color=(0.05, 0.65, 0.2), fill=(0.05, 0.65, 0.2))
    source_rect = fitz.Rect(91, 239, 455, 395)
    caption = f"Chart {rotation + 1}. Vector trend evidence."
    page.insert_text((92, 426), caption, fontsize=11)
    caption_box = caption_rect(page, f"Chart {rotation + 1}.")
    return source_rect, caption, [source_rect, caption_box]


def build() -> None:
    document = fitz.open()
    pages: list[dict[str, object]] = []
    builders = {
        "table": table_artifact,
        "raster": raster_artifact,
        "vector": vector_artifact,
    }
    for kind, builder in builders.items():
        for rotation in (0, 90, 180, 270):
            page = add_base_page(document, kind, rotation)
            if kind == "table":
                source_rect, text, regions = builder(page)  # type: ignore[call-arg]
            else:
                source_rect, text, regions = builder(page, rotation)  # type: ignore[call-arg]
            page.set_rotation(rotation)
            pages.append(
                {
                    "label": f"{kind}-rotation-{rotation}",
                    "pageNumber": page.number + 1,
                    "artifactKind": "pdf_table" if kind == "table" else "pdf_figure",
                    "artifactText": text,
                    "pixelClass": kind,
                    "mediaBoxPoints": pdf_user_space_box(page, page.mediabox),
                    "cropBoxPoints": pdf_user_space_box(page, page.cropbox),
                    "rotationDegrees": rotation,
                    "displayWidthPoints": page.rect.width,
                    "displayHeightPoints": page.rect.height,
                    "sourceRegion": normalized_display_region(source_rect, page),
                    "regions": [normalized_display_region(region, page) for region in regions],
                }
            )
    document.set_metadata(
        {
            "title": "AI PDF Workspace Artifact Matrix Fixture",
            "author": "AI PDF Workspace",
            "subject": "Synthetic artifact, rotation, CropBox, and pixel oracle",
        }
    )
    document.save(PDF_PATH, garbage=4, deflate=True, no_new_id=True)
    document.close()
    MANIFEST_PATH.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "coordinateBasis": "pdf_crop_box_normalized_top_left_v1",
                "cropBox": [36.0, 72.0, 576.0, 738.0],
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
