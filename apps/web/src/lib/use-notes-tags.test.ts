import assert from "node:assert/strict";
import test from "node:test";

import { getNextTagIds, updateDocumentTagRelations, updateNoteTagRelations } from "./use-notes-tags";
import type { TagDto } from "@/lib/notes/types";

const relations: TagDto[] = [
  {
    id: "tag-1",
    workspaceId: "ws-1",
    name: "Important",
    slug: "important",
    color: "#f00",
    createdAt: "2026-07-15T00:00:00Z",
    documentIds: [],
    noteIds: [],
  },
  {
    id: "tag-2",
    workspaceId: "ws-1",
    name: "Review",
    slug: "review",
    color: "#0f0",
    createdAt: "2026-07-15T00:00:00Z",
    documentIds: ["doc-1"],
    noteIds: ["note-1"],
  },
];

test("tag toggles add and remove one binding without duplicates", () => {
  assert.deepEqual(getNextTagIds([], "tag-1"), ["tag-1"]);
  assert.deepEqual(getNextTagIds(["tag-1", "tag-2"], "tag-1"), ["tag-2"]);
  assert.deepEqual(updateDocumentTagRelations(relations, "ws-1", "doc-1", ["tag-1"])
    .map((relation) => relation.documentIds), [["doc-1"], []]);
  assert.deepEqual(updateNoteTagRelations(relations, "ws-1", "note-1", ["tag-1"])
    .map((relation) => relation.noteIds), [["note-1"], []]);
});
