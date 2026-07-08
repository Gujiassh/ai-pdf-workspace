"use client";

import React, { useState, useEffect, useRef } from "react";
import { useWorkspace, Document } from "@/lib/mock-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, FileText, 
  X, Layout, ChevronRight as ChevronRightIcon,
  ArrowRightLeft, MousePointerSquareDashed,
  AlignLeft, Layers
} from "lucide-react";

import { OutlineTree } from "./outline-tree";
import { SelectionPopover } from "./selection-popover";
export function PdfViewer() {
  const {
    currentWorkspace,
    documents,
    notes,
    threads,
    tags,
    openDocumentIds,
    activeDocumentId,
    activePdfPage,
    leftSidebarOpen,
    rightPanelOpen,
    selectionText,
    openDocument,
    closeDocument,
    setActivePdfPage,
    toggleDocumentTag,
    addTag,
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
  const paperRef = useRef<HTMLDivElement>(null);

  const wsDocs = documents.filter((d) => d.workspaceId === currentWorkspace?.id);
  const activeDoc = wsDocs.find((d) => d.id === activeDocumentId && d.status === "ready");

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

  const getMockPdfContent = (docName: string, pageNum: number) => {
    const nameLower = docName.toLowerCase();
    
    if (nameLower.includes("attention")) {
      if (pageNum === 3) {
        return {
          title: "3.2 Scaled Dot-Product Attention",
          content: "We call our particular attention 'Scaled Dot-Product Attention'. The input consists of queries and keys of dimension d_k, and values of dimension d_v. We compute the dot products of the query with all keys, divide each by sqrt(d_k), and apply a softmax function to obtain the weights on the values. Scaling prevents the dot products from growing large in magnitude, which would push the softmax function into regions with extremely small gradients.",
          highlight: "Scaled Dot-Product Attention: softmax(QK^T / sqrt(d_k))V. Scaling factors prevent softmax vanishing gradients.",
          notes: "除以根号 dk 的比例修正项，是保障大模型长序列梯度流稳定的重要公式设计。"
        };
      }
      if (pageNum === 5) {
        return {
          title: "3.2.2 Multi-Head Attention",
          content: "Instead of performing a single attention function with d_model-dimensional keys, values and queries, we found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections to d_k, d_k and d_v dimensions, respectively. On each of these projected versions of queries, keys and values we then perform the attention function in parallel, yielding d_v-dimensional output values.",
          highlight: "Multi-head attention projects Queries, Keys and Values h times with different learnable projections.",
          notes: "多视角映射：允许模型在语法结构与指代关系中平行观察上下文关联。"
        };
      }
      return {
        title: `Transformer Network Architecture - Section ${pageNum}`,
        content: `This is page ${pageNum} of the Transformer deep learning paper. The network eliminates recurrence and convolutions entirely, relying solely on self-attention blocks to map input sequences to output sequences. This structure supports maximum hardware parallelization.`,
        notes: `本页（第 ${pageNum} 页）描述了自注意力编码栈层间的前馈网络（Feed-Forward Network）细节。`
      };
    }
    
    if (nameLower.includes("rag")) {
      if (pageNum === 1) {
        return {
          title: "1. Introduction to Retrieval-Augmented Generation",
          content: "We propose a general RAG framework utilizing pre-trained seq2seq models as parametric memory and dense passage embeddings as non-parametric memory. The dense retriever is queried to fetch top-k document passages, which are then integrated as prompting context to help the generator output results.",
          highlight: "RAG models combine parametric seq2seq models with non-parametric dense index database.",
          notes: "RAG 结合了参数化知识与外置数据库检索，大幅提升了知识时效性并缓解了模型幻觉。"
        };
      }
      return {
        title: `RAG Framework Evaluation - Page ${pageNum}`,
        content: `This is page ${pageNum} of the RAG publication. It outlines the dense passage retrieval parameters, similarity metric dot-products, and generator prompt assembly.`,
        notes: `本页（第 ${pageNum} 页）分析了如何使用 DPR 召回 Wikipedia 密集知识片段进行跨源问答。`
      };
    }

    if (nameLower.includes("nda")) {
      if (pageNum === 3) {
        return {
          title: "Clause 3. Survival and Obligations",
          content: "The confidentiality covenants and obligations set forth under this Agreement shall survive the termination or expiration of this Agreement and remain fully binding on the Receiving Party for a term of three (3) years from the effective date of termination, after which the Receiving Party's obligations shall cease.",
          highlight: "Obligations shall survive for three (3) years from the date of termination.",
          notes: "期限条款审核：3年保密期过短，算法与核心数据资产应当变更为永久保密。"
        };
      }
      if (pageNum === 4) {
        return {
          title: "Clause 4. Injunctive Judicial Remedies",
          content: "The parties agree that monetary damages alone will not be a sufficient remedy for any breach of this Agreement. Consequently, the Disclosing Party shall be entitled to seek temporary or permanent injunctive relief in a court of competent jurisdiction to restrain the Receiving Party from violating these terms.",
          highlight: "Disclosing party is entitled to seek injunctive relief to prevent breaches.",
          notes: "救济方式审核：禁止令有利于被侵权方以极快的司法干预中止侵权传播。"
        };
      }
      return {
        title: `Bilateral NDA Clauses - Page ${pageNum}`,
        content: `This is page ${pageNum} of the standard Non-Disclosure Agreement. It outlines defining features of proprietary information and typical dispute resolution structures.`,
        notes: `本页（第 ${pageNum} 页）描述了不合规保密除外情形（如公众已知数据、独立开发数据等）。`
      };
    }

    return {
      title: `未命名文档 - 第 ${pageNum} 页`,
      content: `这是文档《${docName}》第 ${pageNum} 页的文本预览。可以用鼠标在此处“滑动选择一段文字”触发咱划词选段交互控制台进行问答与笔记汪！`,
      notes: `当前位置（第 ${pageNum} 页）未匹配到特定的 RAG 召回高亮。`
    };
  };

  // Render Workspace Dashboard when no document is active
  if (!activeDoc) {
    const wsDocsCount = wsDocs.length;
    const wsNotesCount = notes.filter((n) => n.workspaceId === currentWorkspace?.id).length;
    const wsThreadsCount = threads.filter((t) => t.workspaceId === currentWorkspace?.id).length;

    return (
      <div className="flex h-full flex-1 flex-col overflow-y-auto bg-zinc-50 dark:bg-zinc-955 p-8 text-zinc-600 dark:text-zinc-300 transition-colors duration-200">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {/* Dashboard Header */}
          <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-8 shadow-md dark:shadow-2xl relative overflow-hidden transition">
            <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 blur-3xl rounded-full" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-550">{t("viewer.noDocTitle")}</span>
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
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-5 shadow-xs">
              <dt className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">{t("dashboard.docs")}</dt>
              <dd className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{wsDocsCount}</dd>
              <dd className="mt-1.5 text-[9px] text-zinc-400 dark:text-zinc-600 font-bold">支持多标签同时浏览</dd>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-5 shadow-xs">
              <dt className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">{t("dashboard.notes")}</dt>
              <dd className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{wsNotesCount}</dd>
              <dd className="mt-1.5 text-[9px] text-zinc-400 dark:text-zinc-600 font-bold">双击/一键极速抓取</dd>
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-5 shadow-xs">
              <dt className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">{t("dashboard.threads")}</dt>
              <dd className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{wsThreadsCount}</dd>
              <dd className="mt-1.5 text-[9px] text-zinc-400 dark:text-zinc-600 font-bold">智能问答上下文隔离</dd>
            </div>
          </div>

          {/* Empty guide panel */}
          {openDocumentIds.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/10 p-12 text-center transition">
              <MousePointerSquareDashed className="h-8 w-8 text-zinc-400" />
              <h4 className="mt-3 text-xs font-bold text-zinc-900 dark:text-white">{t("viewer.noDocTitle")}</h4>
              <p className="mt-1.5 w-80 text-[10px] leading-5 text-zinc-500 dark:text-zinc-400">
                {t("viewer.noDocDesc")}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const pageContent = getMockPdfContent(activeDoc.name, activePdfPage);
  const percentage = Math.round(zoom);

  return (
    <div className="flex h-full flex-1 flex-col bg-zinc-105 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition-colors duration-200 overflow-hidden">
      
      {/* 1. Chrome-style Tabs Bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 shrink-0 transition">
        
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
                    : "text-zinc-400 hover:bg-zinc-50/50 hover:text-zinc-850 dark:hover:bg-zinc-900/30 dark:hover:text-zinc-100"
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
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/30 px-5 py-2 shrink-0 backdrop-blur-xs transition">
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
              {activePdfPage} / {activeDoc.pagesCount} {t("viewer.pages")}
            </span>
            <button
              onClick={handleNextPage}
              disabled={activePdfPage >= activeDoc.pagesCount}
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
          <aside className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col shrink-0 overflow-y-auto transition duration-200 select-none">
            
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
              className="w-full max-w-[720px] rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-12 shadow-md dark:shadow-2xl select-text relative transition-all duration-200"
            >
              {/* Header pagination */}
              <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-900 pb-3.5 text-[9px] text-zinc-450 dark:text-zinc-500 font-bold uppercase tracking-wider">
                <span>{activeDoc.name}</span>
                <span>Page {activePdfPage} of {activeDoc.pagesCount}</span>
              </div>

              {/* Content text */}
              <div key={activePdfPage} className="mt-8 space-y-4 animate-in fade-in duration-350">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">{pageContent.title}</h2>
                <p className="text-xs leading-6 text-zinc-655 dark:text-zinc-400 text-justify">
                  {pageContent.content}
                </p>

                {/* RAG highlight */}
                {pageContent.highlight && (
                  <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 dark:bg-amber-500/10 p-4 animate-in fade-in duration-300 animate-citation-pulse">
                    <span className="text-[9px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider block">{t("viewer.highlightTitle")}</span>
                    <p className="mt-1 text-xs leading-6 font-semibold text-zinc-800 dark:text-zinc-300 italic">
                      "{pageContent.highlight}"
                    </p>
                  </div>
                )}

                {/* Bottom margins notes */}
                <div className="mt-8 border-t border-zinc-100 dark:border-zinc-900 pt-5">
                  <span className="text-[9px] font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider block">{t("viewer.annotationTitle")}</span>
                  <p className="mt-1 text-xs leading-6 text-zinc-500 font-semibold">
                    {pageContent.notes}
                  </p>
                </div>
              </div>

              <div className="mt-12 text-center text-[9px] text-zinc-400 dark:text-zinc-600 font-bold tracking-wider">
                CONFIDENTIAL • DEVELOPMENT MOCK VIEW
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
