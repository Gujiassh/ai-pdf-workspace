"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Layers,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useTranslation } from "@/lib/i18n-context";
import { useWorkspace } from "@/lib/workspace-context";
import type { OcrTextBlockDto } from "@/lib/documents/types";

import { OutlineTree } from "./outline-tree";
import { PdfPageSurface } from "./pdf-renderer";
import { PdfViewerEmptyState } from "./pdf-viewer-empty-state";
import { resolvePdfPageInput } from "./pdf-viewer-links";
import { SelectionPopover } from "./selection-popover";
import { usePdfDocument } from "./use-pdf-document";

export function PdfViewer() {
  const {
    currentWorkspace,
    documents,
    openDocumentIds,
    activeDocumentId,
    activePdfPage,
    selectionText,
    openDocument,
    closeDocument,
    setActivePdfPage,
    closeEvidencePanel,
    setSelectionText,
    setActiveTab,
    sendMessage,
    createNote,
  } = useWorkspace();
  const { t } = useTranslation();

  const [zoom, setZoom] = useState(100);
  const [showOutlinePanel, setShowOutlinePanel] = useState(false);
  const [showSelectionPopup, setShowSelectionPopup] = useState(false);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [viewerWidth, setViewerWidth] = useState(760);
  const [isCitationPulseVisible, setIsCitationPulseVisible] = useState(false);
  const [ocrPage, setOcrPage] = useState<{ key: string; blocks: OcrTextBlockDto[] }>({ key: "", blocks: [] });
  const paperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const wsDocs = documents.filter((document) => document.workspaceId === currentWorkspace?.id);
  const activeDoc = wsDocs.find(
    (document) => document.id === activeDocumentId && (document.status === "chunked" || document.status === "ready"),
  );
  const activePdfDocumentId = activeDoc?.id ?? null;
  const ocrPageKey = `${activePdfDocumentId ?? ""}:${activePdfPage}`;
  const ocrBlocks = ocrPage.key === ocrPageKey ? ocrPage.blocks : [];
  const pdfUrl = currentWorkspace && activeDoc
    ? `/api/workspaces/${currentWorkspace.id}/documents/${activeDoc.id}/file`
    : null;

  useEffect(() => {
    const workspaceId = currentWorkspace?.id;
    if (!workspaceId || !activePdfDocumentId) {
      return;
    }

    let cancelled = false;
    fetch(`/api/workspaces/${workspaceId}/documents/${activePdfDocumentId}?pageNumber=${activePdfPage}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("OCR page data request failed.");
        return response.json() as Promise<{ pages?: Array<{ ocrBlocks?: OcrTextBlockDto[] }> }>;
      })
      .then((payload) => {
        if (!cancelled) {
          setOcrPage({ key: ocrPageKey, blocks: payload.pages?.[0]?.ocrBlocks ?? [] });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activePdfDocumentId, activePdfPage, currentWorkspace?.id, ocrPageKey]);
  const {
    pdf: activePdfDocument,
    pageCount,
    outline: pdfOutline,
    hasError: pdfError,
    retry: retryPdf,
    markPageError,
  } = usePdfDocument({
    documentId: activePdfDocumentId,
    url: pdfUrl,
    fallbackPageCount: activeDoc?.pagesCount ?? 0,
  });
  const pdfPageWidth = Math.max(280, Math.min(1200, Math.floor(viewerWidth * zoom / 100)));

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setViewerWidth(Math.max(280, entry.contentRect.width - 48));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        setShowOutlinePanel(false);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!activePdfDocumentId || !viewerRef.current) {
      return;
    }

    viewerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    setIsCitationPulseVisible(true);
    const timeout = window.setTimeout(() => setIsCitationPulseVisible(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [activePdfDocumentId, activePdfPage]);

  const handleNextPage = () => {
    if (activePdfPage < pageCount) {
      setActivePdfPage(activePdfPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (activePdfPage > 1) {
      setActivePdfPage(activePdfPage - 1);
    }
  };

  const commitPageInput = (input: HTMLInputElement) => {
    const nextPage = resolvePdfPageInput(input.value, pageCount, activePdfPage);
    input.value = String(nextPage);
    if (nextPage !== activePdfPage) {
      setActivePdfPage(nextPage);
    }
  };

  const handlePageError = (error: unknown) => {
    if (!activePdfDocumentId) {
      return;
    }
    markPageError(error);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setShowSelectionPopup(false);
      setSelectionText(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length <= 5 || selection.rangeCount === 0 || !paperRef.current) {
      setShowSelectionPopup(false);
      setSelectionText(null);
      return;
    }

    setSelectionText(text);
    const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
    const paperRect = paperRef.current.getBoundingClientRect();
    const relativeX = selectionRect.left + selectionRect.width / 2 - paperRect.left - 60;
    const relativeY = selectionRect.top - paperRect.top - 52;
    setPopupPos({
      x: Math.min(paperRect.width - 160, Math.max(10, relativeX)),
      y: Math.max(10, relativeY),
    });
    setShowSelectionPopup(true);
  };

  const handleAskAIAboutSelection = async () => {
    if (!selectionText) return;
    const text = selectionText;
    setShowSelectionPopup(false);
    setSelectionText(null);
    window.getSelection()?.removeAllRanges();

    setActiveTab("chat");
    closeEvidencePanel();
    await sendMessage(t("pdf.explainSelection").replace("{text}", text));
  };

  const handleCaptureNoteFromSelection = () => {
    if (!selectionText || !activeDoc) return;
    const text = selectionText;
    setShowSelectionPopup(false);
    setSelectionText(null);
    window.getSelection()?.removeAllRanges();

    createNote(
      t("pdf.selectionTitleTemplate").replace("{doc}", activeDoc.name),
      t("chat.noteContentTemplate").replace("{snippet}", text),
      {
        documentId: activeDoc.id,
        documentName: activeDoc.name,
        pageNumber: activePdfPage,
        snippet: text,
      },
    );
    setActiveTab("notes");
    closeEvidencePanel();
  };

  if (!activeDoc || !pdfUrl) {
    return (
      <PdfViewerEmptyState
        workspaceName={currentWorkspace?.name}
        documentsCount={wsDocs.length}
      />
    );
  }

  return (
    <div data-pdf-viewer className="flex h-full flex-1 flex-col overflow-hidden bg-zinc-100 text-zinc-600 transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-300">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/90 px-2 transition dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mr-2 flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-none">
          {openDocumentIds.map((docId) => {
            const doc = wsDocs.find((item) => item.id === docId);
            if (!doc) return null;
            const isActive = activeDocumentId === docId;

            return (
              <div
                key={docId}
                onClick={() => openDocument(docId)}
                className={`group flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-zinc-200 px-4 py-3 text-xs transition dark:border-zinc-900 ${
                  isActive
                    ? "bg-zinc-50 font-bold text-zinc-900 dark:bg-zinc-900 dark:text-white"
                    : "text-zinc-400 hover:bg-zinc-50/50 hover:text-zinc-800 dark:hover:bg-zinc-900/30 dark:hover:text-zinc-100"
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="max-w-[120px] truncate">{doc.name}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeDocument(docId);
                  }}
                  className="rounded p-0.5 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-900 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-white"
                  aria-label="关闭文档"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => setShowOutlinePanel((value) => !value)}
            className={`flex items-center justify-center rounded-lg border p-1.5 transition ${
              showOutlinePanel
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-zinc-200 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-white"
            }`}
            title="切换文档大纲面板"
            aria-label="切换文档大纲面板"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/80 px-5 py-2 backdrop-blur-xs transition dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-300">{activeDoc.name}</span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-1 border-r border-zinc-200 pr-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(50, value - 10))}
              className="rounded p-1 text-zinc-400 transition hover:text-zinc-900 dark:hover:text-white"
              title="缩小"
              aria-label="缩小"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-10 text-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400">{zoom}%</span>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(180, value + 10))}
              className="rounded p-1 text-zinc-400 transition hover:text-zinc-900 dark:hover:text-white"
              title="放大"
              aria-label="放大"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={activePdfPage <= 1}
              className="rounded p-1 text-zinc-400 transition hover:text-zinc-900 disabled:opacity-20 dark:hover:text-white"
              title="上一页"
              aria-label="上一页"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <label className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
              <span className="sr-only">{t("viewer.pageInput")}</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                data-pdf-page-input
                key={`${activePdfDocumentId}:${activePdfPage}`}
                defaultValue={activePdfPage}
                onChange={(event) => {
                  event.currentTarget.value = event.currentTarget.value.replace(/[^0-9]/g, "");
                }}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={(event) => commitPageInput(event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitPageInput(event.currentTarget);
                    event.currentTarget.blur();
                  } else if (event.key === "Escape") {
                    event.currentTarget.value = String(activePdfPage);
                    event.currentTarget.blur();
                  }
                }}
                aria-label={t("viewer.pageInput")}
                className="h-7 w-10 rounded-md border border-zinc-200 bg-white px-1 text-center text-[10px] font-bold text-zinc-700 outline-none transition focus:border-amber-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              />
              <span>/ {pageCount}</span>
            </label>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={activePdfPage >= pageCount}
              className="rounded p-1 text-zinc-400 transition hover:text-zinc-900 disabled:opacity-20 dark:hover:text-white"
              title="下一页"
              aria-label="下一页"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showOutlinePanel ? (
          <aside className="flex w-64 shrink-0 select-none flex-col overflow-y-auto border-r border-zinc-200 bg-white/90 transition duration-200 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-100 p-4 dark:border-zinc-900/60">
              <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                <Layers className="h-3.5 w-3.5" />
                活动标签页 ({openDocumentIds.length})
              </span>
              <div className="mt-2.5 space-y-0.5">
                {openDocumentIds.map((docId) => {
                  const doc = wsDocs.find((item) => item.id === docId);
                  if (!doc) return null;
                  const isActive = activeDocumentId === docId;
                  return (
                    <div
                      key={`list-${docId}`}
                      onClick={() => openDocument(docId)}
                      className={`group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition ${
                        isActive
                          ? "bg-zinc-100 font-bold text-zinc-900 dark:bg-zinc-900 dark:text-white"
                          : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/40"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <FileText className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-emerald-600" : "text-zinc-400"}`} />
                        <span className="max-w-[140px] truncate">{doc.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeDocument(docId);
                        }}
                        className="rounded p-0.5 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-900 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-white"
                        aria-label="关闭文档"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <OutlineTree
              activeDocumentId={activeDoc.id}
              activePdfPage={activePdfPage}
              setActivePdfPage={setActivePdfPage}
              outline={pdfOutline}
            />
          </aside>
        ) : null}

        <div ref={viewerRef} className="flex min-w-0 flex-1 justify-center overflow-auto bg-zinc-100 p-6 transition dark:bg-zinc-900">
          {pdfError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-xs leading-6 text-rose-500 dark:text-rose-400">{t("viewer.documentLoadFailed")}</p>
              <button
                type="button"
                onClick={retryPdf}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("viewer.retry")}
              </button>
            </div>
          ) : activePdfDocument ? (
            <div
              ref={paperRef}
              onMouseUp={handleTextSelection}
              style={{ width: pdfPageWidth }}
              className={`relative bg-white shadow-2xl ring-1 ring-black/10 dark:ring-white/10 ${
                isCitationPulseVisible ? "animate-citation-pulse" : ""
              }`}
            >
              <PdfPageSurface
                pdf={activePdfDocument}
                pageNumber={Math.min(activePdfPage, pageCount || 1)}
                width={pdfPageWidth}
                ocrBlocks={ocrBlocks}
                onError={handlePageError}
                onNavigate={setActivePdfPage}
              />
              <SelectionPopover
                show={showSelectionPopup}
                text={selectionText}
                pos={popupPos}
                onAskAI={handleAskAIAboutSelection}
                onCaptureNote={handleCaptureNoteFromSelection}
                t={t}
              />
            </div>
          ) : (
            <p className="pt-8 text-xs text-zinc-500">{t("viewer.documentLoading")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
