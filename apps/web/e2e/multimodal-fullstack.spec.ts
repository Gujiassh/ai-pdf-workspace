import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Region = { x: number; y: number; width: number; height: number };

type LiveState = {
  schemaVersion: "m402-live-state-v1";
  runId: string;
  email: string;
  password: string;
  workspaceId: string;
  threadId: string;
  assets: Record<string, string>;
  caseCitations: Record<string, string[]>;
};

type GoldenTarget = {
  fixtureId: string;
  locatorKind: "pdf_page" | "pdf_region" | "image_region";
  pageNumber: number | null;
  pageLabel: string | null;
  regionIndexes: number[];
  regionLabels: string[];
};

type GoldenCase = {
  id: string;
  layer: string;
  evidenceTargets: GoldenTarget[];
};

type GoldenFixture = {
  id: string;
  modality: "pdf" | "image";
  sourcePath: string;
  manifestPath: string;
};

type GoldenSuite = {
  schemaVersion: string;
  fixtures: GoldenFixture[];
  cases: GoldenCase[];
};

type PixelMeasurement = {
  width: number;
  height: number;
  uniqueColors: number;
  nonWhiteSamples: number;
};

type TargetMeasurement = {
  citationId: string;
  fixtureId: string;
  modality: "pdf" | "image";
  locatorKind: GoldenTarget["locatorKind"];
  pageNumber: number | null;
  expectedRegions: Region[];
  renderedRegions: Region[];
  minimumApprovedCoverageRatio: number | null;
  pixelMeasurement: PixelMeasurement;
  screenshotPath: string;
  responseStatuses: Array<{ method: string; path: string; status: number }>;
  layout: {
    panelWithinViewport: boolean;
    primarySeparatedFromPanel: boolean | null;
    viewerBelowPanelHeader: boolean;
    renderedSurfaceWithinPanel: boolean;
  };
  passed: boolean;
};

type CaseMeasurement = {
  caseId: string;
  targets: TargetMeasurement[];
  passed: boolean;
};

const statePath = process.env.PLAYWRIGHT_M402_STATE_PATH;
const repositoryRoot = path.resolve(process.cwd(), "../..");
const artifactRoot = path.resolve(
  process.env.PLAYWRIGHT_M402_ARTIFACT_DIR
    ?? path.join(repositoryRoot, "docs/evals/artifacts/m402-v1"),
);

test.describe.configure({ mode: "serial" });

async function loadJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function approvedCoverageRatio(approved: Region, rendered: Region): number {
  const width = Math.max(
    0,
    Math.min(approved.x + approved.width, rendered.x + rendered.width) - Math.max(approved.x, rendered.x),
  );
  const height = Math.max(
    0,
    Math.min(approved.y + approved.height, rendered.y + rendered.height) - Math.max(approved.y, rendered.y),
  );
  const approvedArea = approved.width * approved.height;
  return approvedArea > 0 ? Math.min(1, width * height / approvedArea) : 0;
}

async function expectedRegions(fixture: GoldenFixture, target: GoldenTarget): Promise<Region[]> {
  const manifest = await loadJson<{
    regions?: Array<Region & { label: string }>;
    pages?: Array<{ label: string; regions: Region[] }>;
  }>(path.join(repositoryRoot, fixture.manifestPath));
  if (fixture.modality === "image") {
    const byLabel = new Map((manifest.regions ?? []).map((region) => [region.label, region]));
    return target.regionLabels.map((label) => {
      const region = byLabel.get(label);
      if (!region) throw new Error(`Missing ${fixture.id} region ${label}`);
      return { x: region.x, y: region.y, width: region.width, height: region.height };
    });
  }
  const page = (manifest.pages ?? []).find((item) => item.label === target.pageLabel);
  if (!page) throw new Error(`Missing ${fixture.id} page ${target.pageLabel}`);
  return target.regionIndexes.map((index) => page.regions[index]);
}

