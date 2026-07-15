import assert from "node:assert/strict";
import test from "node:test";

import { mergeUiThreads, toUiCitation, toUiMessage, toUiThread, toUiThreadWithMessages } from "./normalize";

const citation = {
  id: "cit_1",
  messageId: "msg_1",
  citationIndex: 0,
  documentId: "doc_1",
  documentTitle: "paper.pdf",
  pageNumber: 4,
  chunkId: "chunk_1",
  excerpt: "A useful source excerpt.",
};

test("chat DTO mapping preserves the existing citation click fields", () => {
  assert.deepEqual(toUiCitation(citation), {
    id: "cit_1",
    citationIndex: 0,
    documentId: "doc_1",
    documentName: "paper.pdf",
    pageNumber: 4,
    snippet: "A useful source excerpt.",
  });
});

test("chat message and thread DTOs map server summaries to UI state", () => {
  const message = toUiMessage({
    id: "msg_1",
    workspaceId: "ws_1",
    threadId: "thread_1",
    role: "assistant",
    content: "Answer",
    status: "completed",
    modelProvider: "openai",
    modelName: "gpt-5.5",
    createdAt: "2026-07-14T00:00:00Z",
    citations: [citation],
  });

  assert.equal(message.role, "assistant");
  assert.equal(message.citations?.[0]?.documentName, "paper.pdf");

  assert.deepEqual(
    toUiThreadWithMessages(
      {
        id: "thread_1",
        workspaceId: "ws_1",
        title: null,
        lastMessageAt: "2026-07-14T00:00:00Z",
        createdAt: "2026-07-14T00:00:00Z",
      },
      "New Chat",
      [
        {
          id: "msg_1",
          workspaceId: "ws_1",
          threadId: "thread_1",
          parentMessageId: null,
          role: "user",
          content: "Question",
          status: "completed",
          modelProvider: null,
          modelName: null,
          createdAt: "2026-07-14T00:00:00Z",
          citations: [],
        },
      ],
    ),
    {
      id: "thread_1",
      workspaceId: "ws_1",
      title: "New Chat",
      messages: [
        {
          id: "msg_1",
          role: "user",
          content: "Question",
          citations: [],
          createdAt: "2026-07-14T00:00:00Z",
        },
      ],
      createdAt: "2026-07-14T00:00:00Z",
    },
  );
});

test("thread summary refresh preserves already hydrated messages", () => {
  const hydrated = toUiThreadWithMessages(
    {
      id: "thread_1",
      workspaceId: "ws_1",
      title: "Research",
      lastMessageAt: "2026-07-14T00:00:00Z",
      createdAt: "2026-07-14T00:00:00Z",
    },
    "New Chat",
    [
      {
        id: "msg_1",
        workspaceId: "ws_1",
        threadId: "thread_1",
        role: "assistant",
        content: "Answer",
        status: "completed",
        modelProvider: "openai",
        modelName: "gpt-5.5",
        createdAt: "2026-07-14T00:00:00Z",
        citations: [],
      },
    ],
  );
  const summary = toUiThread(
    {
      id: "thread_1",
      workspaceId: "ws_1",
      title: "Updated title",
      lastMessageAt: "2026-07-14T00:01:00Z",
      createdAt: "2026-07-14T00:00:00Z",
    },
    "New Chat",
  );

  const merged = mergeUiThreads([hydrated], [summary], "ws_1");

  assert.equal(merged[0]?.title, "Updated title");
  assert.equal(merged[0]?.messages[0]?.content, "Answer");

  const refreshed = toUiThreadWithMessages(
    {
      id: "thread_1",
      workspaceId: "ws_1",
      title: "Updated title",
      lastMessageAt: "2026-07-14T00:01:00Z",
      createdAt: "2026-07-14T00:00:00Z",
    },
    "New Chat",
    [
      {
        id: "msg_2",
        workspaceId: "ws_1",
        threadId: "thread_1",
        role: "assistant",
        content: "Fresh answer",
        status: "completed",
        modelProvider: "openai",
        modelName: "gpt-5.5",
        createdAt: "2026-07-14T00:01:00Z",
        citations: [],
      },
    ],
  );
  const replaced = mergeUiThreads(merged, [refreshed], "ws_1");

  assert.equal(replaced[0]?.messages[0]?.content, "Fresh answer");
});
