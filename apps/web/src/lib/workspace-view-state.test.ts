import assert from "node:assert/strict";
import test from "node:test";

import {
  clampEvidencePanelWidth,
  getWorkspaceViewStateForWorkspace,
  getWorkspaceViewableAssets,
} from "./workspace-view-state";
import type { Asset } from "./workspace-context";

const assets: Asset[] = [
  {
    id: "doc-processing",
    workspaceId: "ws-1",
    kind: "pdf",
    title: "processing",
    sourceFilename: "processing.pdf",
    mimeType: "application/pdf",
    size: "1 KB",
    status: "parsing",
    currentProcessingGeneration: 1,
    progress: 50,
    tags: [],
    createdAt: "2026-07-15T00:00:00Z",
  },
  {
    id: "doc-ready",
    workspaceId: "ws-1",
    kind: "pdf",
    title: "ready",
    sourceFilename: "ready.pdf",
    mimeType: "application/pdf",
    size: "2 KB",
    status: "ready",
    currentProcessingGeneration: 1,
    progress: 100,
    tags: [],
    createdAt: "2026-07-15T00:01:00Z",
  },
  {
    id: "doc-other-workspace",
    workspaceId: "ws-2",
    kind: "pdf",
    title: "other",
    sourceFilename: "other.pdf",
    mimeType: "application/pdf",
    size: "2 KB",
    status: "ready",
    currentProcessingGeneration: 1,
    progress: 100,
    tags: [],
    createdAt: "2026-07-15T00:02:00Z",
  },
];

test("view-state preselects the first asset without opening the evidence panel", () => {
  assert.deepEqual(getWorkspaceViewableAssets("ws-1", assets).map((asset) => asset.id), ["doc-ready"]);
  assert.deepEqual(getWorkspaceViewStateForWorkspace("ws-1", assets), {
    openAssetIds: ["doc-ready"],
    activeAssetId: "doc-ready",
    activePdfPage: 1,
    evidencePanelOpen: false,
    evidencePanelExpanded: false,
  });
});

test("view-state clears asset selection when a workspace has no viewable assets", () => {
  assert.deepEqual(getWorkspaceViewStateForWorkspace("missing", assets), {
    openAssetIds: [],
    activeAssetId: null,
    activePdfPage: 1,
    evidencePanelOpen: false,
    evidencePanelExpanded: false,
  });
});

test("evidence panel resizing preserves both evidence and chat minimum widths", () => {
  assert.equal(clampEvidencePanelWidth(200, 1152), 400);
  assert.equal(clampEvidencePanelWidth(640, 1152), 640);
  assert.equal(clampEvidencePanelWidth(900, 1152), 712);
  assert.equal(clampEvidencePanelWidth(1200, 1800), 920);
});
