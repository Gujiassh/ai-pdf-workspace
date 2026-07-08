"use client";

import React from "react";
import { ChevronDown, BookOpen } from "lucide-react";

export type OutlineNode = {
  title: string;
  page: number;
  children?: OutlineNode[];
};

export const DOCUMENT_OUTLINES: Record<string, OutlineNode[]> = {
  "doc-attention": [
    { title: "1. Introduction", page: 1 },
    { title: "2. Background", page: 2 },
    { 
      title: "3. Model Architecture", 
      page: 3,
      children: [
        { title: "3.1 Scaled Dot-Product Attention", page: 3 },
        { title: "3.2 Multi-Head Attention", page: 5 },
        { title: "3.3 Position-wise Feed-Forward", page: 6 }
      ]
    },
    { title: "4. Why Self-Attention", page: 8 },
    { title: "5. Training & Evaluation", page: 9 }
  ],
  "doc-rag": [
    { title: "1. Introduction", page: 1 },
    { 
      title: "2. RAG Formulation Method", 
      page: 2,
      children: [
        { title: "2.1 RAG-Sequence Model", page: 3 },
        { title: "2.2 RAG-Token Model", page: 4 }
      ]
    },
    { title: "3. Experiments & Setup", page: 5 },
    { title: "4. Results & Discussion", page: 7 }
  ],
  "doc-nda": [
    { title: "Clause 1. Proprietary Definitions", page: 1 },
    { title: "Clause 2. Non-Disclosure Scope", page: 2 },
    { title: "Clause 3. Survival and Obligations", page: 3 },
    { title: "Clause 4. Injunctive Judicial Remedies", page: 4 }
  ]
};

interface OutlineTreeProps {
  activeDocumentId: string;
  activePdfPage: number;
  setActivePdfPage: (page: number) => void;
}

export function OutlineTree({
  activeDocumentId,
  activePdfPage,
  setActivePdfPage,
}: OutlineTreeProps) {
  const [collapsedNodes, setCollapsedNodes] = React.useState<Record<string, boolean>>({});

  const activeOutline = DOCUMENT_OUTLINES[activeDocumentId] || null;

  const getNodeKey = (node: OutlineNode) => {
    return `${activeDocumentId}-${node.page}-${node.title}`;
  };

  const toggleNode = (nodeKey: string) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [nodeKey]: !prev[nodeKey]
    }));
  };

  const renderOutlineNode = (node: OutlineNode, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const nodeKey = getNodeKey(node);
    const isCollapsed = collapsedNodes[nodeKey];
    const isSelected = activePdfPage === node.page;

    return (
      <div key={node.title} className="space-y-1">
        <div 
          onClick={() => setActivePdfPage(node.page)}
          className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition select-none ${
            isSelected
              ? "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 font-bold"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-150/50 dark:hover:bg-zinc-900"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {hasChildren ? (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(nodeKey);
              }}
              className="p-0.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
            >
              <ChevronDown className={`h-3 w-3 text-zinc-400 transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              <span className="h-1 w-1 rounded-full bg-zinc-400 dark:bg-zinc-600" />
            </span>
          )}
          <span className="truncate flex-1">{node.title}</span>
          <span className="text-[9px] text-zinc-400 opacity-60 group-hover:opacity-100 shrink-0 font-mono">p.{node.page}</span>
        </div>

        {hasChildren && !isCollapsed && (
          <div className="space-y-0.5">
            {node.children?.map((child) => renderOutlineNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 flex-1">
      <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
        <BookOpen className="h-3.5 w-3.5" />
        文档大纲目录 (Outline)
      </span>
      
      <div className="mt-3 space-y-1">
        {activeOutline ? (
          activeOutline.map((node) => renderOutlineNode(node))
        ) : (
          <div className="text-[10px] text-zinc-400 dark:text-zinc-600 italic px-2 py-4">
            该文档无可用的大纲目录结构汪
          </div>
        )}
      </div>
    </div>
  );
}
