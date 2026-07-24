import assert from "node:assert/strict";
import test from "node:test";

import { mergeUiThreads, toUiCitation, toUiMessage, toUiThread, toUiThreadWithMessages } from "./normalize";
import type { CitationDto } from "./types";

const citation: CitationDto = {
  id: "cit_1",
  messageId: "msg_1",
  citationIndex: 0,
  assetId: "asset_1",
  assetKind: "pdf",
  assetTitle: "paper.pdf",
  sourceAvailable: true,
  excerpt: "A useful source excerpt.",
  locator: { kind: "pdf_page", version: 1, pageNumber: 4 },
  sourceVersions: {
    parserVersion: "parser-v1",
    processingGeneration: 1,
    representationId: "representation-1",
    indexVersion: 2,
  },
};

test("chat DTO mapping preserves the immutable evidence envelope", () => {
  assert.deepEqual(toUiCitation(citation), {
    id: "cit_1",
    citationIndex: 0,
    assetId: "asset_1",
    assetKind: "pdf",
    assetTitle: "paper.pdf",
    sourceAvailable: true,
    excerpt: "A useful source excerpt.",
    locator: { kind: "pdf_page", version: 1, pageNumber: 4 },
    sourceVersions: citation.sourceVersions,
  });
});

test("chat message mapping preserves frozen user input Evidence", () => {
  const message = toUiMessage({
    id: "msg_user",
    workspaceId: "ws_1",
    threadId: "thread_1",
    parentMessageId: null,
    role: "user",
    content: "Analyze this region",
    status: "completed",
    modelProvider: null,
    modelName: null,
    createdAt: "2026-07-14T00:00:00Z",
    citations: [],
    inputEvidence: [{
      id: "input_1",
      messageId: "msg_user",
      targetOrder: 0,
      assetId: "asset_image",
      assetKind: "image",
      assetTitle: "chart.png",
      sourceAvailable: true,
      excerpt: "Observation: 42 ms",
      locator: {
        kind: "image_region",
        version: 1,
        coordinateSpace: "image_normalized_top_left_v1",
        widthPixels: 1200,
        heightPixels: 800,
        orientationApplied: true,
        regions: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.3 }],
      },
      sourceVersions: {
        parserVersion: "rapidocr-image-region-v1",
        processingGeneration: 3,
        representationId: "ocr_3",
        indexVersion: 4,
      },
    }],
  });

  assert.equal(message.inputEvidence?.[0]?.assetTitle, "chart.png");
  assert.equal(message.inputEvidence?.[0]?.sourceVersions.representationId, "ocr_3");
  const inputLocator = message.inputEvidence?.[0]?.locator;
  assert.equal(inputLocator?.kind, "image_region");
  assert.deepEqual(inputLocator?.kind === "image_region" ? inputLocator.regions : null, [
    { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
  ]);
});

test("chat message and thread DTOs map server summaries to UI state", () => {
  const message = toUiMessage({
    id: "msg_1", workspaceId: "ws_1", threadId: "thread_1", role: "assistant",
    content: "Answer", status: "completed", modelProvider: "openai", modelName: "gpt-5.5",
    createdAt: "2026-07-14T00:00:00Z", citations: [citation], inputEvidence: [],
  });
  assert.equal(message.citations?.[0]?.assetTitle, "paper.pdf");

  const thread = toUiThreadWithMessages(
    { id: "thread_1", workspaceId: "ws_1", title: null, lastMessageAt: "2026-07-14T00:00:00Z", createdAt: "2026-07-14T00:00:00Z" },
    "New Chat",
    [{
      id: "msg_1", workspaceId: "ws_1", threadId: "thread_1", parentMessageId: null,
      role: "user", content: "Question", status: "completed", modelProvider: null,
      modelName: null, createdAt: "2026-07-14T00:00:00Z", citations: [], inputEvidence: [],
    }],
  );
  assert.equal(thread.title, "New Chat");
  assert.equal(thread.messages[0]?.content, "Question");
});

test("thread summary refresh preserves hydrated messages until a fresh payload arrives", () => {
  const hydrated = toUiThreadWithMessages(
    { id: "thread_1", workspaceId: "ws_1", title: "Research", lastMessageAt: "2026-07-14T00:00:00Z", createdAt: "2026-07-14T00:00:00Z" },
    "New Chat",
    [{ id: "msg_1", workspaceId: "ws_1", threadId: "thread_1", role: "assistant", content: "Answer", status: "completed", modelProvider: null, modelName: null, createdAt: "2026-07-14T00:00:00Z", citations: [], inputEvidence: [] }],
  );
  const summary = toUiThread(
    { id: "thread_1", workspaceId: "ws_1", title: "Updated", lastMessageAt: "2026-07-14T00:01:00Z", createdAt: "2026-07-14T00:00:00Z" },
    "New Chat",
  );
  const merged = mergeUiThreads([hydrated], [summary], "ws_1");
  assert.equal(merged[0]?.title, "Updated");
  assert.equal(merged[0]?.messages[0]?.content, "Answer");
});
