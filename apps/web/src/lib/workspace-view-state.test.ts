import assert from "node:assert/strict";
import test from "node:test";

import {
  clampEvidencePanelWidth,
  getWorkspaceViewStateForWorkspace,
  getWorkspaceViewableDocs,
} from "./workspace-view-state";
import type { Document } from "./workspace-context";

const documents: Document[] = [
  {
    id: "doc-processing",
    workspaceId: "ws-1",
    name: "processing.pdf",
    size: "1 KB",
    pagesCount: 0,
    status: "parsing",
    progress: 50,
    tags: [],
    createdAt: "2026-07-15T00:00:00Z",
  },
  {
    id: "doc-ready",
    workspaceId: "ws-1",
    name: "ready.pdf",
    size: "2 KB",
    pagesCount: 2,
    status: "ready",
    progress: 100,
    tags: [],
    createdAt: "2026-07-15T00:01:00Z",
  },
  {
    id: "doc-other-workspace",
    workspaceId: "ws-2",
    name: "other.pdf",
    size: "2 KB",
    pagesCount: 2,
    status: "ready",
    progress: 100,
    tags: [],
    createdAt: "2026-07-15T00:02:00Z",
  },
];

test("view-state preselects the first document without opening the evidence panel", () => {
  assert.deepEqual(getWorkspaceViewableDocs("ws-1", documents).map((document) => document.id), ["doc-ready"]);
  assert.deepEqual(getWorkspaceViewStateForWorkspace("ws-1", documents), {
    openDocumentIds: ["doc-ready"],
    activeDocumentId: "doc-ready",
    activePdfPage: 1,
    evidencePanelOpen: false,
    evidencePanelExpanded: false,
  });
});

test("view-state clears document selection when a workspace has no viewable documents", () => {
  assert.deepEqual(getWorkspaceViewStateForWorkspace("missing", documents), {
    openDocumentIds: [],
    activeDocumentId: null,
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
