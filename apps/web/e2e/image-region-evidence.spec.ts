import { expect, test, type Page, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const workspaceId = "e2e-image-workspace";
const assetId = "e2e-image-asset";
const threadId = "e2e-image-thread";
const userMessageId = "e2e-image-user-message";
const assistantMessageId = "e2e-image-assistant-message";
const representationId = "e2e-image-ocr-representation";
const now = "2026-07-18T00:00:00Z";

const assetSummary = {
  id: assetId,
  workspaceId,
  kind: "image",
  title: "Synthetic Image Evidence Fixture",
  sourceFilename: "image-coordinate-fixture.png",
  mimeType: "image/png",
  byteSize: 21_546,
  status: "ready",
  currentProcessingGeneration: 3,
  currentIndexVersion: 4,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: now,
  updatedAt: now,
};

const workspaceSummary = {
  id: workspaceId,
  name: "Image Evidence E2E",
  description: null,
  systemPrompt: "Answer from evidence.",
  retrievalTopK: 6,
  chunkSize: 1200,
  embeddingProvider: "fake",
  embeddingModel: "fake-embedding",
  embeddingDimensions: 3,
  embeddingVersion: "v1",
  generationProvider: "fake",
  generationModel: "fake-generation",
  role: "owner",
  assetCount: 1,
  noteCount: 0,
  threadCount: 1,
  createdAt: now,
  updatedAt: now,
};

const threadSummary = {
  id: threadId,
  workspaceId,
  title: "Region analysis",
  lastMessageAt: now,
  createdAt: now,
};

function regionFromRequest(request: Request) {
  const payload = request.postDataJSON() as {
    evidenceTargets?: Array<{
      kind: string;
      assetId: string;
      processingGeneration: number;
      coordinateSpace: string;
      regions: Array<{ x: number; y: number; width: number; height: number }>;
    }>;
  };
  return payload.evidenceTargets?.[0]?.regions[0];
}

async function createKeyboardRegion(page: Page) {
  const selectionButton = page.locator("[data-image-region-select]");
  await selectionButton.click();
  await page.locator("[data-image-surface]").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-image-selected-region]")).toBeVisible();
  await expect(page.locator("[data-image-region-actions]")).toBeVisible();
}

