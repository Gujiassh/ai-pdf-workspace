"use client";

import { ArrowRightLeft, ChevronRight } from "lucide-react";

import { useTranslation } from "@/lib/i18n-context";

type PdfViewerEmptyStateProps = {
  workspaceName?: string;
  workspaceDescription?: string | null;
  documentsCount: number;
  notesCount: number;
  threadsCount: number;
  leftSidebarOpen: boolean;
  rightPanelOpen: boolean;
  onOpenLeftSidebar: () => void;
  onOpenRightPanel: () => void;
};

export function PdfViewerEmptyState({
  workspaceName,
  workspaceDescription,
  documentsCount,
  notesCount,
  threadsCount,
  leftSidebarOpen,
  rightPanelOpen,
  onOpenLeftSidebar,
  onOpenRightPanel,
}: PdfViewerEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-1 flex-col overflow-y-auto bg-zinc-100 p-8 text-zinc-600 transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-300">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-8 shadow-md transition dark:border-zinc-800 dark:bg-zinc-900/50 dark:shadow-2xl">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{t("viewer.noDocTitle")}</span>
          <h1 className="mt-2.5 text-2xl font-black tracking-tight text-zinc-900 dark:text-white">{workspaceName}</h1>
          <p className="mt-2 text-xs leading-6 text-zinc-500 dark:text-zinc-400">{workspaceDescription || "暂无描述"}</p>

          <div className="mt-5 flex gap-4">
            {!leftSidebarOpen ? (
              <button
                type="button"
                onClick={onOpenLeftSidebar}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
              >
                <ChevronRight className="h-4 w-4 shrink-0" />
                展开侧边栏
              </button>
            ) : null}
            {!rightPanelOpen ? (
              <button
                type="button"
                onClick={onOpenRightPanel}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
              >
                <ArrowRightLeft className="h-4 w-4 shrink-0" />
                展开问答板
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/45">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t("dashboard.docs")}</dt>
            <dd className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{documentsCount}</dd>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/45">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t("dashboard.notes")}</dt>
            <dd className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{notesCount}</dd>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900/45">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t("dashboard.threads")}</dt>
            <dd className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">{threadsCount}</dd>
          </div>
        </div>
      </div>
    </div>
  );
}
