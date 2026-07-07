"use client";

import React, { useState, useEffect, useRef } from "react";
import { useWorkspace, Document } from "@/lib/mock-context";
import { 
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, FileText, 
  X, Sparkles, Layout, ChevronRight as ChevronRightIcon,
  Tag as TagIcon, ArrowRightLeft, MousePointerSquareDashed,
  BookmarkPlus, MessageSquareHeart
} from "lucide-react";

export function PdfViewer() {
  const {
    currentWorkspace,
    documents,
    notes,
    threads,
    tags,
    
    // Adaptive Layout states
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

  const [zoom, setZoom] = useState(100);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  
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

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    addTag(newTagName.trim());
    if (activeDoc) {
      toggleDocumentTag(activeDoc.id, newTagName.trim());
    }
    setNewTagName("");
  };

  // Selection popup handler simulation
  const handleTextSelection = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    
    if (text.length > 5) {
      setSelectionText(text);
      // Calculate coordinates relative to container
      if (paperRef.current) {
        const rect = paperRef.current.getBoundingClientRect();
        setPopupPos({
          x: Math.min(rect.width - 150, Math.max(20, e.clientX - rect.left - 60)),
          y: Math.max(10, e.clientY - rect.top - 65)
        });
        setShowSelectionPopup(true);
      }
    } else {
      setShowSelectionPopup(false);
      setSelectionText(null);
    }
  };

  // Ask AI about selection
  const handleAskAIAboutSelection = async () => {
    if (!selectionText) return;
    const text = selectionText;
    setShowSelectionPopup(false);
    setSelectionText(null);
    window.getSelection()?.removeAllRanges();

    // Trigger AI Chat
    setActiveTab("chat");
    if (!rightPanelOpen) setRightPanelOpen(true);
    
    await sendMessage(`请解析文档这段文字的具体含义：\n"${text}"`);
  };

  // Capture Note from selection
  const handleCaptureNoteFromSelection = () => {
    if (!selectionText || !activeDoc) return;
    const text = selectionText;
    setShowSelectionPopup(false);
    setSelectionText(null);
    window.getSelection()?.removeAllRanges();

    createNote(
      `基于《${activeDoc.name}》划词选段的摘录`,
      `引文原文：\n"${text}"\n\n我的备忘结论：\n`,
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
      <div className="flex h-full flex-1 flex-col bg-zinc-950 p-8 overflow-y-auto text-zinc-300">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {/* Dashboard Header */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 blur-3xl rounded-full" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">自研分屏协同版</span>
            <h1 className="mt-2.5 text-3xl font-extrabold text-white tracking-tight">{currentWorkspace?.name}</h1>
            <p className="mt-2 text-xs leading-6 text-zinc-400">{currentWorkspace?.description || "暂无描述"}</p>
            
            <div className="mt-5 flex gap-4">
              {/* Collapsed left sidebar toggle if collapsed */}
              {!leftSidebarOpen && (
                <button
                  onClick={() => setLeftSidebarOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-850"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                  展开左导航
                </button>
              )}
              {!rightPanelOpen && (
                <button
                  onClick={() => setRightPanelOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-850"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  开启右对话
                </button>
              )}
            </div>
          </div>

          {/* Metric list */}
          <div className="grid grid-cols-3 gap-5">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
              <dt className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">上传文档数</dt>
              <dd className="mt-1 text-3xl font-bold text-white tracking-tight">{wsDocsCount}</dd>
              <dd className="mt-1.5 text-[9px] text-zinc-600 font-semibold">支持多标签同时浏览</dd>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
              <dt className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">沉淀卡片笔记</dt>
              <dd className="mt-1 text-3xl font-bold text-white tracking-tight">{wsNotesCount}</dd>
              <dd className="mt-1.5 text-[9px] text-zinc-600 font-semibold">双击/一键极速抓取</dd>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
              <dt className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">已隔离会话</dt>
              <dd className="mt-1 text-3xl font-bold text-white tracking-tight">{wsThreadsCount}</dd>
              <dd className="mt-1.5 text-[9px] text-zinc-600 font-semibold">Prompt 角色深度融合</dd>
            </div>
          </div>

          {/* Empty guide panel */}
          {openDocumentIds.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/10 p-12 text-center">
              <MousePointerSquareDashed className="h-8 w-8 text-zinc-700" />
              <h4 className="mt-3 text-xs font-semibold text-white">开启自研分屏工作流</h4>
              <p className="mt-1.5 w-80 text-[10px] leading-5 text-zinc-500">
                请在左侧边栏上传或打开 PDF 文档。开启后中栏支持多标签管理，并能在 PDF 画布中任意“划词提问”或“生成笔记”汪！
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active tabbed document pages content
  const pageContent = getMockPdfContent(activeDoc.name, activePdfPage);
  const percentage = Math.round(zoom);

  return (
    <div className="flex h-full flex-1 flex-col bg-zinc-900 text-zinc-300">
      
      {/* 1. Chrome-style Tabs Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-2 shrink-0">
        <div className="flex items-center overflow-x-auto min-w-0 flex-1 scrollbar-none">
          {openDocumentIds.map((docId) => {
            const doc = wsDocs.find((d) => d.id === docId);
            if (!doc) return null;
            const isActive = activeDocumentId === docId;

            return (
              <div
                key={docId}
                onClick={() => openDocument(docId)}
                className={`group flex items-center gap-1.5 border-r border-zinc-900 px-4 py-2.5 text-xs cursor-pointer transition select-none ${
                  isActive
                    ? "bg-zinc-900 text-white font-bold"
                    : "text-zinc-500 hover:bg-zinc-900/30 hover:text-zinc-300"
                }`}
              >
                <FileText className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span className="truncate max-w-[120px]">{doc.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeDocument(docId);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded-md hover:bg-zinc-850 hover:text-white transition shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Sidebar expansion status indicators */}
        <div className="flex items-center gap-1.5 px-3 shrink-0">
          {!leftSidebarOpen && (
            <button
              onClick={() => setLeftSidebarOpen(true)}
              className="p-1 text-zinc-500 hover:text-white rounded transition"
              title="展开左导航"
            >
              <Layout className="h-3.5 w-3.5" />
            </button>
          )}
          {!rightPanelOpen && (
            <button
              onClick={() => setRightPanelOpen(true)}
              className="p-1 text-zinc-500 hover:text-white rounded transition"
              title="展开右对话"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Viewer control toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/30 px-5 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 text-[9px] font-bold text-indigo-400">
            Active Doc
          </span>
          <span className="text-xs truncate font-semibold text-zinc-300">{activeDoc.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 border-r border-zinc-800 pr-3">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              className="p-1 text-zinc-500 hover:text-white transition rounded"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-bold text-zinc-400 w-10 text-center">{percentage}%</span>
            <button
              onClick={() => setZoom(Math.min(180, zoom + 10))}
              className="p-1 text-zinc-500 hover:text-white transition rounded"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevPage}
              disabled={activePdfPage <= 1}
              className="p-1 text-zinc-500 hover:text-white disabled:opacity-20 disabled:hover:text-zinc-500 transition rounded"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[10px] font-bold text-zinc-400">
              {activePdfPage} / {activeDoc.pagesCount} 页
            </span>
            <button
              onClick={handleNextPage}
              disabled={activePdfPage >= activeDoc.pagesCount}
              className="p-1 text-zinc-500 hover:text-white disabled:opacity-20 disabled:hover:text-zinc-500 transition rounded"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Simulated PDF paper viewport */}
      <div className="flex-1 overflow-auto p-8 flex justify-center items-start">
        <div className="relative origin-top" style={{ transform: `scale(${zoom / 100})` }}>
          
          <div 
            ref={paperRef}
            onMouseUp={handleTextSelection}
            className="w-[720px] rounded-2xl border border-zinc-800 bg-zinc-950 p-12 shadow-2xl select-text relative"
          >
            {/* Header pagination */}
            <div className="flex justify-between border-b border-zinc-900 pb-3.5 text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
              <span>{activeDoc.name}</span>
              <span>Page {activePdfPage} of {activeDoc.pagesCount}</span>
            </div>

            {/* Content text */}
            <div className="mt-8 space-y-4">
              <h2 className="text-lg font-bold text-white tracking-tight">{pageContent.title}</h2>
              <p className="text-xs leading-6 text-zinc-400 text-justify">
                {pageContent.content}
              </p>

              {/* RAG highlight */}
              {pageContent.highlight && (
                <div className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-4 animate-in fade-in duration-300">
                  <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider block">向量库命中片段 (pgvector Chunk)</span>
                  <p className="mt-1 text-xs leading-6 font-semibold text-zinc-300 italic">
                    "{pageContent.highlight}"
                  </p>
                </div>
              )}

              {/* Bottom margins notes */}
              <div className="mt-8 border-t border-zinc-900 pt-5">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider block">系统知识旁注</span>
                <p className="mt-1 text-xs leading-6 text-zinc-500 font-semibold">
                  {pageContent.notes}
                </p>
              </div>
            </div>

            <div className="mt-12 text-center text-[9px] text-zinc-600 font-bold tracking-wider">
              CONFIDENTIAL • DEVELOPMENT MOCK VIEW
            </div>
          </div>

          {/* 4. Selection Popover action popover menu */}
          {showSelectionPopup && selectionText && (
            <div
              className="absolute z-30 flex items-center gap-1.5 rounded-xl border border-zinc-850 bg-zinc-950 px-2 py-1.5 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150"
              style={{ left: `${popupPos.x}px`, top: `${popupPos.y}px` }}
              onMouseDown={(e) => e.preventDefault()} // prevents input unfocus
            >
              <button
                onClick={handleAskAIAboutSelection}
                className="flex items-center gap-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 px-2.5 py-1 text-[10px] font-bold text-white transition active:scale-95"
              >
                <MessageSquareHeart className="h-3 w-3 text-cyan-400 shrink-0" />
                问 AI
              </button>
              <button
                onClick={handleCaptureNoteFromSelection}
                className="flex items-center gap-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 px-2.5 py-1 text-[10px] font-bold text-white transition active:scale-95"
              >
                <BookmarkPlus className="h-3 w-3 text-indigo-400 shrink-0" />
                记笔记
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
