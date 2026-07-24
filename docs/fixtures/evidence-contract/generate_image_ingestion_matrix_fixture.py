from __future__ import annotations

import hashlib
import json
from io import BytesIO
from pathlib import Path

from PIL import Image, __version__ as pillow_version

ROOT = Path(__file__).resolve().parent
FIXTURE_ROOT = ROOT / "image-ingestion-matrix"
MANIFEST_PATH = ROOT / "image-ingestion-matrix-fixture.json"
WIDTH = 48
HEIGHT = 32
MARKER_BOX = (5, 7, 17, 15)


def _base_image() -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (22, 28, 36))
    pixels = image.load()
    assert pixels is not None
    for y in range(HEIGHT):
        for x in range(WIDTH):
            pixels[x, y] = (
                (x * 19 + y * 7) % 256,
                (x * 5 + y * 31) % 256,
                (x * 37 + y * 11) % 256,
            )
    for y in range(MARKER_BOX[1], MARKER_BOX[3]):
        for x in range(MARKER_BOX[0], MARKER_BOX[2]):
            pixels[x, y] = (250, 24, 180)
    pixels[0, 0] = (255, 0, 0)
    pixels[WIDTH - 1, 0] = (0, 255, 0)
    pixels[0, HEIGHT - 1] = (0, 0, 255)
    pixels[WIDTH - 1, HEIGHT - 1] = (255, 220, 0)
    return image


def _encode_source(image: Image.Image, image_format: str, orientation: int) -> bytes:
    output = BytesIO()
    exif = Image.Exif()
    exif[274] = orientation
    options: dict[str, object] = {"exif": exif}
    if image_format == "JPEG":
        options.update(quality=95, subsampling=0, optimize=False, progressive=False)
    elif image_format == "PNG":
        options.update(optimize=False, compress_level=9)
    elif image_format == "WEBP":
        options.update(lossless=True, method=6, exact=True)
    image.save(output, image_format, **options)
    return output.getvalue()


def _source_coordinate_for_output(
    orientation: int,
    output_x: int,
    output_y: int,
) -> tuple[int, int]:
    if orientation == 1:
        return output_x, output_y
    if orientation == 2:
        return WIDTH - 1 - output_x, output_y
    if orientation == 3:
        return WIDTH - 1 - output_x, HEIGHT - 1 - output_y
    if orientation == 4:
        return output_x, HEIGHT - 1 - output_y
    if orientation == 5:
        return output_y, output_x
    if orientation == 6:
        return output_y, HEIGHT - 1 - output_x
    if orientation == 7:
        return WIDTH - 1 - output_y, HEIGHT - 1 - output_x
    if orientation == 8:
        return WIDTH - 1 - output_y, output_x
    raise ValueError(f"Unsupported orientation: {orientation}")


def _manual_orientation(image: Image.Image, orientation: int) -> Image.Image:
    output_size = (WIDTH, HEIGHT) if orientation <= 4 else (HEIGHT, WIDTH)
    output = Image.new("RGB", output_size)
    source_pixels = image.load()
    output_pixels = output.load()
    assert source_pixels is not None and output_pixels is not None
    for output_y in range(output.height):
        for output_x in range(output.width):
            source_x, source_y = _source_coordinate_for_output(
                orientation,
                output_x,
                output_y,
            )
            output_pixels[output_x, output_y] = source_pixels[source_x, source_y]
    return output


def _oriented_box(orientation: int) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = MARKER_BOX
    if orientation == 1:
        return x0, y0, x1, y1
    if orientation == 2:
        return WIDTH - x1, y0, WIDTH - x0, y1
    if orientation == 3:
        return WIDTH - x1, HEIGHT - y1, WIDTH - x0, HEIGHT - y0
    if orientation == 4:
        return x0, HEIGHT - y1, x1, HEIGHT - y0
    if orientation == 5:
        return y0, x0, y1, x1
    if orientation == 6:
        return HEIGHT - y1, x0, HEIGHT - y0, x1
    if orientation == 7:
        return HEIGHT - y1, WIDTH - x1, HEIGHT - y0, WIDTH - x0
    if orientation == 8:
        return y0, WIDTH - x1, y1, WIDTH - x0
    raise ValueError(f"Unsupported orientation: {orientation}")


def _canonical_png(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, "PNG", optimize=False, compress_level=9)
    return output.getvalue()


def _pixel_sha256(image: Image.Image) -> str:
    header = f"RGB:{image.width}x{image.height}\0".encode("ascii")
    return hashlib.sha256(header + image.tobytes()).hexdigest()


def _normalized_box(box: tuple[int, int, int, int], width: int, height: int) -> dict[str, float]:
    x0, y0, x1, y1 = box
    return {
        "x": round(x0 / width, 6),
        "y": round(y0 / height, 6),
        "width": round((x1 - x0) / width, 6),
        "height": round((y1 - y0) / height, 6),
    }


def _build_case(
    base: Image.Image,
    *,
    filename: str,
    image_format: str,
    mime_type: str,
    orientation: int,
) -> dict[str, object]:
    source = _encode_source(base, image_format, orientation)
    path = FIXTURE_ROOT / filename
    path.write_bytes(source)
    with Image.open(BytesIO(source)) as decoded:
        decoded.load()
        decoded_rgb = decoded.convert("RGB")
    normalized = _manual_orientation(decoded_rgb, orientation)
    normalized_bytes = _canonical_png(normalized)
    marker_box = _oriented_box(orientation)
    return {
        "filename": str(path.relative_to(ROOT)),
        "declaredMimeType": mime_type,
        "detectedFormat": image_format,
        "sourceSha256": hashlib.sha256(source).hexdigest(),
        "sourceWidthPixels": WIDTH,
        "sourceHeightPixels": HEIGHT,
        "exifOrientation": orientation,
        "normalizedWidthPixels": normalized.width,
        "normalizedHeightPixels": normalized.height,
        "orientationApplied": True,
        "normalizedObjectSha256": hashlib.sha256(normalized_bytes).hexdigest(),
        "normalizedPixelSha256": _pixel_sha256(normalized),
        "markerBoxPixels": list(marker_box),
        "markerRegion": _normalized_box(marker_box, normalized.width, normalized.height),
    }


def build() -> None:
    FIXTURE_ROOT.mkdir(exist_ok=True)
    base = _base_image()
    cases = [
        _build_case(
            base,
            filename="control.png",
            image_format="PNG",
            mime_type="image/png",
            orientation=1,
        ),
        _build_case(
            base,
            filename="control.webp",
            image_format="WEBP",
            mime_type="image/webp",
            orientation=1,
        ),
    ]
    cases.extend(
        _build_case(
            base,
            filename=f"orientation-{orientation}.jpg",
            image_format="JPEG",
            mime_type="image/jpeg",
            orientation=orientation,
        )
        for orientation in range(1, 9)
    )
    MANIFEST_PATH.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "coordinateStatus": "approved-image-orientation-fixture-v1",
                "coordinateSpace": "image_normalized_top_left_v1",
                "generator": {
                    "name": Path(__file__).name,
                    "pillowVersion": pillow_version,
                },
                "cases": cases,
            },
            ensure_ascii=True,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()
