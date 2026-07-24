import assert from "node:assert/strict";
import test from "node:test";

import type { Asset } from "@/lib/workspace-context";

import { applyAssetTags, toUiNote } from "./normalize";
import type { NoteDto, TagDto } from "./types";

const asset: Asset = {
  id: "doc-1",
  workspaceId: "ws-1",
  kind: "pdf",
  title: "paper",
  sourceFilename: "paper.pdf",
  mimeType: "application/pdf",
  size: "1 KB",
  status: "ready",
  currentProcessingGeneration: 1,
  progress: 100,
  tags: [],
  createdAt: "2026-07-14T00:00:00Z",
};

const tag: TagDto = {
  id: "tag-1",
  workspaceId: "ws-1",
  name: "重点",
  slug: "重点",
  color: "#f97316",
  createdAt: "2026-07-14T00:00:00Z",
  assetIds: ["doc-1"],
  noteIds: ["note-1"],
};

test("maps persisted note source snapshots and tag ids to the UI shape", () => {
  const note: NoteDto = {
    id: "note-1",
    workspaceId: "ws-1",
    title: "方法总结",
    bodyMd: "正文",
    isPinned: false,
    createdAt: "2026-07-14T00:00:00Z",
    updatedAt: "2026-07-14T00:00:00Z",
    sources: [
      {
        id: "source-1",
        messageCitationId: "citation-1",
        assetId: "doc-1",
        assetKind: "pdf",
        assetTitle: "paper.pdf",
        sourceAvailable: true,
        excerpt: "quoted text",
        locator: { kind: "pdf_page", version: 1, pageNumber: 2 },
        sourceVersions: {
          parserVersion: "parser-v1",
          processingGeneration: 1,
          representationId: "representation-1",
          indexVersion: 1,
        },
        createdAt: "2026-07-14T00:00:00Z",
      },
    ],
    tagIds: ["tag-1"],
  };

  const uiNote = toUiNote(note, new Map([["tag-1", { id: "tag-1", workspaceId: "ws-1", name: "重点", color: "#f97316" }]]));

  assert.equal(uiNote.source?.messageCitationId, "citation-1");
  assert.deepEqual(uiNote.source?.locator, { kind: "pdf_page", version: 1, pageNumber: 2 });
  assert.deepEqual(uiNote.tags, ["重点"]);
});

test("applies asset tag bindings from the server snapshot", () => {
  assert.deepEqual(applyAssetTags([asset], [tag])[0].tags, ["重点"]);
});
