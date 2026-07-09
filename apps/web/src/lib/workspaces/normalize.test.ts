import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultWorkspacePrompt,
  normalizeWorkspaceSummary,
  pickAccessibleWorkspaceId,
} from "./normalize";

test("normalizeWorkspaceSummary adds default localized prompt", () => {
  const workspace = normalizeWorkspaceSummary(
    {
      id: "ws_1",
      name: "Papers",
      description: null,
      role: "owner",
      documentCount: 0,
      noteCount: 0,
      threadCount: 0,
      createdAt: "2026-07-09T00:00:00Z",
      updatedAt: "2026-07-09T00:00:00Z",
    },
    "en",
  );

  assert.equal(workspace.systemPrompt, getDefaultWorkspacePrompt("en"));
});

test("normalizeWorkspaceSummary prefers explicit prompt override", () => {
  const workspace = normalizeWorkspaceSummary(
    {
      id: "ws_1",
      name: "Papers",
      description: null,
      role: "owner",
      documentCount: 0,
      noteCount: 0,
      threadCount: 0,
      createdAt: "2026-07-09T00:00:00Z",
      updatedAt: "2026-07-09T00:00:00Z",
    },
    "zh",
    "custom prompt",
  );

  assert.equal(workspace.systemPrompt, "custom prompt");
});

test("pickAccessibleWorkspaceId keeps current selection when still accessible", () => {
  assert.equal(
    pickAccessibleWorkspaceId(
      [
        { id: "ws_1" },
        { id: "ws_2" },
      ],
      "ws_2",
    ),
    "ws_2",
  );
});

test("pickAccessibleWorkspaceId falls back to first accessible workspace", () => {
  assert.equal(
    pickAccessibleWorkspaceId(
      [
        { id: "ws_1" },
        { id: "ws_2" },
      ],
      "missing",
    ),
    "ws_1",
  );
  assert.equal(pickAccessibleWorkspaceId([], "missing"), "");
});
