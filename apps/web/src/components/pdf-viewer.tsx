"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { useTranslation } from "@/lib/i18n-context";
import type { DocumentDetailResponseDto } from "@/lib/documents/types";
import { 
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, FileText, 
  X, Layout, ChevronRight as ChevronRightIcon,
  ArrowRightLeft,
  AlignLeft, Layers, RefreshCw
} from "lucide-react";

import { OutlineTree } from "./outline-tree";
import { SelectionPopover } from "./selection-popover";
export function PdfViewer() {
  const {
    currentWorkspace,
    documents,
    notes,
    threads,
    openDocumentIds,
    activeDocumentId,
    activePdfPage,
    leftSidebarOpen,
    rightPanelOpen,
    selectionText,
    openDocument,
    closeDocument,
    setActivePdfPage,
    setLeftSidebarOpen,
    setRightPanelOpen,
    setSelectionText,
    setActiveTab,
    sendMessage,
    createNote,
  } = useWorkspace();

  const { t } = useTranslation();

  const [zoom, setZoom] = useState(100);
  const [showOutlinePanel, setShowOutlinePanel] = useState(true); // Default open for large screens

  const [showSelectionPopup, setShowSelectionPopup] = useState(false);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [documentDetail, setDocumentDetail] = useState<DocumentDetailResponseDto | null>(null);
  const [detailError, setDetailError] = useState<{ key: string; message: string } | null>(null);
  const [detailReloadToken, setDetailReloadToken] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);

  const wsDocs = documents.filter((d) => d.workspaceId === currentWorkspace?.id);
  const activeDoc = wsDocs.find((d) => d.id === activeDocumentId && (d.status === "chunked" || d.status === "ready"));
  const detailKey = activeDoc ? `${activeDoc.id}:${activePdfPage}` : null;
  const activePage = activeDoc && documentDetail?.document.id === activeDoc.id
    ? documentDetail.pages.find((page) => page.pageNumber === activePdfPage)
    : undefined;
  const activeDetailError = detailKey && detailError?.key === detailKey ? detailError.message : null;
  const isLoadingDetail = Boolean(detailKey && !activePage && !activeDetailError);

  useEffect(() => {
    if (!currentWorkspace || !activeDoc) {
      return;
    }

    let cancelled = false;
    const requestKey = `${activeDoc.id}:${activePdfPage}`;
    void fetch(
      `/api/workspaces/${currentWorkspace.id}/documents/${activeDoc.id}?pageNumber=${activePdfPage}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load document detail.");
        }
        return (await response.json()) as DocumentDetailResponseDto;
      })
      .then((detail) => {
        if (!cancelled) {
          setDocumentDetail(detail);
          setDetailError(null);
          setActivePdfPage(detail.pages[0]?.pageNumber ?? 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailError({
            key: requestKey,
            message: t("viewer.pageLoadFailed"),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDoc, activePdfPage, currentWorkspace, detailReloadToken, setActivePdfPage, t]);

  const handleNextPage = () => {
    if (activeDoc && activePdfPage < activeDoc.pagesCount) {
      setActivePdfPage(activePdfPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (activePdfPage > 1) {
      setActivePdfPage(activePdfPage - 1);
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setShowSelectionPopup(false);
      setSelectionText(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 5 && selection.rangeCount > 0) {
      setSelectionText(text);
      const range = selection.getRangeAt(0);
      const selectionRect = range.getBoundingClientRect();
      
      if (paperRef.current) {
        const paperRect = paperRef.current.getBoundingClientRect();
        
        // Center popover relative to the selection bounding box
        const relativeX = selectionRect.left + (selectionRect.width / 2) - paperRect.left - 60;
        const relativeY = selectionRect.top - paperRect.top - 52;
        
        // Clamping to prevent clipping off the left/right boundaries of the paper
        const clampedX = Math.min(paperRect.width - 160, Math.max(10, relativeX));
        const clampedY = Math.max(10, relativeY);
        
        setPopupPos({
          x: clampedX,
          y: clampedY
        });
        setShowSelectionPopup(true);
      }
    } else {
      setShowSelectionPopup(false);
      setSelectionText(null);
    }
  };

  const handleAskAIAboutSelection = async () => {
    if (!selectionText) return;
    const text = selectionText;
    setShowSelectionPopup(false);
    setSelectionText(null);
    window.getSelection()?.removeAllRanges();

    setActiveTab("chat");
    if (!rightPanelOpen) setRightPanelOpen(true);
    
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
      }
    );
    setActiveTab("notes");
    if (!rightPanelOpen) setRightPanelOpen(true);
  };

  // Render Workspace Dashboard when no document is active
  if (!activeDoc) {
    const wsDocsCount = wsDocs.length;
    const wsNotesCount = notes.filter((n) => n.workspaceId === currentWorkspace?.id).length;
    const wsThreadsCount = threads.filter((t) => t.workspaceId === currentWorkspace?.id).length;

    return (
      <div className="flex h-full flex-1 flex-col overflow-y-auto bg-zinc-100 dark:bg-zinc-950 p-8 text-zinc-600 dark:text-zinc-300 transition-colors duration-200">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {/* Dashboard Header */}
          <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-8 shadow-md dark:shadow-2xl relative overflow-hidden transition">
            <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 blur-3xl rounded-full" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t("viewer.noDocTitle")}</span>
            <h1 className="mt-2.5 text-2xl font-black text-zinc-900 dark:text-white tracking-tight">{currentWorkspace?.name}</h1>
            <p className="mt-2 text-xs leading-6 text-zinc-500 dark:text-zinc-400">{currentWorkspace?.description || "暂无描述"}</p>
            
            <div className="mt-5 flex gap-4">
              {!leftSidebarOpen && (
                <button
                  onClick={() => setLeftSidebarOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-white border border-zinc-200 px-3.5 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <ChevronRightIcon className="h-4 w-4 shrink-0" />
                  展开侧边栏
                </button>
              )}
              {!rightPanelOpen && (
                <button
                  onClick={() => setRightPanelOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-white border border-zinc-200 px-3.5 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <ArrowRightLeft className="h-4 w-4 shrink-0" />
                  展开问答板
                </button>
              )}
            </div>
          </div>

          {/* Metric list */}
          <div className="grid grid-cols-3 gap-5">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/45 p-5 shadow-xs">
              <dt className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">{t("dashboard.docs")}</dt>
              <dd className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{wsDocsCount}</dd>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/45 p-5 shadow-xs">
              <dt className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">{t("dashboard.notes")}</dt>
              <dd className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{wsNotesCount}</dd>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/45 p-5 shadow-xs">
              <dt className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">{t("dashboard.threads")}</dt>
              <dd className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{wsThreadsCount}</dd>
            </div>
          </div>

        </div>
      </div>
    );
  }

  const pageCount = activeDoc.pagesCount;
  const percentage = Math.round(zoom);

  return (
    <div className="flex h-full flex-1 flex-col bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 transition-colors duration-200 overflow-hidden">
      
      {/* 1. Chrome-style Tabs Bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950 px-2 shrink-0 transition">
        
        {/* Horizontal tabs list (scrolls if overflowed) */}
        <div className="flex items-center overflow-x-auto min-w-0 flex-1 scrollbar-none mr-2">
          {openDocumentIds.map((docId) => {
            const doc = wsDocs.find((d) => d.id === docId);
            if (!doc) return null;
            const isActive = activeDocumentId === docId;

            return (
              <div
                key={docId}
                onClick={() => openDocument(docId)}
                className={`group flex items-center gap-1.5 border-r border-zinc-200 dark:border-zinc-900 px-4 py-3 text-xs cursor-pointer transition select-none shrink-0 ${
                  isActive
                    ? "bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white font-bold"
                    : "text-zinc-400 hover:bg-zinc-50/50 hover:text-zinc-800 dark:hover:bg-zinc-900/30 dark:hover:text-zinc-100"
                }`}
              >
                <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="truncate max-w-[120px]">{doc.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeDocument(docId);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Action Panel icons */}
        <div className="flex items-center gap-2 px-3 shrink-0">
          {/* Toggle Outline Document Tree Pane button */}
          <button
            onClick={() => setShowOutlinePanel(!showOutlinePanel)}
            className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
              showOutlinePanel 
                ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" 
                : "border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900"
            }`}
            title="切换文档大纲面板"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </button>

          {!leftSidebarOpen && (
            <button
              onClick={() => setLeftSidebarOpen(true)}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition flex items-center justify-center cursor-pointer"
              title="展开侧边栏"
            >
              <Layout className="h-3.5 w-3.5" />
            </button>
          )}
          {!rightPanelOpen && (
            <button
              onClick={() => setRightPanelOpen(true)}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition flex items-center justify-center cursor-pointer"
              title="展开问答板"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Viewer control toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 px-5 py-2 shrink-0 backdrop-blur-xs transition">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[9px] font-bold text-indigo-500 dark:text-indigo-400 shrink-0">
            {t("viewer.activeDoc")}
          </span>
          <span className="text-xs truncate font-semibold text-zinc-800 dark:text-zinc-300">{activeDoc.name}</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 border-r border-zinc-200 dark:border-zinc-800 pr-3">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition rounded"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 w-10 text-center">{percentage}%</span>
            <button
              onClick={() => setZoom(Math.min(180, zoom + 10))}
              className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition rounded"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevPage}
              disabled={activePdfPage <= 1}
              className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-20 disabled:hover:text-zinc-500 transition rounded"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
              {activePdfPage} / {pageCount} {t("viewer.pages")}
            </span>
            <button
              onClick={handleNextPage}
              disabled={activePdfPage >= pageCount}
              className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-20 disabled:hover:text-zinc-500 transition rounded"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Workspace Area: Sidebar Outline Tree + PDF Viewport */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Document Outline & Opened Editor Tree Drawer (Retractable Left Pane) */}
        {showOutlinePanel && (
          <aside className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950 flex flex-col shrink-0 overflow-y-auto transition duration-200 select-none">
            
            {/* Opened Documents Section */}
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-900/60">
              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                活动标签页 ({openDocumentIds.length})
              </span>
              <div className="mt-2.5 space-y-0.5">
                {openDocumentIds.map((docId) => {
                  const doc = wsDocs.find((d) => d.id === docId);
                  if (!doc) return null;
                  const isActive = activeDocumentId === docId;

                  return (
                    <div
                      key={`list-${docId}`}
                      onClick={() => openDocument(docId)}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                        isActive 
                          ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white font-bold" 
                          : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-indigo-500" : "text-zinc-400"}`} />
                        <span className="truncate max-w-[140px]">{doc.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeDocument(docId);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Document Outlines (Chapter Directory Tree) */}
            <OutlineTree
              activeDocumentId={activeDoc.id}
              activePdfPage={activePdfPage}
              setActivePdfPage={setActivePdfPage}
            />

          </aside>
        )}

        {/* Main PDF Page paper Canvas element */}
        <div className="flex-1 overflow-auto p-8 flex justify-center items-start">
          <div className="relative origin-top transition-all duration-200 w-full flex justify-center" style={{ transform: `scale(${zoom / 100})` }}>
            
            <div 
              ref={paperRef}
              onMouseUp={handleTextSelection}
              className="w-full max-w-[720px] rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 shadow-md dark:shadow-2xl select-text relative transition-all duration-200"
            >
              {/* Header pagination */}
              <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-900 pb-3.5 text-[9px] text-zinc-500 dark:text-zinc-500 font-bold uppercase tracking-wider">
                <span>{activeDoc.name}</span>
                <span>Page {activePdfPage} of {pageCount}</span>
              </div>

              {/* Content text */}
              <div key={activePdfPage} className="mt-8 space-y-4 animate-in fade-in duration-350">
                {activeDetailError ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <p className="text-xs leading-6 text-rose-500 dark:text-rose-400">{activeDetailError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setDetailError(null);
                        setDetailReloadToken((value) => value + 1);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t("viewer.retry")}
                    </button>
                  </div>
                ) : isLoadingDetail ? (
                  <p className="text-xs leading-6 text-zinc-500 dark:text-zinc-400">{t("viewer.pageLoading")}</p>
                ) : (
                  <p className="whitespace-pre-wrap text-xs leading-6 text-zinc-600 dark:text-zinc-400 text-justify">
                    {activePage?.text || t("viewer.pageEmpty")}
                  </p>
                )}
              </div>

              <div className="mt-12 text-center text-[9px] text-zinc-400 dark:text-zinc-600 font-bold tracking-wider">
                CONFIDENTIAL • DEVELOPMENT VIEW
              </div>
            </div>

            {/* Selection Popover action popover menu */}
            <SelectionPopover
              show={showSelectionPopup}
              text={selectionText}
              pos={popupPos}
              onAskAI={handleAskAIAboutSelection}
              onCaptureNote={handleCaptureNoteFromSelection}
              t={t}
            />

          </div>
        </div>

      </div>

    </div>
  );
}
