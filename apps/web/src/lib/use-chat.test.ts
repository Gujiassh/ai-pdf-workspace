import assert from "node:assert/strict";
import test from "node:test";

import { getMessageParentId, getNextActiveThreadId, replaceUiThread } from "./use-chat";
import type { ChatThread } from "@/lib/chat/types";

const threads: ChatThread[] = [
  {
    id: "thread-1",
    workspaceId: "ws-1",
    title: "First",
    createdAt: "2026-07-15T00:00:00Z",
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "Question",
        createdAt: "2026-07-15T00:00:00Z",
        parentMessageId: null,
      },
      {
        id: "message-2",
        role: "assistant",
        content: "Answer",
        createdAt: "2026-07-15T00:01:00Z",
        parentMessageId: "message-1",
      },
    ],
  },
];

test("chat hydration keeps the active thread when it remains in the workspace", () => {
  assert.equal(getNextActiveThreadId(threads, "thread-1"), "thread-1");
  assert.equal(getNextActiveThreadId(threads, "missing"), "thread-1");
  assert.equal(getNextActiveThreadId([], "missing"), null);
});

test("chat parent selection preserves branch editing semantics", () => {
  assert.equal(getMessageParentId(threads[0], "message-2"), "message-1");
  assert.equal(getMessageParentId(threads[0]), "message-2");
  assert.equal(getMessageParentId(undefined), null);
});


test("replacing hydrated chat threads preserves sibling messages and workspace isolation", () => {
  const threadA: ChatThread = {
    ...threads[0],
    id: "thread-a",
    title: "A",
    messages: [{ ...threads[0].messages[0], id: "a-message", content: "A message" }],
  };
  const threadB: ChatThread = {
    ...threads[0],
    id: "thread-b",
    title: "B",
    messages: [{ ...threads[0].messages[0], id: "b-message", content: "B message" }],
  };

  const afterBReplacement = replaceUiThread(
    [threadA, threadB],
    { ...threadB, messages: [{ ...threadB.messages[0], content: "B refreshed" }] },
  );

  assert.deepEqual(afterBReplacement.find((thread) => thread.id === "thread-a")?.messages, threadA.messages);
  assert.equal(afterBReplacement.find((thread) => thread.id === "thread-b")?.messages[0]?.content, "B refreshed");

  const afterAReplacement = replaceUiThread(
    afterBReplacement,
    { ...threadA, messages: [{ ...threadA.messages[0], content: "A refreshed" }] },
  );

  assert.equal(afterAReplacement.length, 2);
  assert.equal(afterAReplacement.find((thread) => thread.id === "thread-a")?.messages[0]?.content, "A refreshed");
  assert.equal(afterAReplacement.find((thread) => thread.id === "thread-b")?.messages[0]?.content, "B refreshed");

  const sameIdOtherWorkspace = { ...threadA, workspaceId: "ws-2", messages: [{ ...threadA.messages[0], content: "Other workspace" }] };
  const afterForeignReplacement = replaceUiThread(afterAReplacement, sameIdOtherWorkspace);

  assert.equal(afterForeignReplacement.length, 3);
  assert.equal(afterForeignReplacement.find((thread) => thread.workspaceId === "ws-1" && thread.id === "thread-a")?.messages[0]?.content, "A refreshed");
  assert.equal(afterForeignReplacement.find((thread) => thread.workspaceId === "ws-2" && thread.id === "thread-a")?.messages[0]?.content, "Other workspace");
});
