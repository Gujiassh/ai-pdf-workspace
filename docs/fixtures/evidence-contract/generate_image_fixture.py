from __future__ import annotations

import hashlib
import json
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parent
IMAGE_PATH = ROOT / "image-coordinate-fixture.png"
MANIFEST_PATH = ROOT / "image-coordinate-fixture.json"
WIDTH = 1200
HEIGHT = 800


def normalized(rect: fitz.Rect) -> dict[str, float]:
    return {
        "x": round(rect.x0 / WIDTH, 6),
        "y": round(rect.y0 / HEIGHT, 6),
        "width": round(rect.width / WIDTH, 6),
        "height": round(rect.height / HEIGHT, 6),
    }


def build() -> None:
    document = fitz.open()
    page = document.new_page(width=WIDTH, height=HEIGHT)
    page.draw_rect(page.rect, color=(0.08, 0.1, 0.14), fill=(0.96, 0.97, 0.95))
    page.insert_text((72, 88), "Image Evidence Fixture", fontsize=30, color=(0.08, 0.1, 0.14))
    page.insert_text(
        (72, 124),
        "Synthetic non-confidential chart and caption regions",
        fontsize=15,
        color=(0.25, 0.3, 0.35),
    )

    chart_rect = fitz.Rect(80, 190, 760, 610)
    page.draw_rect(chart_rect, color=(0.2, 0.25, 0.3), fill=(1, 1, 1), width=2)
    page.draw_line((140, 540), (700, 540), color=(0.3, 0.35, 0.4), width=2)
    page.draw_line((140, 250), (140, 540), color=(0.3, 0.35, 0.4), width=2)
    points = [(160, 500), (270, 450), (380, 470), (490, 350), (600, 290), (680, 260)]
    page.draw_polyline(points, color=(0.04, 0.48, 0.48), width=7)
    for point in points:
        page.draw_circle(point, 8, color=(0.04, 0.48, 0.48), fill=(0.04, 0.48, 0.48))
    page.insert_text((150, 225), "Latency falls after the third release", fontsize=17)

    caption_rect = fitz.Rect(820, 220, 1120, 520)
    page.draw_rect(caption_rect, color=(0.75, 0.45, 0.08), fill=(1, 0.97, 0.9), width=2)
    page.insert_text((850, 270), "Observation", fontsize=22, color=(0.5, 0.27, 0.02))
    page.insert_text((850, 320), "Release 4 begins", fontsize=16)
    page.insert_text((850, 350), "the sustained drop.", fontsize=16)
    page.insert_text((850, 410), "Verify chart and", fontsize=16)
    page.insert_text((850, 440), "caption together.", fontsize=16)

    pixmap = page.get_pixmap(alpha=False)
    pixmap.save(IMAGE_PATH)
    document.close()

    image_sha256 = hashlib.sha256(IMAGE_PATH.read_bytes()).hexdigest()
    MANIFEST_PATH.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "coordinateStatus": "approved-contract-fixture-v1",
                "coordinateSpace": "image_normalized_top_left_v1",
                "image": {
                    "filename": IMAGE_PATH.name,
                    "widthPixels": WIDTH,
                    "heightPixels": HEIGHT,
                    "orientationApplied": True,
                    "sha256": image_sha256,
                },
                "regions": [
                    {"label": "chart", **normalized(chart_rect)},
                    {"label": "caption", **normalized(caption_rect)},
                ],
            },
            ensure_ascii=True,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()
