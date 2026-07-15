import { expect, test, type Page } from "@playwright/test";

const email = process.env.PLAYWRIGHT_E2E_EMAIL;
const password = process.env.PLAYWRIGHT_E2E_PASSWORD;

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder(/电子邮箱|email address/i).fill(email!);
  await page.getByPlaceholder(/输入密码|password/i).fill(password!);
  await page.getByRole("button", { name: /登录|sign in/i }).click();
  await expect(page.getByRole("heading", { name: /工作区|workspaces/i })).toBeVisible();
}

test("unauthenticated auth shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /AI PDF/ })).toBeVisible();
  await expect(page.getByPlaceholder(/电子邮箱|email address/i)).toBeVisible();
});

test.describe("authenticated workspace smoke", () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(!email || !password, "Set PLAYWRIGHT_E2E_EMAIL and PLAYWRIGHT_E2E_PASSWORD to run the real smoke.");
  });

  test("login, create workspace, and persist settings", async ({ page }) => {
    await signIn(page);

    const workspaceName = `e2e-${Date.now()}`;
    await page.getByRole("button", { name: /创建新工作区|create workspace/i }).click();
    await page.locator('input[placeholder*="例如"]').fill(workspaceName);
    await page.getByRole("button", { name: /创建并进入/i }).click();
    await expect(page).toHaveURL(/\/workspaces\//);

    await page.getByRole("button", { name: /配置|settings/i }).click();
    const prompt = page.locator("textarea").first();
    await expect(prompt).toBeVisible();
    await prompt.fill("Answer with a concise evidence checklist.");
    await page.getByRole("button", { name: /保存系统配置|save configs/i }).click();
    await expect(page.getByText(/已保存|saved/i)).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: /配置|settings/i }).click();
    await expect(page.locator("textarea").first()).toHaveValue("Answer with a concise evidence checklist.");
  });

  test("upload, render source PDF, OCR-select, stream chat, and edit branch", async ({ page }, testInfo) => {
    const pdfPath = process.env.PLAYWRIGHT_E2E_PDF_PATH;
    testInfo.skip(!pdfPath, "Set PLAYWRIGHT_E2E_PDF_PATH to run the document smoke.");
    await signIn(page);
    await page.getByRole("button", { name: /创建新工作区|create workspace/i }).click();
    const workspaceName = `pdf-e2e-${Date.now()}`;
    await page.locator('input[placeholder*="例如"]').fill(workspaceName);
    await page.getByRole("button", { name: /创建并进入/i }).click();
    await expect(page).toHaveURL(/\/workspaces\//);

    await page.locator('input[type="file"]').first().setInputFiles(pdfPath!);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 120_000 });

    const question = process.env.PLAYWRIGHT_E2E_QUESTION ?? "Summarize the selected evidence.";
    await page.locator(".textLayer").first().evaluate((element) => {
      const textNode = element.firstChild;
      if (!textNode) return;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    const askButton = page.getByRole("button", { name: /问 AI|ask ai/i });
    if (await askButton.count()) {
      await askButton.click();
    }
    await page.getByPlaceholder(/针对当前工作区|ask about/i).fill(question);
    await page.getByRole("button", { name: /发送|send/i }).click();
    await expect(page.locator('[data-chat-message="assistant"]').last()).toContainText(/.+/, { timeout: 120_000 });

    const editButton = page.getByRole("button", { name: "编辑问题" }).first();
    if (await editButton.count()) {
      await editButton.click();
      const editor = page.locator('[data-chat-message="user"] textarea').first();
      await editor.fill(`${question} with one more caveat`);
      await page.getByRole("button", { name: /保存$/ }).first().click();
      await expect(page.locator('[data-chat-message="assistant"]').last()).toContainText(/.+/, { timeout: 120_000 });
    }
  });
});
