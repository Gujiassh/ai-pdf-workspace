"use client";

import { useCallback, useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import type { OutlineNode } from "./outline-tree";
import { loadPdfJs, loadPdfOutline, type PdfOutlineItem } from "./pdf-renderer";

type PdfLoadState = {
  assetId: string;
  reloadToken: number;
  pageCount: number;
  outline: OutlineNode[];
  hasError: boolean;
};

type PdfDocumentState = {
  assetId: string;
  reloadToken: number;
  pdf: PDFDocumentProxy;
};

type UsePdfDocumentOptions = {
  assetId: string | null;
  url: string | null;
  fallbackPageCount: number;
};

type UsePdfDocumentResult = {
  pdf: PDFDocumentProxy | null;
  pageCount: number;
  outline: OutlineNode[];
  hasError: boolean;
  retry: () => void;
  markPageError: (error: unknown) => void;
};

export function usePdfDocument({
  assetId,
  url,
  fallbackPageCount,
}: UsePdfDocumentOptions): UsePdfDocumentResult {
  const [reloadToken, setReloadToken] = useState(0);
  const [loadState, setLoadState] = useState<PdfLoadState | null>(null);
  const [documentState, setDocumentState] = useState<PdfDocumentState | null>(null);

  useEffect(() => {
    if (!assetId || !url) {
      return;
    }

    const currentAssetId = assetId;
    const currentUrl = url;
    let cancelled = false;
    let loadingTask: { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<unknown> } | null = null;
    let loadedPdf: PDFDocumentProxy | null = null;

    async function loadDocument() {
      try {
        const pdfjs = await loadPdfJs();
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument(currentUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        loadedPdf = pdf;
        setDocumentState({ assetId: currentAssetId, reloadToken, pdf });
        setLoadState({
          assetId: currentAssetId,
          reloadToken,
          pageCount: pdf.numPages,
          outline: [],
          hasError: false,
        });

        const outline = await pdf.getOutline();
        if (!cancelled && outline) {
          const pdfOutline = await loadPdfOutline(pdf, outline as PdfOutlineItem[]);
          setLoadState((previous) => {
            if (
              !previous
              || previous.assetId !== currentAssetId
              || previous.reloadToken !== reloadToken
            ) {
              return previous;
            }
            return { ...previous, outline: pdfOutline };
          });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLoadState({
          assetId: currentAssetId,
          reloadToken,
          pageCount: fallbackPageCount,
          outline: [],
          hasError: true,
        });
        console.error(error);
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
      if (loadedPdf) {
        void loadedPdf.destroy();
      } else if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [assetId, fallbackPageCount, reloadToken, url]);

  const activeLoadState = assetId
    && loadState?.assetId === assetId
    && loadState.reloadToken === reloadToken
    ? loadState
    : null;
  const activeDocumentState = assetId
    && documentState?.assetId === assetId
    && documentState.reloadToken === reloadToken
    ? documentState
    : null;

  const markPageError = useCallback((error: unknown) => {
    if (!assetId) {
      return;
    }
    setLoadState({
      assetId,
      reloadToken,
      pageCount: fallbackPageCount,
      outline: [],
      hasError: true,
    });
    console.error(error);
  }, [assetId, fallbackPageCount, reloadToken]);

  return {
    pdf: activeDocumentState?.pdf ?? null,
    pageCount: activeLoadState?.pageCount ?? fallbackPageCount,
    outline: activeLoadState?.outline ?? [],
    hasError: activeLoadState?.hasError ?? false,
    retry: () => setReloadToken((value) => value + 1),
    markPageError,
  };
}
