import assert from "node:assert/strict";
import test from "node:test";

import type { PDFDocumentProxy } from "pdfjs-dist";

import { createPdfLinkService } from "./pdf-viewer-links";

function createPdf(overrides: Partial<PDFDocumentProxy> = {}) {
  return {
    numPages: 3,
    async getDestination() {
      return [{ num: 2 }];
    },
    async getPageIndex() {
      return 1;
    },
    ...overrides,
  } as unknown as PDFDocumentProxy;
}

test("PDF link service navigates named destinations and page actions", async () => {
  const navigatedPages: number[] = [];
  const service = createPdfLinkService(createPdf(), (page) => navigatedPages.push(page));

  await service.goToDestination("chapter-two");
  service.executeNamedAction("NextPage");
  service.executeNamedAction("LastPage");
  service.setHash("#page=1");

  assert.deepEqual(navigatedPages, [2, 3, 3, 1]);
  assert.equal(service.page, 1);
});

test("PDF link service ignores invalid pages and malformed destinations", async () => {
  const navigatedPages: number[] = [];
  const service = createPdfLinkService(
    createPdf({
      async getDestination() {
        return null;
      },
    }),
    (page) => navigatedPages.push(page),
  );

  service.goToPage(0);
  service.goToPage(4);
  await service.goToDestination("missing");

  assert.deepEqual(navigatedPages, []);
  assert.equal(service.getDestinationHash("chapter-two"), "#nameddest=chapter-two");
});

test("PDF link service only permits safe external protocols", () => {
  Object.assign(globalThis, { window: { location: { href: "http://localhost:3000/workspaces/demo" } } });
  const service = createPdfLinkService(createPdf(), () => undefined);
  const safeLink = {} as HTMLAnchorElement;
  const unsafeLink = {} as HTMLAnchorElement;

  service.addLinkAttributes(safeLink, "https://example.com/paper", true);
  service.addLinkAttributes(unsafeLink, "javascript:alert(1)");

  assert.equal(safeLink.href, "https://example.com/paper");
  assert.equal(safeLink.target, "_blank");
  assert.equal(safeLink.rel, "noopener noreferrer");
  assert.equal(unsafeLink.href, undefined);
});
