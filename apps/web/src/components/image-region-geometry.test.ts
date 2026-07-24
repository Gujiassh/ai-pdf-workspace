import assert from "node:assert/strict";
import test from "node:test";

import type { AssetDetailResponseDto } from "@/lib/assets/types";
import type { ImageRegionLocator, SourceVersions } from "@/lib/evidence/types";
import {
  calculatePinchZoom,
  buildOrientedImageUrl,
  buildCurrentOrientedImageUrl,
  createImageRegion,
  isImageNaturalSizeCompatible,
  isValidImageEvidenceSnapshot,
  moveNormalizedImagePoint,
  normalizeImagePoint,
  readCurrentImageGeometry,
  resolveImageViewerSource,
} from "./image-region-geometry";

const locator: ImageRegionLocator = {
  kind: "image_region",
  version: 1,
  coordinateSpace: "image_normalized_top_left_v1",
  widthPixels: 1200,
  heightPixels: 800,
  orientationApplied: true,
  regions: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
};
const sourceVersions: SourceVersions = {
  parserVersion: "image-caption-v1",
  processingGeneration: 3,
  representationId: "caption/id 3",
  indexVersion: 1,
};

const currentDetail: AssetDetailResponseDto = {
  asset: {
    id: "asset/id",
    workspaceId: "workspace/id",
    kind: "image",
    title: "Evidence image",
    sourceFilename: "evidence.png",
    mimeType: "image/png",
    byteSize: 1234,
    status: "ready",
    currentProcessingGeneration: 4,
    currentIndexVersion: 1,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: "2026-07-18T00:00:00Z",
    updatedAt: "2026-07-18T00:00:00Z",
  },
  detail: {
    kind: "image",
    widthPixels: 1200,
    heightPixels: 800,
    orientationApplied: true,
  },
};

test("image evidence snapshot requires canonical oriented geometry and frozen generation", () => {
  assert.equal(isValidImageEvidenceSnapshot(locator, sourceVersions), true);
  assert.equal(isValidImageEvidenceSnapshot({ ...locator, orientationApplied: false }, sourceVersions), false);
  assert.equal(isValidImageEvidenceSnapshot({ ...locator, widthPixels: 0 }, sourceVersions), false);
  assert.equal(isValidImageEvidenceSnapshot({
    ...locator,
    regions: [{ x: 0.8, y: 0.2, width: 0.3, height: 0.4 }],
  }, sourceVersions), false);
  assert.equal(isValidImageEvidenceSnapshot(locator, {
    ...sourceVersions,
    processingGeneration: 0,
  }), false);
});

test("oriented image URL contains the Evidence representation and frozen generation", () => {
  const url = buildOrientedImageUrl("workspace/id", "asset/id", sourceVersions);
  assert.match(url, /^\/api\/workspaces\/workspace%2Fid\/assets\/asset%2Fid\/representations\/image-oriented\/file\?/);
  const query = new URL(`http://localhost${url}`).searchParams;
  assert.equal(query.get("processingGeneration"), "3");
  assert.equal(query.get("evidenceRepresentationId"), "caption/id 3");
  assert.equal(url.includes(sourceVersions.parserVersion), false);
});

test("current oriented image URL contains only the server-selected Asset generation", () => {
  const url = buildCurrentOrientedImageUrl("workspace/id", "asset/id", 4);
  const query = new URL(`http://localhost${url}`).searchParams;
  assert.equal(query.get("processingGeneration"), "4");
  assert.equal(query.has("evidenceRepresentationId"), false);
  assert.match(url, /current-image-oriented\/file/);
});

test("current viewer source trusts refreshed detail generation instead of a stale list snapshot", () => {
  const currentGeometry = readCurrentImageGeometry(currentDetail, "workspace/id", "asset/id");
  assert.ok(currentGeometry);
  assert.equal(currentGeometry.processingGeneration, 4);
  assert.equal(
    readCurrentImageGeometry({
      ...currentDetail,
      detail: {
        kind: "image",
        widthPixels: 1200,
        heightPixels: 800,
        orientationApplied: false,
      },
    }, "workspace/id", "asset/id"),
    null,
  );

  const source = resolveImageViewerSource({
    workspaceId: "workspace/id",
    assetId: "asset/id",
    locator: null,
    sourceVersions: null,
    currentGeometry,
  });
  assert.equal(source.status, "ready");
  assert.equal(source.status === "ready" ? source.mode : null, "current");
  assert.equal(
    new URL(`http://localhost${source.status === "ready" ? source.url : ""}`).searchParams.get("processingGeneration"),
    "4",
  );
});

test("frozen viewer source never falls back to current geometry", () => {
  const frozen = resolveImageViewerSource({
    workspaceId: "workspace/id",
    assetId: "asset/id",
    locator,
    sourceVersions,
    currentGeometry: {
      workspaceId: "workspace/id",
      assetId: "asset/id",
      processingGeneration: 99,
      widthPixels: 10,
      heightPixels: 10,
      orientationApplied: true,
    },
  });
  assert.equal(frozen.status, "ready");
  assert.equal(frozen.status === "ready" ? frozen.mode : null, "frozen");
  assert.equal(
    new URL(`http://localhost${frozen.status === "ready" ? frozen.url : ""}`).searchParams.get("processingGeneration"),
    "3",
  );
  assert.deepEqual(frozen.status === "ready" ? frozen.geometry : null, locator);

  assert.deepEqual(resolveImageViewerSource({
    workspaceId: "workspace/id",
    assetId: "asset/id",
    locator,
    sourceVersions: null,
    currentGeometry: null,
  }), { status: "invalid" });
});

test("image geometry rejects display bytes with dimensions outside the frozen locator", () => {
  assert.equal(isImageNaturalSizeCompatible(locator, 1200, 800), true);
  assert.equal(isImageNaturalSizeCompatible(locator, 800, 1200), false);
});

test("image selection normalizes reverse drags and rejects accidental clicks", () => {
  assert.deepEqual(
    normalizeImagePoint(350, 250, { left: 100, top: 50, width: 500, height: 400 }),
    { x: 0.5, y: 0.5 },
  );
  assert.deepEqual(
    createImageRegion(
      { x: 0.8, y: 0.7 },
      { x: 0.2, y: 0.3 },
      { width: 1200, height: 800 },
    ),
    { x: 0.2, y: 0.3, width: 0.6000000000000001, height: 0.39999999999999997 },
  );
  assert.equal(
    createImageRegion(
      { x: 0.1, y: 0.1 },
      { x: 0.105, y: 0.105 },
      { width: 1200, height: 800 },
    ),
    null,
  );
});

test("touch zoom and keyboard cursor movement stay within viewer bounds", () => {
  assert.equal(calculatePinchZoom(100, 100, 250, 10, 400), 250);
  assert.equal(calculatePinchZoom(300, 100, 200, 10, 400), 400);
  assert.equal(calculatePinchZoom(25, 100, 10, 10, 400), 10);
  assert.deepEqual(moveNormalizedImagePoint({ x: 0.98, y: 0.01 }, 0.05, -0.05), {
    x: 1,
    y: 0,
  });
});
