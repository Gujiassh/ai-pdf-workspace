"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { useTranslation } from "@/lib/i18n-context";
import {
  Plus, Trash2, FileText, MessageSquare, BookOpen,
  AlertCircle, Search, Calendar
} from "lucide-react";

import { CreateWorkspaceDialog } from "./create-workspace-dialog";

export function WorkspaceList() {
  const {
    workspaces,
    notes,
    threads,
    createWorkspace,
    deleteWorkspace,
  } = useWorkspace();

  const { locale, t } = useTranslation();
  const router = useRouter();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const safeLower = (value: string | null | undefined) => value?.toLowerCase() ?? "";

  const normalizedSearchQuery = safeLower(searchQuery);

  const filteredWorkspaces = workspaces.filter(
    (ws) =>
      safeLower(ws.name).includes(normalizedSearchQuery) ||
      safeLower(ws.description).includes(normalizedSearchQuery),
  );

  return (
    <>
      <div className="space-y-6 text-zinc-800 dark:text-zinc-300">
        <div className="flex flex-col gap-4 justify-between items-stretch border-b border-zinc-100 pb-4 dark:border-zinc-800 sm:flex-row sm:items-center">
          <div className="relative flex max-w-md flex-1 items-center">
            <Search className="absolute left-3 h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              placeholder={t("dashboard.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-2.5 pl-10 pr-4 text-xs text-zinc-800 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-700"
            />
          </div>

          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-zinc-800 active:scale-95 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
          >
            <Plus className="h-4 w-4" />
            {t("dashboard.createBtn")}
          </button>
        </div>

        <div className="w-full overflow-hidden">
          <div className="hidden items-center border-b border-zinc-100 px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:border-zinc-900 dark:text-zinc-500 md:flex">
            <div className="w-1/4">{t("dashboard.tableWsName")}</div>
            <div className="w-2/5">{t("dashboard.tableDesc")}</div>
            <div className="w-1/5">{t("dashboard.tableMetrics")}</div>
            <div className="w-1/8 pr-6 text-right">{t("dashboard.tableUpdated")}</div>
            <div className="w-[60px] text-center">{t("dashboard.tableActions")}</div>
          </div>

          {filteredWorkspaces.length === 0 ? (
            <div className="py-12 text-center text-zinc-400">
              <AlertCircle className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-700" />
              <p className="mt-3 text-xs font-semibold">{t("dashboard.empty")}</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 border-b border-zinc-100 dark:divide-zinc-900 dark:border-zinc-900">
              {filteredWorkspaces.map((ws) => {
                const docCount = ws.documentCount;
                const noteCount = notes.filter((n) => n.workspaceId === ws.id).length;
                const threadCount = threads.filter((th) => th.workspaceId === ws.id).length;
                const dateObj = new Date(ws.updatedAt);
                const formattedDate = locale === "zh"
                  ? `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`
                  : `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

                return (
                  <div
                    key={ws.id}
                    onClick={() => router.push(`/workspaces/${ws.id}`)}
                    className="group relative flex cursor-pointer flex-col px-4 py-4 transition-colors duration-150 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/35 md:flex-row md:items-center"
                  >
                    <div className="flex w-full items-center gap-3 pr-4 md:w-1/4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 text-xs font-extrabold text-zinc-950 transition group-hover:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:group-hover:border-indigo-400">
                        {ws.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-xs font-bold tracking-tight text-zinc-900 transition group-hover:text-indigo-650 dark:text-white dark:group-hover:text-indigo-400">
                          {ws.name}
                        </h2>
                        <span className="mt-0.5 inline-block text-[9px] font-bold text-zinc-400 dark:text-zinc-500">
                          {t("dashboard.role")}: {ws.role}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 w-full line-clamp-1 pr-4 text-xs text-zinc-500 dark:text-zinc-400 md:mt-0 md:w-2/5">
                      {ws.description ?? t("dashboard.noDesc")}
                    </div>

                    <div className="mt-2 flex w-full items-center gap-3.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 md:mt-0 md:w-1/5">
                      <span className="flex items-center gap-0.5" title={`${docCount} documents`}>
                        <FileText className="h-3 w-3 shrink-0 text-zinc-300 dark:text-zinc-700" />
                        {docCount}
                      </span>
                      <span className="flex items-center gap-0.5" title={`${noteCount} notes`}>
                        <BookOpen className="h-3 w-3 shrink-0 text-zinc-300 dark:text-zinc-700" />
                        {noteCount}
                      </span>
                      <span className="flex items-center gap-0.5" title={`${threadCount} chat histories`}>
                        <MessageSquare className="h-3 w-3 shrink-0 text-zinc-300 dark:text-zinc-700" />
                        {threadCount}
                      </span>
                    </div>

                    <div className="mt-2 flex w-full items-center gap-1 pr-6 text-left text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 md:mt-0 md:w-1/8 md:justify-end md:text-right">
                      <Calendar className="h-3 w-3 shrink-0 md:hidden" />
                      <span>{formattedDate}</span>
                    </div>

                    <div className="absolute right-4 top-1/2 flex w-[60px] -translate-y-1/2 items-center justify-center shrink-0 md:static md:translate-y-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(t("dashboard.confirmDelete"))) {
                            void deleteWorkspace(ws.id).catch((error) => {
                              alert(error instanceof Error ? error.message : "Failed to delete workspace.");
                            });
                          }
                        }}
                        className="cursor-pointer rounded-xl p-1.5 text-zinc-400 opacity-0 transition duration-150 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/20"
                        title={t("dashboard.deleteTooltip")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreateWorkspaceDialog
        show={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={async (name, desc) => {
          await createWorkspace(name, desc);
        }}
        t={t}
      />
    </>
  );
}
