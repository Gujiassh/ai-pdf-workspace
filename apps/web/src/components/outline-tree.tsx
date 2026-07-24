"use client";

import React from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import { useTranslation } from "@/lib/i18n-context";

export type OutlineNode = {
  title: string;
  page: number | null;
  children?: OutlineNode[];
};

interface OutlineTreeProps {
  activeAssetId: string;
  activePdfPage: number;
  setActivePdfPage: (page: number) => void;
  outline: OutlineNode[];
}

export function OutlineTree({
  activeAssetId,
  activePdfPage,
  setActivePdfPage,
  outline,
}: OutlineTreeProps) {
  const { t } = useTranslation();
  const [collapsedNodes, setCollapsedNodes] = React.useState<Record<string, boolean>>({});

  const getNodeKey = (node: OutlineNode) => {
    return `${activeAssetId}-${node.page ?? "unknown"}-${node.title}`;
  };

  const toggleNode = (nodeKey: string) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [nodeKey]: !prev[nodeKey],
    }));
  };

  const renderOutlineNode = (node: OutlineNode, depth = 0) => {
    const hasChildren = Boolean(node.children?.length);
    const nodeKey = getNodeKey(node);
    const isCollapsed = collapsedNodes[nodeKey];
    const isSelected = node.page === activePdfPage;

    return (
      <div key={nodeKey} className="space-y-1">
        <div
          onClick={() => {
            if (node.page !== null) {
              setActivePdfPage(node.page);
            }
          }}
          className={`group flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition select-none ${
            node.page === null ? "text-zinc-400 dark:text-zinc-600" : "cursor-pointer"
          } ${
            isSelected
              ? "bg-indigo-500/10 font-bold text-indigo-650 dark:text-indigo-400"
              : "text-zinc-600 hover:bg-zinc-150/50 dark:text-zinc-400 dark:hover:bg-zinc-900"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleNode(nodeKey);
              }}
              className="rounded-md p-0.5 transition hover:bg-zinc-200 dark:hover:bg-zinc-800"
              aria-label={isCollapsed ? "展开目录" : "收起目录"}
            >
              <ChevronDown className={`h-3 w-3 text-zinc-400 transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <span className="h-1 w-1 rounded-full bg-zinc-400 dark:bg-zinc-600" />
            </span>
          )}
          <span className="flex-1 truncate">{node.title}</span>
          {node.page !== null ? (
            <span className="shrink-0 font-mono text-[9px] text-zinc-400 opacity-60 group-hover:opacity-100">p.{node.page}</span>
          ) : null}
        </div>

        {hasChildren && !isCollapsed ? (
          <div className="space-y-0.5">
            {node.children?.map((child) => renderOutlineNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex-1 p-4">
      <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        <BookOpen className="h-3.5 w-3.5" />
        {t("outline.title")}
      </span>

      <div className="mt-3 space-y-1">
        {outline.length > 0 ? (
          outline.map((node) => renderOutlineNode(node))
        ) : (
          <div className="px-2 py-4 text-[10px] italic text-zinc-400 dark:text-zinc-600">
            {t("outline.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
