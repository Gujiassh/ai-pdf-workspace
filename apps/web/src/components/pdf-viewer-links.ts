import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfLinkService = {
  eventBus: { dispatch: (...args: unknown[]) => void };
  pagesCount: number;
  page: number;
  rotation: number;
  isInPresentationMode: boolean;
  externalLinkEnabled: boolean;
  goToDestination: (destination: unknown) => Promise<void>;
  goToPage: (value: number | string) => void;
  goToXY: (pageNumber: number, _x: number, _y: number) => void;
  addLinkAttributes: (link: HTMLAnchorElement, url: string, newWindow?: boolean) => void;
  getDestinationHash: (destination: unknown) => string;
  getAnchorUrl: (anchor: string) => string;
  setHash: (hash: string) => void;
  executeNamedAction: (action: string) => void;
  executeSetOCGState: (_action: unknown) => Promise<void>;
};

export function createPdfLinkService(pdf: PDFDocumentProxy, onNavigate: (page: number) => void): PdfLinkService {
  let currentPage = 1;

  const goToPage = (value: number | string) => {
    const page = typeof value === "number" ? value : Number.parseInt(value, 10);
    if (Number.isInteger(page) && page >= 1 && page <= pdf.numPages) {
      currentPage = page;
      onNavigate(page);
    }
  };

  return {
    eventBus: { dispatch: () => undefined },
    pagesCount: pdf.numPages,
    get page() {
      return currentPage;
    },
    set page(value: number) {
      goToPage(value);
    },
    rotation: 0,
    isInPresentationMode: false,
    externalLinkEnabled: true,
    async goToDestination(destination: unknown) {
      const resolved = typeof destination === "string"
        ? await pdf.getDestination(destination)
        : destination;
      if (!Array.isArray(resolved) || !resolved[0]) {
        return;
      }
      try {
        goToPage((await pdf.getPageIndex(resolved[0])) + 1);
      } catch {
        // Ignore malformed destinations from third-party PDF files.
      }
    },
    goToPage,
    goToXY: goToPage,
    addLinkAttributes(link, url, newWindow = false) {
      try {
        const parsed = new URL(url, window.location.href);
        if (!["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
          return;
        }
        link.href = parsed.toString();
        link.title = url;
        link.target = newWindow ? "_blank" : "_self";
        link.rel = "noopener noreferrer";
      } catch {
        // Ignore invalid external links without breaking page rendering.
      }
    },
    getDestinationHash(destination) {
      if (typeof destination === "string") {
        return `#nameddest=${encodeURIComponent(destination)}`;
      }
      if (Array.isArray(destination)) {
        return `#pdf-dest=${encodeURIComponent(JSON.stringify(destination))}`;
      }
      return "#";
    },
    getAnchorUrl(anchor) {
      return anchor || "#";
    },
    setHash(hash) {
      const pageMatch = hash.match(/(?:^|[#&])page=(\d+)/);
      if (pageMatch) {
        goToPage(Number(pageMatch[1]));
      }
    },
    executeNamedAction(action) {
      if (action === "FirstPage") {
        goToPage(1);
      } else if (action === "LastPage") {
        goToPage(pdf.numPages);
      } else if (action === "NextPage") {
        goToPage(currentPage + 1);
      } else if (action === "PrevPage") {
        goToPage(currentPage - 1);
      }
    },
    async executeSetOCGState() {
      // Optional content groups are intentionally read-only in this viewer.
    },
  };
}
