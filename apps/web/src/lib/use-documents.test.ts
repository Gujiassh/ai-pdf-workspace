import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDocumentSize,
  getDocumentProgress,
  normalizeDocumentStatus,
  replaceDocumentsForWorkspace,
} from "./use-documents";
import type { Document } from "./workspace-context";

const document = (id: string, workspaceId: string): Document => ({
  id,
  workspaceId,
  name: `${id}.pdf`,
  size: "1 KB",
  pagesCount: 1,
  status: "ready",
  progress: 100,
  tags: [],
  createdAt: "2026-07-15T00:00:00Z",
});

test("document status mapping keeps progress semantics stable", () => {
  assert.equal(normalizeDocumentStatus("unknown"), "failed");
  assert.equal(getDocumentProgress("parsing"), 50);
  assert.equal(getDocumentProgress("embedding"), 90);
  assert.equal(getDocumentProgress("ready"), 100);
  assert.equal(formatDocumentSize(1024), "1 KB");
  assert.equal(formatDocumentSize(1024 * 1024), "1.0 MB");
});

test("document hydrate replacement changes only the requested workspace", () => {
  const previous = [document("old-1", "ws-1"), document("keep-1", "ws-2")];
  const next = replaceDocumentsForWorkspace("ws-1", [document("fresh-1", "ws-1")], previous);
  assert.deepEqual(next.map((item) => item.id), ["keep-1", "fresh-1"]);
});
