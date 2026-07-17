# Evidence Contract Fixtures

This directory contains synthetic, non-confidential fixtures for reviewing the Draft PDF Evidence contract.

- `pdf-coordinate-fixture.pdf`: rotation, CropBox, table, chart, same-page multi-region, and raster scan cases.
- `pdf-coordinate-fixture.json`: expected page labels and normalized regions in the coordinate basis named for each page.
- `generate_fixture.py`: deterministic generator using the Worker's existing PyMuPDF dependency.
- `current-citation.json` and `current-note-source.json`: fixtures matching the current API contract.
- `proposed-*.draft.json`: design-only payloads for comparing the RFC proposal. They are not API schemas or implementation authorization.

The manifest describes source-space geometry for design tests. It does not approve `pdf_crop_box_normalized_top_left_v1`, and it must not be used as a production migration contract until the RFC decisions are approved.

Regenerate from the repository root:

```bash
apps/worker/.venv/bin/python docs/fixtures/evidence-contract/generate_fixture.py
```
