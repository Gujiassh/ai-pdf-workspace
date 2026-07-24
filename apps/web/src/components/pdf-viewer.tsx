"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlignLeft,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  SquareDashedMousePointer,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useTranslation } from "@/lib/i18n-context";
import type { EvidenceRendererProps } from "@/lib/evidence/registry";
import type { SpatialRegion } from "@/lib/evidence/types";
import { useWorkspace } from "@/lib/workspace-context";
import type { AssetDetailResponseDto, OcrTextBlockDto } from "@/lib/assets/types";

import { OutlineTree } from "./outline-tree";
import { PdfPageSurface } from "./pdf-renderer";
import type { PdfRenderedGeometry } from "./pdf-renderer";
import {
  createSurfaceRegion,
  isPdfGeometryCompatible,
  normalizeSurfacePoint,
  type SurfacePoint,
} from "./pdf-region-geometry";
import { resolvePdfPageInput } from "./pdf-viewer-links";
import { SelectionPopover } from "./selection-popover";
import { usePdfDocument } from "./use-pdf-document";

export function PdfEvidenceRenderer({ asset, locator }: EvidenceRendererProps) {
  const {
    currentWorkspace,
    activePdfPage,
    selectionText,
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
  const [regionSelectionMode, setRegionSelectionMode] = useState(false);
  const [regionSelection, setRegionSelection] = useState<SpatialRegion | null>(null);
  const [regionPreview, setRegionPreview] = useState<SpatialRegion | null>(null);
  const [ocrPage, setOcrPage] = useState<{ key: string; blocks: OcrTextBlockDto[] }>({ key: "", blocks: [] });
  const [renderedGeometry, setRenderedGeometry] = useState<{
    key: string;
    value: PdfRenderedGeometry;
  } | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const regionStartRef = useRef<SurfacePoint | null>(null);

  const activePdfAssetId = asset.id;
  const ocrPageKey = `${activePdfAssetId}:${activePdfPage}`;
  const ocrBlocks = ocrPage.key === ocrPageKey ? ocrPage.blocks : [];
  const pdfUrl = currentWorkspace
    ? `/api/workspaces/${currentWorkspace.id}/assets/${asset.id}/file`
    : null;

  useEffect(() => {
    const workspaceId = currentWorkspace?.id;
    if (!workspaceId) {
      return;
    }

    let cancelled = false;
    fetch(`/api/workspaces/${workspaceId}/assets/${activePdfAssetId}?pageNumber=${activePdfPage}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("OCR page data request failed.");
        return response.json() as Promise<AssetDetailResponseDto>;
      })
      .then((payload) => {
        if (!cancelled) {
          setOcrPage({
            key: ocrPageKey,
            blocks: payload.detail.kind === "pdf" ? payload.detail.pages[0]?.ocrBlocks ?? [] : [],
          });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activePdfAssetId, activePdfPage, currentWorkspace?.id, ocrPageKey]);
  const {
    pdf: activePdfDocument,
    pageCount,
    outline: pdfOutline,
    hasError: pdfError,
    retry: retryPdf,
    markPageError,
  } = usePdfDocument({
    assetId: activePdfAssetId,
    url: pdfUrl,
    fallbackPageCount: 0,
  });
  const pdfPageWidth = Math.max(280, Math.min(1200, Math.floor(viewerWidth * zoom / 100)));
  const currentRenderedGeometry = renderedGeometry?.key === ocrPageKey
    ? renderedGeometry.value
    : null;
  const regionGeometryMatches = locator?.kind !== "pdf_region"
    || (currentRenderedGeometry !== null
      && isPdfGeometryCompatible(locator.pageGeometry, currentRenderedGeometry));

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
    if (!viewerRef.current) {
      return;
    }

    viewerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    setIsCitationPulseVisible(true);
    const timeout = window.setTimeout(() => setIsCitationPulseVisible(false), 2200);
    return () => window.clearTimeout(timeout);
  }, [activePdfAssetId, activePdfPage, locator]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (!regionSelectionMode && !regionSelection)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setRegionSelectionMode(false);
      setRegionSelection(null);
      setRegionPreview(null);
      regionStartRef.current = null;
    };
    window.addEventListener("keydown", handleEscape, { capture: true });
    return () => window.removeEventListener("keydown", handleEscape, { capture: true });
  }, [regionSelection, regionSelectionMode]);

  const navigateToPage = (page: number) => {
    setRegionSelectionMode(false);
    setRegionSelection(null);
    setRegionPreview(null);
    regionStartRef.current = null;
    setActivePdfPage(page);
  };

  const handleNextPage = () => {
    if (activePdfPage < pageCount) {
      navigateToPage(activePdfPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (activePdfPage > 1) {
      navigateToPage(activePdfPage - 1);
    }
  };

  const commitPageInput = (input: HTMLInputElement) => {
    const nextPage = resolvePdfPageInput(input.value, pageCount, activePdfPage);
    input.value = String(nextPage);
    if (nextPage !== activePdfPage) {
      navigateToPage(nextPage);
    }
  };

  const handlePageError = (error: unknown) => {
    markPageError(error);
  };

  const handleTextSelection = () => {
    if (regionSelectionMode) {
      return;
    }
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

  const toggleRegionSelectionMode = () => {
    setRegionSelectionMode((current) => {
      const next = !current;
      if (next) {
        setShowSelectionPopup(false);
        setSelectionText(null);
        setRegionSelection(null);
        window.getSelection()?.removeAllRanges();
      } else {
        setRegionPreview(null);
        regionStartRef.current = null;
      }
      return next;
    });
  };

  const getRegionPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = paperRef.current?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }
    return {
      point: normalizeSurfacePoint(event.clientX, event.clientY, bounds),
      surface: { width: bounds.width, height: bounds.height },
    };
  };

  const handleRegionPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!regionSelectionMode || event.button !== 0) {
      return;
    }
    const pointer = getRegionPointer(event);
    if (!pointer) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    regionStartRef.current = pointer.point;
    setRegionSelection(null);
    setRegionPreview(null);
  };

  const handleRegionPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = regionStartRef.current;
    if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const pointer = getRegionPointer(event);
    if (!pointer) {
      return;
    }
    setRegionPreview(createSurfaceRegion(start, pointer.point, pointer.surface, 0));
  };

  const handleRegionPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = regionStartRef.current;
    const pointer = start ? getRegionPointer(event) : null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    regionStartRef.current = null;
    setRegionPreview(null);
    if (!start || !pointer) {
      return;
    }
    const region = createSurfaceRegion(start, pointer.point, pointer.surface);
    setRegionSelection(region);
    if (region) {
      setRegionSelectionMode(false);
    }
  };

  const handleRegionPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    regionStartRef.current = null;
    setRegionPreview(null);
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
    if (!selectionText) return;
    const text = selectionText;
    setShowSelectionPopup(false);
    setSelectionText(null);
    window.getSelection()?.removeAllRanges();

    createNote(
      t("pdf.selectionTitleTemplate").replace("{doc}", asset.title),
      t("chat.noteContentTemplate").replace("{snippet}", text),
    );
    setActiveTab("notes");
    closeEvidencePanel();
  };

  if (!pdfUrl) {
    return null;
  }

  return (
    <div data-pdf-viewer className="flex h-full flex-1 flex-col overflow-hidden bg-zinc-100 text-zinc-600 transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-300">
      <div className="flex shrink-0 items-center justify-end border-b border-zinc-200 bg-white/90 px-2 transition dark:border-zinc-800 dark:bg-zinc-950">
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
          <button
            type="button"
            data-pdf-region-select
            aria-pressed={regionSelectionMode}
            onClick={toggleRegionSelectionMode}
            className={`flex h-11 w-11 items-center justify-center rounded-md border transition sm:h-8 sm:w-8 ${
              regionSelectionMode
                ? "border-cyan-600 bg-cyan-600 text-white"
                : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
            }`}
            title={t("viewer.regionSelect")}
            aria-label={t("viewer.regionSelect")}
          >
            <SquareDashedMousePointer className="h-3.5 w-3.5" />
          </button>
          {regionSelection ? (
            <button
              type="button"
              data-pdf-region-clear
              onClick={() => setRegionSelection(null)}
              className="flex h-11 w-11 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 sm:h-8 sm:w-8 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
              title={t("viewer.regionClear")}
              aria-label={t("viewer.regionClear")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/80 px-5 py-2 backdrop-blur-xs transition dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-300">{asset.title}</span>
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
                key={`${activePdfAssetId}:${activePdfPage}`}
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
            <OutlineTree
              activeAssetId={asset.id}
              activePdfPage={activePdfPage}
              setActivePdfPage={navigateToPage}
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
              data-pdf-paper
              onMouseUp={handleTextSelection}
              style={{ width: pdfPageWidth }}
              className={`relative self-start bg-white shadow-2xl ring-1 ring-black/10 dark:ring-white/10 ${
                isCitationPulseVisible ? "animate-citation-pulse" : ""
              }`}
            >
              <PdfPageSurface
                pdf={activePdfDocument}
                pageNumber={Math.min(activePdfPage, pageCount || 1)}
                width={pdfPageWidth}
                ocrBlocks={ocrBlocks}
                onError={handlePageError}
                onNavigate={navigateToPage}
                onGeometry={(geometry) => setRenderedGeometry({ key: ocrPageKey, value: geometry })}
              />
              {locator?.kind === "pdf_region"
              && locator.coordinateSpace === "pdf_crop_box_normalized_top_left_v1"
              && locator.pageNumber === activePdfPage
              && regionGeometryMatches ? (
                <div className="pointer-events-none absolute inset-0 z-[5]" data-evidence-regions>
                  {locator.regions.map((region, index) => (
                    <div
                      key={`${region.x}:${region.y}:${index}`}
                      className="absolute border-2 border-amber-500 bg-amber-300/20 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
                      style={{
                        left: `${region.x * 100}%`,
                        top: `${region.y * 100}%`,
                        width: `${region.width * 100}%`,
                        height: `${region.height * 100}%`,
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {locator?.kind === "pdf_region" && locator.pageNumber === activePdfPage && !regionGeometryMatches && currentRenderedGeometry ? (
                <div className="absolute inset-x-4 top-4 z-[6] border border-rose-300 bg-white/95 px-3 py-2 text-xs font-medium text-rose-700 shadow-sm dark:border-rose-900 dark:bg-zinc-950/95 dark:text-rose-300">
                  {t("viewer.locatorMismatch")}
                </div>
              ) : null}
              {regionSelection || regionPreview ? (
                <div className="pointer-events-none absolute inset-0 z-[9]" data-pdf-region-draft>
                  <div
                    className="absolute border-2 border-cyan-600 bg-cyan-300/20 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
                    style={{
                      left: `${(regionPreview ?? regionSelection)!.x * 100}%`,
                      top: `${(regionPreview ?? regionSelection)!.y * 100}%`,
                      width: `${(regionPreview ?? regionSelection)!.width * 100}%`,
                      height: `${(regionPreview ?? regionSelection)!.height * 100}%`,
                    }}
                  />
                </div>
              ) : null}
              {regionSelectionMode ? (
                <div
                  data-pdf-region-selection-surface
                  className="absolute inset-0 z-[10] cursor-crosshair touch-none"
                  onPointerDown={handleRegionPointerDown}
                  onPointerMove={handleRegionPointerMove}
                  onPointerUp={handleRegionPointerUp}
                  onPointerCancel={handleRegionPointerCancel}
                />
              ) : null}
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
