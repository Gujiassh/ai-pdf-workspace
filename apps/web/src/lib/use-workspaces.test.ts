import assert from "node:assert/strict";
import test from "node:test";

import { getNextWorkspaceIdAfterDeletion, shouldSyncWorkspaceViewState } from "./use-workspaces";
import type { Workspace } from "./workspace-context";

const workspaces: Workspace[] = [
  {
    id: "ws-1",
    name: "First",
    description: null,
    role: "owner",
    systemPrompt: "prompt",
    retrievalTopK: 6,
    chunkSize: 1200,
    embeddingProvider: "ollama",
    embeddingModel: "embed",
    embeddingDimensions: 1024,
    embeddingVersion: "v1",
    generationProvider: "openai",
    generationModel: "chat",
    documentCount: 0,
    noteCount: 0,
    threadCount: 0,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  },
  {
    id: "ws-2",
    name: "Second",
    description: null,
    role: "owner",
    systemPrompt: "prompt",
    retrievalTopK: 6,
    chunkSize: 1200,
    embeddingProvider: "ollama",
    embeddingModel: "embed",
    embeddingDimensions: 1024,
    embeddingVersion: "v1",
    generationProvider: "openai",
    generationModel: "chat",
    documentCount: 0,
    noteCount: 0,
    threadCount: 0,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  },
];

test("workspace deletion chooses the first remaining workspace only when deleting the active one", () => {
  assert.equal(getNextWorkspaceIdAfterDeletion(workspaces, "ws-1", "ws-1"), "ws-2");
  assert.equal(getNextWorkspaceIdAfterDeletion(workspaces, "ws-2", "ws-2"), "ws-1");
  assert.equal(getNextWorkspaceIdAfterDeletion(workspaces, "ws-1", "ws-2"), "ws-1");
  assert.equal(getNextWorkspaceIdAfterDeletion([workspaces[0]], "ws-1", "ws-1"), "");
});

test("workspace selection does not reset view state when selecting the current workspace again", () => {
  assert.equal(shouldSyncWorkspaceViewState("ws-1", "ws-1"), false);
  assert.equal(shouldSyncWorkspaceViewState("", "ws-1"), true);
  assert.equal(shouldSyncWorkspaceViewState("ws-1", "ws-2"), true);
  assert.equal(shouldSyncWorkspaceViewState("ws-1", ""), true);
});
