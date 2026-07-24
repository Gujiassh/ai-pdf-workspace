import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { translations } from "@/lib/i18n-context";
import { ChatBubble } from "./chat-bubble";

const baseProps: Omit<ComponentProps<typeof ChatBubble>, "msg"> = {
  onCitationClick: () => undefined,
  onInputEvidenceClick: () => undefined,
  onQuickNoteOpen: () => undefined,
  showNoteEditorId: null,
  setShowNoteEditorId: () => undefined,
  quickNoteTitle: "",
  setQuickNoteTitle: () => undefined,
  quickNoteContent: "",
  setQuickNoteContent: () => undefined,
  onSaveQuickNote: () => undefined,
  onEditMessage: async () => undefined,
  t: (key) => translations.en[key],
};

test("failed assistant messages render as a failure state instead of a normal answer", () => {
  const html = renderToStaticMarkup(createElement(ChatBubble, {
    ...baseProps,
    msg: {
      id: "assistant-failed",
      role: "assistant",
      content: "Generation provider is unreachable.",
      createdAt: "2026-07-18T00:00:00Z",
      status: "failed",
    },
  }));

  assert.match(html, /data-chat-status="failed"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Response failed/);
  assert.match(html, /Generation provider is unreachable/);
  assert.match(html, /Context is preserved/);
  assert.doesNotMatch(html, /AI Consultant/);
});

test("user messages expose frozen input Evidence as a Viewer target", () => {
  const html = renderToStaticMarkup(createElement(ChatBubble, {
    ...baseProps,
    msg: {
      id: "user-image",
      role: "user",
      content: "Analyze this region.",
      createdAt: "2026-07-18T00:00:00Z",
      inputEvidence: [{
        id: "input-image-1",
        messageId: "user-image",
        targetOrder: 0,
        assetId: "asset-image",
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
          representationId: "ocr-3",
          indexVersion: 4,
        },
      }],
    },
  }));

  assert.match(html, /data-message-input-evidence="input-image-1"/);
  assert.match(html, /chart\.png/);
  assert.match(html, /Image/);
});

test("accepted region questions show locked input Evidence before stream hydration", () => {
  const html = renderToStaticMarkup(createElement(ChatBubble, {
    ...baseProps,
    msg: {
      id: "pending-user-image",
      role: "user",
      content: "Analyze this region.",
      createdAt: "2026-07-18T00:00:00Z",
      pendingInputEvidenceCount: 1,
    },
  }));

  assert.match(html, /<div data-message-input-evidence-pending="1"/);
  assert.match(html, /1 input evidence item\(s\) locked/);
  assert.doesNotMatch(html, /data-message-input-evidence=/);
});
