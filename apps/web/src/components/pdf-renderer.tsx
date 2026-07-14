"use client";

import { useEffect, useRef } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

import type { OutlineNode } from "./outline-tree";
import { createPdfLinkService } from "./pdf-viewer-links";

export type PdfJsModule = typeof import("pdfjs-dist");
const PDFJS_MODULE_URL = "/pdfjs/pdf.min.mjs";
type PdfAnnotationLayer = InstanceType<PdfJsModule["AnnotationLayer"]>;

let pdfjsPromise: Promise<PdfJsModule> | null = null;

export function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import(/* webpackIgnore: true */ PDFJS_MODULE_URL) as Promise<PdfJsModule>;
  }
  return pdfjsPromise;
}

export type PdfOutlineItem = {
  title?: string;
  dest?: unknown;
  items?: PdfOutlineItem[];
};

type PdfPageSurfaceProps = {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  onError: (error: unknown) => void;
  onNavigate: (page: number) => void;
};

export function PdfPageSurface({ pdf, pageNumber, width, onError, onNavigate }: PdfPageSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  const onNavigateRef = useRef(onNavigate);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    let renderTask: { promise: Promise<unknown>; cancel: () => void } | null = null;
    let textLayer: { render: () => Promise<unknown>; cancel: () => void } | null = null;
    const canvas = canvasRef.current;
    const textLayerContainer = textLayerRef.current;
    const annotationLayerContainer = annotationLayerRef.current;

    async function renderPage() {
      try {
        const pdfjs = await loadPdfJs();
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        page = await pdf.getPage(pageNumber);
        if (cancelled) {
          page.cleanup();
          return;
        }

        if (!canvas || !textLayerContainer || !annotationLayerContainer) {
          throw new Error("PDF page surface is unavailable.");
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = width / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        const renderViewport = page.getViewport({ scale: scale * outputScale });
        const canvasContext = canvas.getContext("2d", { alpha: false });
        if (!canvasContext) {
          throw new Error("PDF canvas context is unavailable.");
        }

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.style.visibility = "hidden";
        textLayerContainer.style.width = `${Math.floor(viewport.width)}px`;
        textLayerContainer.style.height = `${Math.floor(viewport.height)}px`;
        textLayerContainer.replaceChildren();
        annotationLayerContainer.style.width = `${Math.floor(viewport.width)}px`;
        annotationLayerContainer.style.height = `${Math.floor(viewport.height)}px`;
        annotationLayerContainer.style.setProperty("--total-scale-factor", String(scale));
        annotationLayerContainer.style.setProperty("--scale-round-x", "1px");
        annotationLayerContainer.style.setProperty("--scale-round-y", "1px");
        annotationLayerContainer.replaceChildren();

        renderTask = page.render({
          annotationMode: pdfjs.AnnotationMode.ENABLE,
          canvas,
          canvasContext,
          viewport: renderViewport,
        });
        await renderTask.promise;
        if (cancelled) {
          return;
        }

        canvas.style.visibility = "";

        try {
          textLayer = new pdfjs.TextLayer({
            container: textLayerContainer,
            textContentSource: page.streamTextContent({ includeMarkedContent: true }),
            viewport,
          });
          await textLayer.render();
        } catch (error) {
          if (!cancelled) {
            console.error("PDF text layer render failed", error);
          }
        }

        try {
          const annotations = await page.getAnnotations({ intent: "display" });
          if (!cancelled && annotations.length > 0) {
            const linkService = createPdfLinkService(pdf, (pageNumberToOpen) => {
              onNavigateRef.current(pageNumberToOpen);
            }) as ConstructorParameters<PdfJsModule["AnnotationLayer"]>[0]["linkService"];
            const annotationLayer: PdfAnnotationLayer = new pdfjs.AnnotationLayer({
              accessibilityManager: undefined,
              annotationCanvasMap: undefined,
              annotationStorage: pdf.annotationStorage,
              annotationEditorUIManager: undefined,
              commentManager: undefined,
              div: annotationLayerContainer,
              linkService,
              page,
              structTreeLayer: undefined,
              viewport,
            });
            await annotationLayer.render({
              annotations,
              annotationStorage: pdf.annotationStorage,
              div: annotationLayerContainer,
              enableScripting: false,
              hasJSActions: false,
              imageResourcesPath: "/pdfjs/images/",
              linkService,
              page,
              renderForms: true,
              viewport,
            });
          }
        } catch (error) {
          if (!cancelled) {
            console.error("PDF annotation layer render failed", error);
          }
        }

        if (cancelled) {
          return;
        }
        const endOfContent = document.createElement("div");
        endOfContent.className = "endOfContent";
        if (textLayerContainer.childElementCount > 0) {
          textLayerContainer.append(endOfContent);
        }
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(error);
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      annotationLayerContainer?.replaceChildren();
      page?.cleanup();
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [pageNumber, pdf, width]);

  return (
    <>
      <canvas ref={canvasRef} className="block select-none" />
      <div
        ref={textLayerRef}
        className="textLayer"
        onMouseDown={(event) => event.currentTarget.classList.add("selecting")}
        onMouseUp={(event) => event.currentTarget.classList.remove("selecting")}
      />
      <div ref={annotationLayerRef} className="annotationLayer" />
    </>
  );
}

async function resolveOutlinePage(pdf: PDFDocumentProxy, destination: unknown): Promise<number | null> {
  if (!destination) {
    return null;
  }

  const resolved = typeof destination === "string"
    ? await pdf.getDestination(destination)
    : destination;
  if (!Array.isArray(resolved) || !resolved[0]) {
    return null;
  }

  try {
    return (await pdf.getPageIndex(resolved[0])) + 1;
  } catch {
    return null;
  }
}

export async function loadPdfOutline(pdf: PDFDocumentProxy, items: PdfOutlineItem[]): Promise<OutlineNode[]> {
  const nodes = await Promise.all(
    items.map(async (item): Promise<OutlineNode | null> => {
      const [page, children] = await Promise.all([
        resolveOutlinePage(pdf, item.dest),
        loadPdfOutline(pdf, item.items ?? []),
      ]);
      if (page === null && children.length === 0) {
        return null;
      }
      return {
        title: item.title?.trim() || "Untitled section",
        page,
        children: children.length > 0 ? children : undefined,
      } satisfies OutlineNode;
    }),
  );
  return nodes.filter((node): node is OutlineNode => node !== null);
}
