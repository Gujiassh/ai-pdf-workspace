import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";

import { createEvidenceModuleRegistry, EvidenceModuleContractError } from "./registry";

const TestRenderer = () => createElement("div", null, "test renderer");

test("test-only modality registers without changing the evidence shell contract", () => {
  const registry = createEvidenceModuleRegistry([
    {
      assetKind: "test_image",
      locatorKinds: ["image_region"],
      label: "Test image",
      uploadAccept: ["application/x-test-image"],
      EvidenceRenderer: TestRenderer,
    },
  ]);

  assert.equal(
    registry.resolve("test_image", {
      kind: "image_region",
      version: 1,
      coordinateSpace: "image_normalized_top_left_v1",
      widthPixels: 100,
      heightPixels: 80,
      orientationApplied: true,
      regions: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
    }).EvidenceRenderer,
    TestRenderer,
  );
});

test("registry rejects unknown asset and cross-modality locator dispatch", () => {
  const registry = createEvidenceModuleRegistry([
    {
      assetKind: "pdf",
      locatorKinds: ["pdf_page"],
      label: "PDF",
      uploadAccept: ["application/pdf"],
      EvidenceRenderer: TestRenderer,
    },
  ]);

  assert.throws(() => registry.resolve("audio", null), EvidenceModuleContractError);
  assert.throws(
    () => registry.resolve("pdf", {
      kind: "image_region",
      version: 1,
      coordinateSpace: "image_normalized_top_left_v1",
      widthPixels: 10,
      heightPixels: 10,
      orientationApplied: true,
      regions: [{ x: 0, y: 0, width: 1, height: 1 }],
    }),
    /does not belong/,
  );
});
