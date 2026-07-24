import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RestoreState = {
  schemaVersion: "m403-state-v1";
  email: string;
  password: string;
  workspaceId: string;
  citationIds: {
    pdfHistorical: string;
    imageHistorical: string;
  };
};

const statePath = process.env.PLAYWRIGHT_M403_STATE_PATH;
const phase = process.env.PLAYWRIGHT_M403_PHASE ?? "unknown";
const artifactRoot = path.resolve(
  process.env.PLAYWRIGHT_M403_ARTIFACT_DIR ?? path.join(process.cwd(), "../../docs/evals/artifacts/m403-v1"),
);

async function signIn(page: Page, state: RestoreState): Promise<void> {
  const response = await page.context().request.post("/api/auth/login", {
    data: { email: state.email, password: state.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function closeMobileNavigation(page: Page): Promise<void> {
  const close = page.getByRole("button", { name: /关闭导航栏|close navigation/i });
  if (await close.isVisible().catch(() => false)) await close.click();
}

async function canvasPixels(canvas: Locator): Promise<{ width: number; height: number; nonWhite: number; colors: number; pixelSha256: string }> {
  return canvas.evaluate(async (element) => {
    const source = element as HTMLCanvasElement;
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context || source.width === 0 || source.height === 0) return { width: source.width, height: source.height, nonWhite: 0, colors: 0, pixelSha256: "" };
    const colors = new Set<string>();
    let nonWhite = 0;
    for (let row = 0; row < 24; row += 1) {
      for (let column = 0; column < 24; column += 1) {
        const x = Math.min(source.width - 1, Math.floor((column + 0.5) * source.width / 24));
        const y = Math.min(source.height - 1, Math.floor((row + 0.5) * source.height / 24));
        const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
        colors.add(`${r}:${g}:${b}:${a}`);
        if (a > 0 && (r < 248 || g < 248 || b < 248)) nonWhite += 1;
      }
    }
    const pixels = context.getImageData(0, 0, source.width, source.height).data;
    const value = await crypto.subtle.digest("SHA-256", pixels);
    const pixelSha256 = [...new Uint8Array(value)].map((item) => item.toString(16).padStart(2, "0")).join("");
    return { width: source.width, height: source.height, nonWhite, colors: colors.size, pixelSha256 };
  });
}

async function imagePixels(image: Locator): Promise<{ width: number; height: number; nonWhite: number; colors: number; pixelSha256: string }> {
  return image.evaluate(async (element) => {
    const source = element as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.naturalWidth;
    canvas.height = source.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !source.complete || source.naturalWidth === 0) return { width: source.naturalWidth, height: source.naturalHeight, nonWhite: 0, colors: 0, pixelSha256: "" };
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const colors = new Set<string>();
    let nonWhite = 0;
    for (let row = 0; row < 18; row += 1) {
      for (let column = 0; column < 24; column += 1) {
        const x = Math.min(canvas.width - 1, Math.floor((column + 0.5) * canvas.width / 24));
        const y = Math.min(canvas.height - 1, Math.floor((row + 0.5) * canvas.height / 18));
        const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
        colors.add(`${r}:${g}:${b}:${a}`);
        if (a > 0 && (r < 248 || g < 248 || b < 248)) nonWhite += 1;
      }
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const value = await crypto.subtle.digest("SHA-256", pixels);
    const pixelSha256 = [...new Uint8Array(value)].map((item) => item.toString(16).padStart(2, "0")).join("");
    return { width: source.naturalWidth, height: source.naturalHeight, nonWhite, colors: colors.size, pixelSha256 };
  });
}

async function normalizedRegions(surface: Locator, regions: Locator): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const surfaceBox = await surface.boundingBox();
  if (!surfaceBox) throw new Error("Evidence surface has no bounding box");
  const result = [];
  for (let index = 0; index < await regions.count(); index += 1) {
    const box = await regions.nth(index).boundingBox();
    if (!box) throw new Error(`Evidence region ${index} has no bounding box`);
    result.push({
      x: Number(((box.x - surfaceBox.x) / surfaceBox.width).toFixed(6)),
      y: Number(((box.y - surfaceBox.y) / surfaceBox.height).toFixed(6)),
      width: Number((box.width / surfaceBox.width).toFixed(6)),
      height: Number((box.height / surfaceBox.height).toFixed(6)),
    });
  }
  return result;
}

async function openCitation(page: Page, citationId: string, kind: "pdf" | "image", screenshotName: string): Promise<Record<string, unknown>> {
  const button = page.locator(`[data-citation-id="${citationId}"]`).first();
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
  const panel = page.locator("[data-evidence-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const surface = kind === "pdf" ? panel.locator("[data-pdf-paper]") : panel.locator("[data-image-surface]");
  await expect(surface).toBeVisible({ timeout: 30_000 });
  const pixels = kind === "pdf" ? await canvasPixels(surface.locator("canvas").first()) : await imagePixels(surface.locator("img").first());
  const regions = kind === "pdf" ? panel.locator("[data-evidence-regions] > div") : panel.locator("[data-image-evidence-region]");
  const regionCount = await regions.count();
  const regionGeometry = await normalizedRegions(surface, regions);
  expect(regionCount).toBeGreaterThan(0);
  expect(pixels.colors).toBeGreaterThan(1);
  expect(pixels.nonWhite).toBeGreaterThan(0);
  const screenshotPath = path.join(artifactRoot, `${phase}-${screenshotName}.png`);
  await mkdir(artifactRoot, { recursive: true });
  await panel.screenshot({ path: screenshotPath });
  await panel.getByRole("button", { name: /关闭证据面板|close evidence/i }).click();
  await expect(panel).toHaveCount(0);
  return { citationId, kind, pixels, regionCount, regionGeometry, screenshotPath: path.relative(path.resolve(process.cwd(), "../.."), screenshotPath) };
}

async function run(page: Page, viewport: "desktop" | "mobile"): Promise<Record<string, unknown>> {
  if (!statePath) throw new Error("PLAYWRIGHT_M403_STATE_PATH is required");
  await page.setViewportSize(viewport === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  const state = JSON.parse(await readFile(statePath, "utf8")) as RestoreState;
  await signIn(page, state);
  await page.goto(`/workspaces/${state.workspaceId}`);
  await expect(page.getByRole("heading", { name: "M403 Restore Acceptance", exact: true })).toBeVisible({ timeout: 30_000 });
  await closeMobileNavigation(page);
  const results = [
    await openCitation(page, state.citationIds.pdfHistorical, "pdf", `${viewport}-pdf-history`),
    await openCitation(page, state.citationIds.imageHistorical, "image", `${viewport}-image-history`),
  ];
  return { phase, viewport, results };
}

test.describe.configure({ mode: "serial" });
test("M403 restored historical evidence renders on desktop", async ({ page }) => {
  test.skip(!statePath, "Set PLAYWRIGHT_M403_STATE_PATH to run M403 acceptance.");
  const result = await run(page, "desktop");
  await writeFile(path.join(artifactRoot, `playwright-${phase}-desktop.json`), `${JSON.stringify(result, null, 2)}\n`);
});

test("M403 restored historical evidence renders on mobile", async ({ page }) => {
  test.skip(!statePath, "Set PLAYWRIGHT_M403_STATE_PATH to run M403 acceptance.");
  const result = await run(page, "mobile");
  await writeFile(path.join(artifactRoot, `playwright-${phase}-mobile.json`), `${JSON.stringify(result, null, 2)}\n`);
});
