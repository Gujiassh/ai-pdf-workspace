# Evidence Contract Fixtures

This directory contains synthetic, non-confidential fixtures for the approved PDF + Image Evidence contract and its migration review history.

- `pdf-coordinate-fixture.pdf`: rotation, asymmetric CropBox combined with every supported rotation, table, vector chart, in-page raster image, same-page multi-region, and raster scan cases.
- `pdf-coordinate-fixture.json`: approved PDF.js-compatible CropBox geometry and regions normalized in rotated display space.
- `generate_fixture.py`: deterministic generator using the Worker's existing PyMuPDF dependency.
- `pdf-artifact-matrix-fixture.pdf` and `.json`: table/raster/vector artifacts combined with rotations 0/90/180/270 and the same asymmetric CropBox; colored source pixels provide an independent rendered-bbox oracle.
- `generate_artifact_matrix_fixture.py`: deterministic generator for the 12-page adversarial artifact matrix.
- `image-coordinate-fixture.png`: full-resolution image with chart and caption regions.
- `image-coordinate-fixture.json`: image geometry, SHA-256, and normalized expected regions.
- `generate_image_fixture.py`: deterministic image fixture generator.
- `image-ingestion-matrix/` and `image-ingestion-matrix-fixture.json`: static PNG/lossless WebP controls plus JPEG EXIF Orientation 1-8 sources with frozen source/object/pixel hashes, oriented dimensions, and independently transformed marker regions.
- `generate_image_ingestion_matrix_fixture.py`: Pillow 12.3.0 generator whose pixel mapping uses explicit Orientation 1-8 coordinate formulas rather than the production `ImageOps.exif_transpose` path.
- `current-citation.json` and `current-note-source.json`: pre-migration Document contract baselines retained for migration review.
- `proposed-page-*.draft.json`: mechanical current page-citation migration examples.
- `image-citation.json` and `image-note-source.json`: current approved Image Evidence DTO fixtures, loaded by the M303 historical snapshot tests.
- `proposed-chat-request.draft.json`: selected Asset scope request example.
- Other `proposed-*.draft.json` files: historical design-review payloads. Draft files are not runtime API schemas.

The manifests describe approved v1 display-space geometry for deterministic contract tests. The base 12-page PDF fixture combines one asymmetric CropBox with rotations 0/90/180/270 so PyMuPDF top-left coordinates cannot be confused with PDF.js user-space `page.view`; pages 9-12 then cover table, vector-chart, in-page-image, and full-page scan behavior. The artifact matrix adds the missing cross-product of table/raster/vector with every rotation and the same asymmetric CropBox, plus rendered colored-pixel comparisons. Rotated and artifact regions are already normalized in the rendered CropBox space. Runtime validation remains owned by typed schemas and modality codecs; historical `.draft.json` payloads must not be used as schemas.

The two PDF generators intentionally retain their frozen pre-Citeframe document metadata so regeneration preserves the Phase 2 SHA-256 oracles; those metadata strings are not current product branding.

Regenerate from the repository root:

```bash
apps/worker/.venv/bin/python docs/fixtures/evidence-contract/generate_fixture.py
apps/worker/.venv/bin/python docs/fixtures/evidence-contract/generate_artifact_matrix_fixture.py
apps/worker/.venv/bin/python docs/fixtures/evidence-contract/generate_image_fixture.py
apps/worker/.venv/bin/python docs/fixtures/evidence-contract/generate_image_ingestion_matrix_fixture.py
```
