import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAssetSize,
  getAssetProgress,
  normalizeAssetStatus,
  replaceAssetsForWorkspace,
} from "./use-assets";
import type { Asset } from "./workspace-context";

const asset = (id: string, workspaceId: string): Asset => ({
  id,
  workspaceId,
  kind: "pdf",
  title: id,
  sourceFilename: `${id}.pdf`,
  mimeType: "application/pdf",
  size: "1 KB",
  status: "ready",
  currentProcessingGeneration: 1,
  progress: 100,
  tags: [],
  createdAt: "2026-07-15T00:00:00Z",
});

test("asset status mapping keeps progress semantics stable", () => {
  assert.equal(normalizeAssetStatus("unknown"), "failed");
  assert.equal(getAssetProgress("parsing"), 50);
  assert.equal(getAssetProgress("embedding"), 90);
  assert.equal(normalizeAssetStatus("deleting"), "deleting");
  assert.equal(getAssetProgress("deleting"), 100);
  assert.equal(getAssetProgress("ready"), 100);
  assert.equal(formatAssetSize(1024), "1 KB");
  assert.equal(formatAssetSize(1024 * 1024), "1.0 MB");
});

test("asset hydrate replacement changes only the requested workspace", () => {
  const previous = [asset("old-1", "ws-1"), asset("keep-1", "ws-2")];
  const next = replaceAssetsForWorkspace("ws-1", [asset("fresh-1", "ws-1")], previous);
  assert.deepEqual(next.map((item) => item.id), ["keep-1", "fresh-1"]);
});

test("asset polling reuses unchanged snapshots and array references", () => {
  const active = asset("active-1", "ws-1");
  const other = asset("keep-1", "ws-2");
  const previous = [other, active];
  const refreshed = replaceAssetsForWorkspace(
    "ws-1",
    [{ ...active }],
    previous,
  );

  assert.equal(refreshed, previous);
  assert.equal(refreshed[0], other);
  assert.equal(refreshed[1], active);
});