async function signIn(page: Page, state: LiveState): Promise<void> {
  const response = await page.context().request.post("/api/auth/login", {
    data: { email: state.email, password: state.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function closeMobileNavigation(page: Page): Promise<void> {
  const closeNavigation = page.getByRole("button", { name: /关闭导航栏|close navigation/i });
  if (await closeNavigation.isVisible().catch(() => false)) {
    await closeNavigation.click();
  }
}

async function sampledCanvasPixels(canvas: Locator): Promise<PixelMeasurement> {
  return canvas.evaluate((element) => {
    const source = element as HTMLCanvasElement;
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context || source.width === 0 || source.height === 0) {
      return { width: source.width, height: source.height, uniqueColors: 0, nonWhiteSamples: 0 };
    }
    const colors = new Set<string>();
    let nonWhiteSamples = 0;
    for (let row = 0; row < 48; row += 1) {
      for (let column = 0; column < 48; column += 1) {
        const x = Math.min(source.width - 1, Math.floor((column + 0.5) * source.width / 48));
        const y = Math.min(source.height - 1, Math.floor((row + 0.5) * source.height / 48));
        const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
        colors.add(`${red}:${green}:${blue}:${alpha}`);
        if (alpha > 0 && (red < 248 || green < 248 || blue < 248)) nonWhiteSamples += 1;
      }
    }
    return { width: source.width, height: source.height, uniqueColors: colors.size, nonWhiteSamples };
  });
}

async function sampledImagePixels(image: Locator): Promise<PixelMeasurement> {
  return image.evaluate((element) => {
    const source = element as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !source.complete || source.naturalWidth === 0 || source.naturalHeight === 0) {
      return { width: source.naturalWidth, height: source.naturalHeight, uniqueColors: 0, nonWhiteSamples: 0 };
    }
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const colors = new Set<string>();
    let nonWhiteSamples = 0;
    for (let row = 0; row < 16; row += 1) {
      for (let column = 0; column < 24; column += 1) {
        const [red, green, blue, alpha] = context.getImageData(column * 4 + 2, row * 4 + 2, 1, 1).data;
        colors.add(`${red}:${green}:${blue}:${alpha}`);
        if (alpha > 0 && (red < 248 || green < 248 || blue < 248)) nonWhiteSamples += 1;
      }
    }
    return {
      width: source.naturalWidth,
      height: source.naturalHeight,
      uniqueColors: colors.size,
      nonWhiteSamples,
    };
  });
}

async function normalizedRegions(surface: Locator, overlays: Locator): Promise<Region[]> {
  const surfaceBox = await surface.boundingBox();
  if (!surfaceBox) throw new Error("Rendered evidence surface has no bounding box.");
  const regions: Region[] = [];
  for (let index = 0; index < await overlays.count(); index += 1) {
    const box = await overlays.nth(index).boundingBox();
    if (!box) throw new Error(`Evidence overlay ${index} has no bounding box.`);
    regions.push({
      x: (box.x - surfaceBox.x) / surfaceBox.width,
      y: (box.y - surfaceBox.y) / surfaceBox.height,
      width: box.width / surfaceBox.width,
      height: box.height / surfaceBox.height,
    });
  }
  return regions;
}

async function layoutMeasurement(
  page: Page,
  panel: Locator,
  viewer: Locator,
  surface: Locator,
  desktop: boolean,
): Promise<TargetMeasurement["layout"]> {
  const viewport = page.viewportSize();
  const panelBox = await panel.boundingBox();
  const viewerBox = await viewer.boundingBox();
  const surfaceBox = await surface.boundingBox();
  const primaryBox = await page.locator("[data-workspace-primary]").boundingBox();
  const panelHeaderBox = await panel.locator("[data-evidence-panel-header]").boundingBox();
  if (!viewport || !panelBox || !viewerBox || !surfaceBox || !panelHeaderBox) {
    throw new Error("Required layout bounds are unavailable.");
  }
  return {
    panelWithinViewport: panelBox.x >= -1
      && panelBox.y >= -1
      && panelBox.x + panelBox.width <= viewport.width + 1
      && panelBox.y + panelBox.height <= viewport.height + 1,
    primarySeparatedFromPanel: desktop && primaryBox
      ? primaryBox.x + primaryBox.width <= panelBox.x + 1
      : null,
    viewerBelowPanelHeader: viewerBox.y >= panelHeaderBox.y + panelHeaderBox.height - 1,
    renderedSurfaceWithinPanel: surfaceBox.x >= panelBox.x - 1
      && surfaceBox.y >= panelBox.y - 1
      && surfaceBox.x + surfaceBox.width <= panelBox.x + panelBox.width + 1
      && surfaceBox.y + Math.min(surfaceBox.height, panelBox.height) <= panelBox.y + panelBox.height + 1,
  };
}

async function measureTarget(
  page: Page,
  testInfo: TestInfo,
  fixture: GoldenFixture,
  target: GoldenTarget,
  citationId: string,
  caseId: string,
  viewportName: "desktop" | "mobile",
  responseStart: number,
  responses: Array<{ method: string; path: string; status: number }>,
): Promise<TargetMeasurement> {
  const panel = page.locator("[data-evidence-panel]");
  await expect(panel).toBeVisible();
  const expected = await expectedRegions(fixture, target);
  let viewer: Locator;
  let surface: Locator;
  let overlays: Locator;
  let pixelMeasurement: PixelMeasurement;

  if (fixture.modality === "pdf") {
    viewer = panel.locator("[data-pdf-viewer]");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("[data-pdf-page-input]")).toHaveValue(String(target.pageNumber));
    surface = viewer.locator("[data-pdf-paper]");
    await expect(surface).toBeVisible();
    const canvas = surface.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect.poll(async () => (await sampledCanvasPixels(canvas)).uniqueColors).toBeGreaterThan(1);
    pixelMeasurement = await sampledCanvasPixels(canvas);
    overlays = surface.locator("[data-evidence-regions] > div");
  } else {
    viewer = panel.locator("[data-image-viewer]");
    await expect(viewer).toBeVisible();
    surface = viewer.locator("[data-image-surface]");
    await expect(surface).toBeVisible();
    const image = surface.locator("img");
    await expect(image).toBeVisible();
    await expect.poll(async () => (await sampledImagePixels(image)).uniqueColors).toBeGreaterThan(4);
    pixelMeasurement = await sampledImagePixels(image);
    overlays = surface.locator("[data-image-evidence-region]");
  }

  if (expected.length === 0) {
    await expect(overlays).toHaveCount(0);
  } else {
    await expect.poll(() => overlays.count()).toBeGreaterThan(0);
  }
  const rendered = await normalizedRegions(surface, overlays);
  if (expected.length > 0) expect(rendered.length).toBeGreaterThan(0);
  const minimumApprovedCoverage = expected.length > 0
    ? Math.min(...expected.map((approved) => (
      Math.max(...rendered.map((actual) => approvedCoverageRatio(approved, actual)))
    )))
    : null;
  if (minimumApprovedCoverage !== null) expect(minimumApprovedCoverage).toBeGreaterThanOrEqual(0.08);
  expect(pixelMeasurement.nonWhiteSamples).toBeGreaterThan(4);

  const layout = await layoutMeasurement(page, panel, viewer, surface, viewportName === "desktop");
  expect(layout.panelWithinViewport).toBeTruthy();
  expect(layout.viewerBelowPanelHeader).toBeTruthy();
  expect(layout.renderedSurfaceWithinPanel).toBeTruthy();
  if (viewportName === "desktop") expect(layout.primarySeparatedFromPanel).toBeTruthy();

  const screenshotName = `${viewportName}-${caseId}-${target.fixtureId}.png`;
  const screenshotPath = path.join(artifactRoot, screenshotName);
  await panel.screenshot({ path: screenshotPath });
  await testInfo.attach(screenshotName, { path: screenshotPath, contentType: "image/png" });
  const responseStatuses = responses.slice(responseStart);
  expect(responseStatuses.every((response) => response.status >= 200 && response.status < 400)).toBeTruthy();

  return {
    citationId,
    fixtureId: fixture.id,
    modality: fixture.modality,
    locatorKind: target.locatorKind,
    pageNumber: target.pageNumber,
    expectedRegions: expected,
    renderedRegions: rendered,
    minimumApprovedCoverageRatio: minimumApprovedCoverage,
    pixelMeasurement,
    screenshotPath: path.relative(repositoryRoot, screenshotPath),
    responseStatuses,
    layout,
    passed: true,
  };
}

async function runEvidenceAcceptance(
  page: Page,
  testInfo: TestInfo,
  viewportName: "desktop" | "mobile",
  viewport: { width: number; height: number },
): Promise<void> {
  testInfo.skip(!statePath, "Set PLAYWRIGHT_M402_STATE_PATH to run the real M402 acceptance.");
  const state = await loadJson<LiveState>(statePath!);
  const golden = await loadJson<GoldenSuite>(path.join(repositoryRoot, "docs/evals/multimodal-golden-v1.json"));
  expect(state.schemaVersion).toBe("m402-live-state-v1");
  const fixtures = new Map(golden.fixtures.map((fixture) => [fixture.id, fixture]));
  const cases = golden.cases.filter((item) => item.layer === "evidence");
  expect(cases).toHaveLength(7);
  await mkdir(artifactRoot, { recursive: true });

  const responses: Array<{ method: string; path: string; status: number }> = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === new URL(testInfo.project.use.baseURL as string).origin && url.pathname.startsWith("/api/")) {
      responses.push({ method: response.request().method(), path: `${url.pathname}${url.search}`, status: response.status() });
    }
  });

  await page.setViewportSize(viewport);
  await signIn(page, state);
  await page.goto(`/workspaces/${state.workspaceId}`, { waitUntil: "domcontentloaded" });
  await closeMobileNavigation(page);
  await expect(page.getByText("M402 evidence case evidence-mixed", { exact: true })).toBeVisible({ timeout: 30_000 });

  const results: CaseMeasurement[] = [];
  for (const goldenCase of cases) {
    const citations = state.caseCitations[goldenCase.id];
    expect(citations).toHaveLength(goldenCase.evidenceTargets.length);
    const targets: TargetMeasurement[] = [];
    for (const [targetIndex, target] of goldenCase.evidenceTargets.entries()) {
      const fixture = fixtures.get(target.fixtureId);
      if (!fixture) throw new Error(`Missing fixture ${target.fixtureId}`);
      const citationId = citations[targetIndex];
      const button = page.locator(`[data-citation-id="${citationId}"]`);
      await button.scrollIntoViewIfNeeded();
      const responseStart = responses.length;
      await button.click();
      targets.push(await measureTarget(
        page,
        testInfo,
        fixture,
        target,
        citationId,
        goldenCase.id,
        viewportName,
        responseStart,
        responses,
      ));
      const panel = page.locator("[data-evidence-panel]");
      await panel.getByRole("button", { name: /关闭证据面板|close evidence/i }).click();
      await expect(panel).toHaveCount(0);
      await closeMobileNavigation(page);
    }
    results.push({ caseId: goldenCase.id, targets, passed: targets.every((target) => target.passed) });
  }

  expect(results.every((result) => result.passed)).toBeTruthy();
  expect(responses.every((response) => response.status >= 200 && response.status < 400)).toBeTruthy();
  const responsePaths = responses.map((response) => response.path);
  expect(responsePaths).toContain(`/api/workspaces/${state.workspaceId}/threads/${state.threadId}/messages`);
  for (const assetId of Object.values(state.assets)) {
    expect(responsePaths.some((responsePath) => responsePath.includes(`/assets/${assetId}`))).toBeTruthy();
  }
  for (const fixtureId of ["pdf-coordinate", "pdf-artifact-matrix"]) {
    expect(responsePaths).toContain(
      `/api/workspaces/${state.workspaceId}/assets/${state.assets[fixtureId]}/file`,
    );
  }
  expect(responsePaths.some((responsePath) => (
    responsePath.includes(`/assets/${state.assets["image-coordinate"]}/representations/image-oriented/file`)
  ))).toBeTruthy();
  const testFile = "apps/web/e2e/multimodal-fullstack.spec.ts";
  const testFileBytes = await readFile(path.join(repositoryRoot, testFile));
  const output = {
    schemaVersion: "m402-playwright-evidence-v1",
    runId: state.runId,
    goldenSchemaVersion: golden.schemaVersion,
    testFile,
    testFileSha256: createHash("sha256").update(testFileBytes).digest("hex"),
    viewport: { name: viewportName, ...viewport },
    routeInterceptions: 0,
    realBffResponseCount: responses.length,
    cases: results,
    passed: true,
  };
  await writeFile(
    path.join(artifactRoot, `playwright-${viewportName}.json`),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8",
  );
}

test("M402 evidence cases render through the real BFF on desktop", async ({ page }, testInfo) => {
  await runEvidenceAcceptance(page, testInfo, "desktop", { width: 1440, height: 1000 });
});

test("M402 evidence cases render through the real BFF on mobile", async ({ page }, testInfo) => {
  await runEvidenceAcceptance(page, testInfo, "mobile", { width: 390, height: 844 });
});
