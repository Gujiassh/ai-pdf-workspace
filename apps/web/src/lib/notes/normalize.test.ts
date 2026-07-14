import assert from "node:assert/strict";
import test from "node:test";

import type { Document } from "@/lib/workspace-context";

import { applyDocumentTags, toUiNote } from "./normalize";
import type { NoteDto, TagDto } from "./types";

const document: Document = {
  id: "doc-1",
  workspaceId: "ws-1",
  name: "paper.pdf",
  size: "1 KB",
  pagesCount: 3,
  status: "ready",
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
  documentIds: ["doc-1"],
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
        documentId: "doc-1",
        documentTitle: "paper.pdf",
        pageNumber: 2,
        excerpt: "quoted text",
        createdAt: "2026-07-14T00:00:00Z",
      },
    ],
    tagIds: ["tag-1"],
  };

  const uiNote = toUiNote(note, new Map([["tag-1", { id: "tag-1", workspaceId: "ws-1", name: "重点", color: "#f97316" }]]));

  assert.equal(uiNote.source?.messageCitationId, "citation-1");
  assert.equal(uiNote.source?.pageNumber, 2);
  assert.deepEqual(uiNote.tags, ["重点"]);
});

test("applies document tag bindings from the server snapshot", () => {
  assert.deepEqual(applyDocumentTags([document], [tag])[0].tags, ["重点"]);
});
