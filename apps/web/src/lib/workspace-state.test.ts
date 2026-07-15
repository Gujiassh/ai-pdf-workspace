import assert from "node:assert/strict";
import test from "node:test";

import { getMessageParentId, getNextActiveThreadId } from "./use-chat";
import { getNextTagIds, updateDocumentTagRelations, updateNoteTagRelations } from "./use-notes-tags";
import { getWorkspaceViewStateForWorkspace } from "./workspace-view-state";
import type { ChatThread } from "./chat/types";
import type { Document } from "./workspace-context";

const document = (id: string, status: Document["status"]): Document => ({
  id,
  workspaceId: "ws_1",
  name: `${id}.pdf`,
  size: "1 KB",
  pagesCount: 1,
  status,
  progress: 100,
  tags: [],
  createdAt: "2026-07-15T00:00:00Z",
});

const thread = (id: string, messages: ChatThread["messages"] = []): ChatThread => ({
  id,
  workspaceId: "ws_1",
  title: id,
  createdAt: "2026-07-15T00:00:00Z",
  messages,
});

test("workspace view state opens the first viewable document only", () => {
  assert.deepEqual(
    getWorkspaceViewStateForWorkspace("ws_1", [
      document("pending", "parsing"),
      document("ready", "ready"),
      document("chunked", "chunked"),
    ]),
    { openDocumentIds: ["ready"], activeDocumentId: "ready", activePdfPage: 1 },
  );
});

test("chat parent resolution uses the edited question parent", () => {
  const messages = [
    { id: "q1", role: "user" as const, content: "first", createdAt: "1", status: "completed" as const },
    { id: "a1", role: "assistant" as const, content: "answer", createdAt: "2", status: "completed" as const },
    { id: "q2", role: "user" as const, content: "follow-up", createdAt: "3", parentMessageId: "a1", status: "completed" as const },
  ];
  const current = thread("thread", messages);

  assert.equal(getMessageParentId(current, "q2"), "a1");
  assert.equal(getMessageParentId(current), "q2");
  assert.equal(getNextActiveThreadId([thread("other")], "missing"), "other");
});

test("tag relation helpers preserve workspace isolation", () => {
  const relations = [
    { id: "tag-1", workspaceId: "ws_1", name: "one", slug: "one", color: null, createdAt: "2026-07-15T00:00:00Z", documentIds: [], noteIds: [] },
    { id: "tag-2", workspaceId: "ws_2", name: "two", slug: "two", color: null, createdAt: "2026-07-15T00:00:00Z", documentIds: ["foreign"], noteIds: ["foreign"] },
  ];

  assert.deepEqual(getNextTagIds(["tag-1"], "tag-1"), []);
  const documentRelations = updateDocumentTagRelations(relations, "ws_1", "doc-1", ["tag-1"]);
  const noteRelations = updateNoteTagRelations(documentRelations, "ws_1", "note-1", ["tag-1"]);
  assert.deepEqual(noteRelations[0]?.documentIds, ["doc-1"]);
  assert.deepEqual(noteRelations[0]?.noteIds, ["note-1"]);
  assert.deepEqual(noteRelations[1], relations[1]);
});
