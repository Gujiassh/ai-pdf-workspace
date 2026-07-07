"use client";

import Link from "next/link";
import { useState } from "react";
import { useWorkspace } from "@/lib/mock-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  Plus, Trash2, FileText, MessageSquare, BookOpen, AlertCircle
} from "lucide-react";

export function WorkspaceList() {
  const {
    workspaces,
    documents,
    notes,
    threads,
    createWorkspace,
    deleteWorkspace,
  } = useWorkspace();

  const { t } = useTranslation();

  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createWorkspace(name.trim(), description.trim() || null);
    setName("");
    setDescription("");
    setShowAddForm(false);
  };

  if (workspaces.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/10 p-8 text-center transition">
        <AlertCircle className="mx-auto h-8 w-8 text-zinc-400" />
        <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">{t("dashboard.empty")}</h3>
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-4 rounded-xl bg-zinc-950 dark:bg-white px-4 py-2.5 text-xs font-bold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition"
        >
          {t("dashboard.createBtn")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Header bar */}
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {t("dashboard.title")} ({workspaces.length})
        </span>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-white px-4 py-2.5 text-xs font-bold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition active:scale-95 shrink-0"
        >
          <Plus className="h-4 w-4" />
          {t("dashboard.createBtn")}
        </button>
      </div>

      {/* Creation form inline */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 space-y-4 shadow-lg animate-in slide-in-from-top-2 duration-200">
          <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">{t("dashboard.createBtn")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">工作区名称</label>
              <input
                type="text"
                required
                placeholder="例如: 智能投研、学术论文库..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 px-3 py-2.5 text-xs outline-none text-zinc-800 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-700"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">备注描述</label>
              <input
                type="text"
                placeholder="该工作区的用途与文件类别说明..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 px-3 py-2.5 text-xs outline-none text-zinc-800 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-700"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-850 transition"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-xl bg-zinc-950 dark:bg-white px-4 py-2.5 text-xs font-bold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition"
            >
              确定创建
            </button>
          </div>
        </form>
      )}

      {/* Grid of Workspaces */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((ws) => {
          const docCount = documents.filter((d) => d.workspaceId === ws.id).length;
          const noteCount = notes.filter((n) => n.workspaceId === ws.id).length;
          const threadCount = threads.filter((t) => t.workspaceId === ws.id).length;

          return (
            <div
              key={ws.id}
              className="group relative flex flex-col justify-between rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 shadow-sm hover:shadow-md hover:border-zinc-400 dark:hover:border-zinc-700 transition duration-200"
            >
              <Link href={`/workspaces/${ws.id}`} className="flex-1 block">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 dark:bg-white font-extrabold text-white dark:text-zinc-950 text-base shadow-sm">
                    {ws.name.slice(0, 1)}
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-zinc-900 dark:text-white tracking-tight group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition">
                      {ws.name}
                    </h2>
                    <span className="mt-0.5 inline-block rounded-md bg-zinc-50 dark:bg-zinc-950 px-2 py-0.5 text-[9px] font-bold text-zinc-400 dark:text-zinc-500">
                      {t("dashboard.role")}: {ws.role}
                    </span>
                  </div>
                </div>

                <p className="mt-3.5 text-xs leading-5 text-zinc-550 dark:text-zinc-400 min-h-[40px] line-clamp-2">
                  {ws.description ?? "暂无备注描述"}
                </p>

                <dl className="mt-5 grid grid-cols-3 gap-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold border-t border-zinc-100 dark:border-zinc-800/80 pt-4">
                  <div>
                    <dt className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold">
                      <FileText className="h-3 w-3 text-zinc-300 dark:text-zinc-600 shrink-0" />
                      {t("dashboard.docs")}
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-800 dark:text-zinc-200">{docCount}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold">
                      <BookOpen className="h-3 w-3 text-zinc-300 dark:text-zinc-600 shrink-0" />
                      {t("dashboard.notes")}
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-800 dark:text-zinc-200">{noteCount}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold">
                      <MessageSquare className="h-3 w-3 text-zinc-300 dark:text-zinc-600 shrink-0" />
                      {t("dashboard.threads")}
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-800 dark:text-zinc-200">{threadCount}</dd>
                  </div>
                </dl>
              </Link>

              {/* Workspace deletion action */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(t("dashboard.confirmDelete"))) {
                    deleteWorkspace(ws.id);
                  }
                }}
                className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition duration-200"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
