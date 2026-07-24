import assert from "node:assert/strict";
import test from "node:test";

import { getMessageParentId, getNextActiveThreadId } from "./use-chat";
import { getNextTagIds, updateAssetTagRelations, updateNoteTagRelations } from "./use-notes-tags";
import { getWorkspaceViewStateForWorkspace } from "./workspace-view-state";
import type { ChatThread } from "./chat/types";
import type { Asset } from "./workspace-context";

const asset = (id: string, status: Asset["status"]): Asset => ({
  id,
  workspaceId: "ws_1",
  kind: "pdf",
  title: id,
  sourceFilename: `${id}.pdf`,
  mimeType: "application/pdf",
  size: "1 KB",
  status,
  currentProcessingGeneration: 1,
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

test("workspace view state opens the first viewable asset only", () => {
  assert.deepEqual(
    getWorkspaceViewStateForWorkspace("ws_1", [
      asset("pending", "parsing"),
      asset("ready", "ready"),
      asset("chunked", "chunked"),
    ]),
    {
      openAssetIds: ["ready"],
      activeAssetId: "ready",
      activePdfPage: 1,
      evidencePanelOpen: false,
      evidencePanelExpanded: false,
    },
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
    { id: "tag-1", workspaceId: "ws_1", name: "one", slug: "one", color: null, createdAt: "2026-07-15T00:00:00Z", assetIds: [], noteIds: [] },
    { id: "tag-2", workspaceId: "ws_2", name: "two", slug: "two", color: null, createdAt: "2026-07-15T00:00:00Z", assetIds: ["foreign"], noteIds: ["foreign"] },
  ];

  assert.deepEqual(getNextTagIds(["tag-1"], "tag-1"), []);
  const assetRelations = updateAssetTagRelations(relations, "ws_1", "doc-1", ["tag-1"]);
  const noteRelations = updateNoteTagRelations(assetRelations, "ws_1", "note-1", ["tag-1"]);
  assert.deepEqual(noteRelations[0]?.assetIds, ["doc-1"]);
  assert.deepEqual(noteRelations[0]?.noteIds, ["note-1"]);
  assert.deepEqual(noteRelations[1], relations[1]);
});
