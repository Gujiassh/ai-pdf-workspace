import assert from "node:assert/strict";
import test from "node:test";

import {
  createSurfaceRegion,
  isPdfGeometryCompatible,
  normalizeSurfacePoint,
} from "./pdf-region-geometry";

const geometry = {
  cropBoxPoints: [0, 0, 612, 792] as [number, number, number, number],
  rotationDegrees: 0,
  displayWidthPoints: 612,
  displayHeightPoints: 792,
};

test("PDF region geometry accepts bounded floating-point drift", () => {
  assert.equal(isPdfGeometryCompatible(geometry, {
    ...geometry,
    cropBoxPoints: [0, 0, 612.2, 791.8],
  }), true);
});

test("PDF region geometry rejects rotation and CropBox mismatches", () => {
  assert.equal(isPdfGeometryCompatible(geometry, { ...geometry, rotationDegrees: 90 }), false);
  assert.equal(isPdfGeometryCompatible(geometry, {
    ...geometry,
    cropBoxPoints: [0, 0, 600, 792],
  }), false);
});

test("PDF region selection normalizes and clamps pointer coordinates", () => {
  assert.deepEqual(
    normalizeSurfacePoint(350, 250, { left: 100, top: 50, width: 500, height: 400 }),
    { x: 0.5, y: 0.5 },
  );
  assert.deepEqual(
    normalizeSurfacePoint(50, 500, { left: 100, top: 50, width: 500, height: 400 }),
    { x: 0, y: 1 },
  );
});

test("PDF region selection supports reverse drag and rejects accidental clicks", () => {
  const region = createSurfaceRegion(
    { x: 0.8, y: 0.7 },
    { x: 0.2, y: 0.3 },
    { width: 1000, height: 800 },
  );
  assert.ok(region);
  assert.ok(Math.abs(region.x - 0.2) < Number.EPSILON);
  assert.ok(Math.abs(region.y - 0.3) < Number.EPSILON);
  assert.ok(Math.abs(region.width - 0.6) < 1e-12);
  assert.ok(Math.abs(region.height - 0.4) < 1e-12);
  assert.equal(
    createSurfaceRegion(
      { x: 0.1, y: 0.1 },
      { x: 0.105, y: 0.105 },
      { width: 1000, height: 800 },
    ),
    null,
  );
});