test("image region Ask AI and direct Note preserve frozen Evidence navigation", async ({ page }) => {
  const imageBytes = readFileSync(path.resolve(
    process.cwd(),
    "../../docs/fixtures/evidence-contract/image-coordinate-fixture.png",
  ));
  const chatRequests: unknown[] = [];
  const noteRequests: unknown[] = [];
  const frozenImageRequests: string[] = [];
  let chatAttempts = 0;
  let persistedMessages: unknown[] = [];
  let persistedNotes: unknown[] = [];
  let selectedRegion: { x: number; y: number; width: number; height: number } | undefined;

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "e2e-image-user",
          email: "image-e2e@example.com",
          name: "Image E2E",
          avatarUrl: "https://example.com/avatar.png",
        },
      }),
    });
  });
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [workspaceSummary], nextCursor: null }),
    });
  });
  await page.route(`**/api/workspaces/${workspaceId}/assets`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [assetSummary], nextCursor: null }),
    });
  });
  await page.route(`**/api/workspaces/${workspaceId}/assets/${assetId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        asset: assetSummary,
        detail: {
          kind: "image",
          widthPixels: 1200,
          heightPixels: 800,
          orientationApplied: true,
        },
      }),
    });
  });
  await page.route(
    `**/api/workspaces/${workspaceId}/assets/${assetId}/representations/current-image-oriented/file?*`,
    async (route) => {
      await route.fulfill({ status: 200, contentType: "image/png", body: imageBytes });
    },
  );
  await page.route(
    `**/api/workspaces/${workspaceId}/assets/${assetId}/representations/image-oriented/file?*`,
    async (route) => {
      frozenImageRequests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "image/png", body: imageBytes });
    },
  );
  await page.route(`**/api/workspaces/${workspaceId}/threads`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [threadSummary], nextCursor: null }),
    });
  });
  await page.route(
    `**/api/workspaces/${workspaceId}/threads/${threadId}/messages`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ thread: threadSummary, messages: persistedMessages }),
      });
    },
  );
  await page.route(`**/api/workspaces/${workspaceId}/tags`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], nextCursor: null }),
    });
  });
  await page.route(`**/api/workspaces/${workspaceId}/notes`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: persistedNotes, nextCursor: null }),
      });
      return;
    }

    const requestPayload = route.request().postDataJSON();
    noteRequests.push(requestPayload);
    const noteRegion = regionFromRequest(route.request());
    const source = {
      id: "e2e-note-source",
      messageCitationId: null,
      assetId,
      assetKind: "image",
      assetTitle: assetSummary.title,
      sourceAvailable: true,
      excerpt: "Observation: 42 ms",
      locator: {
        kind: "image_region",
        version: 1,
        coordinateSpace: "image_normalized_top_left_v1",
        widthPixels: 1200,
        heightPixels: 800,
        orientationApplied: true,
        regions: [noteRegion],
      },
      sourceVersions: {
        parserVersion: "rapidocr-image-region-v1",
        processingGeneration: 3,
        representationId,
        indexVersion: 4,
      },
      createdAt: now,
    };
    const note = {
      id: "e2e-image-note",
      workspaceId,
      title: requestPayload.title,
      bodyMd: requestPayload.bodyMd,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      sources: [source],
      tagIds: [],
    };
    persistedNotes = [note];
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ note, sources: [source] }),
    });
  });
  await page.route(`**/api/workspaces/${workspaceId}/chat/stream`, async (route) => {
    chatAttempts += 1;
    const requestPayload = route.request().postDataJSON();
    chatRequests.push(requestPayload);
    selectedRegion = regionFromRequest(route.request());
    if (chatAttempts === 1) {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Evidence target could not be resolved." }),
      });
      return;
    }

    const inputEvidence = {
      id: "e2e-input-evidence",
      messageId: userMessageId,
      targetOrder: 0,
      assetId,
      assetKind: "image",
      assetTitle: assetSummary.title,
      sourceAvailable: true,
      excerpt: "Observation: 42 ms",
      locator: {
        kind: "image_region",
        version: 1,
        coordinateSpace: "image_normalized_top_left_v1",
        widthPixels: 1200,
        heightPixels: 800,
        orientationApplied: true,
        regions: [selectedRegion],
      },
      sourceVersions: {
        parserVersion: "rapidocr-image-region-v1",
        processingGeneration: 3,
        representationId,
        indexVersion: 4,
      },
    };
    persistedMessages = [
      {
        id: userMessageId,
        workspaceId,
        threadId,
        parentMessageId: null,
        role: "user",
        content: requestPayload.question,
        status: "completed",
        modelProvider: null,
        modelName: null,
        createdAt: now,
        citations: [],
        inputEvidence: [inputEvidence],
      },
      {
        id: assistantMessageId,
        workspaceId,
        threadId,
        parentMessageId: userMessageId,
        role: "assistant",
        content: "The selected region shows a 42 ms observation.",
        status: "completed",
        modelProvider: "fake",
        modelName: "fake-generation",
        createdAt: now,
        citations: [],
        inputEvidence: [],
      },
    ];
    const sseBody = [
      `event: meta\ndata: ${JSON.stringify({ threadId, userMessageId, assistantMessageId })}`,
      `event: delta\ndata: ${JSON.stringify({ text: "The selected region shows a 42 ms observation." })}`,
      `event: citations\ndata: ${JSON.stringify({ items: [] })}`,
      `event: done\ndata: ${JSON.stringify({ threadId, assistantMessageId })}`,
      "",
    ].join("\n\n");
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: { "cache-control": "no-cache" },
      body: sseBody,
    });
  });

  await page.goto(`/workspaces/${workspaceId}`);
  await expect(page.getByText("image-coordinate-fixture.png").first()).toBeVisible();
  await page.getByText("image-coordinate-fixture.png").first().click();
  await expect(page.locator("[data-image-viewer] img")).toBeVisible();
  await createKeyboardRegion(page);

  await page.locator("[data-image-region-ask]").click();
  await expect(page.locator("[data-image-selected-region]")).toBeVisible();
  await expect(page.locator("[data-image-region-actions] [role=alert]")).toContainText(
    "区域操作失败，请重试。",
  );

  await page.locator("[data-image-region-ask]").click();
  await expect(page.locator('[data-chat-message="assistant"]')).toContainText("42 ms");
  await expect(page.locator('[data-message-input-evidence="e2e-input-evidence"]')).toBeVisible();
  expect(chatRequests).toHaveLength(2);
  for (const payload of chatRequests as Array<Record<string, unknown>>) {
    expect(payload.assetScope).toEqual({ mode: "selected", assetIds: [assetId] });
    expect(payload.evidenceTargets).toEqual([{
      kind: "image_region",
      assetId,
      processingGeneration: 3,
      coordinateSpace: "image_normalized_top_left_v1",
      regions: [selectedRegion],
    }]);
    expect(JSON.stringify(payload)).not.toMatch(/representationId|excerpt|widthPixels|heightPixels|orientationApplied/);
  }

  await page.locator('[data-message-input-evidence="e2e-input-evidence"]').click();
  await expect(page.locator('[data-image-evidence-region="0"]')).toBeVisible();
  await expect(page.locator("[data-image-viewer] img")).toHaveAttribute(
    "src",
    new RegExp(`image-oriented/file\\?processingGeneration=3&evidenceRepresentationId=${representationId}$`),
  );

  await page.getByText("image-coordinate-fixture.png").first().click();
  await expect(page.locator("[data-image-viewer] img")).toHaveAttribute(
    "src",
    /current-image-oriented\/file\?processingGeneration=3$/,
  );
  await createKeyboardRegion(page);
  await page.locator("[data-image-region-note]").click();
  await expect(page.locator('[data-note-card="e2e-image-note"]')).toBeVisible();
  expect(noteRequests).toHaveLength(1);
  expect(noteRequests[0]).toMatchObject({
    sourceCitationIds: [],
    evidenceTargets: [{
      kind: "image_region",
      assetId,
      processingGeneration: 3,
      coordinateSpace: "image_normalized_top_left_v1",
    }],
  });
  expect(JSON.stringify(noteRequests[0])).not.toMatch(/representationId|excerpt|widthPixels|heightPixels|orientationApplied/);

  await page.locator('[data-note-card="e2e-image-note"] button').filter({ hasText: "来源归属" }).click();
  await expect(page.locator('[data-image-evidence-region="0"]')).toBeVisible();
  expect(frozenImageRequests).toHaveLength(2);
  expect(frozenImageRequests.every((url) => (
    new URL(url).searchParams.get("processingGeneration") === "3"
    && new URL(url).searchParams.get("evidenceRepresentationId") === representationId
  ))).toBe(true);
});
