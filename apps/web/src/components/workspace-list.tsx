"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace, Workspace } from "@/lib/mock-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  Plus, Trash2, FileText, MessageSquare, BookOpen, 
  AlertCircle, Search, Calendar, ChevronRight
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
  const router = useRouter();

  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createWorkspace(name.trim(), description.trim() || null);
    setName("");
    setDescription("");
    setShowAddForm(false);
  };

  const filteredWorkspaces = workspaces.filter(
    (ws) =>
      ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ws.description && ws.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 text-zinc-800 dark:text-zinc-300">
      
      {/* Search & Add Action Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center border-b border-zinc-100 dark:border-zinc-800 pb-4">
        {/* Flat Search Input */}
        <div className="relative flex-1 max-w-md flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
          <input
            type="text"
            placeholder="搜索工作区名称或备注描述..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950 py-2.5 pl-10 pr-4 text-xs outline-none focus:border-zinc-400 dark:focus:border-zinc-700 text-zinc-800 dark:text-zinc-100 transition"
          />
        </div>

        {/* Inline Create Trigger Button */}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-white px-4 py-2.5 text-xs font-bold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition active:scale-95 shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          {t("dashboard.createBtn")}
        </button>
      </div>

      {/* Flat Inline Creation Form Row (No card, no shadow, integrated inline) */}
      {showAddForm && (
        <form 
          onSubmit={handleCreate} 
          className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/10 p-5 space-y-4 animate-in slide-in-from-top-2 duration-200 text-zinc-800 dark:text-zinc-200"
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-indigo-500 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{t("dashboard.createBtn")}</h3>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider">工作区名称</label>
              <input
                type="text"
                required
                placeholder="例如: 大模型研究、保密协议风控..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3.5 py-2 text-xs outline-none text-zinc-800 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-700"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider">描述说明</label>
              <input
                type="text"
                placeholder="简述该工作区收纳的文件类型与RAG问答范围..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3.5 py-2 text-xs outline-none text-zinc-800 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-700"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-xl bg-zinc-950 dark:bg-white px-4 py-2 text-xs font-bold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition cursor-pointer"
            >
              创建并进入
            </button>
          </div>
        </form>
      )}

      {/* Flat Cloud Table (SaaS Row List - No cards, no shadows) */}
      <div className="w-full overflow-hidden">
        
        {/* Table Header Row (Hidden on small screens) */}
        <div className="hidden md:flex items-center px-4 py-2 text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-900">
          <div className="w-1/4">工作区名称 / 角色</div>
          <div className="w-2/5">备注描述</div>
          <div className="w-1/5">关联指标</div>
          <div className="w-1/8 text-right pr-6">更新时间</div>
          <div className="w-[60px] text-center">操作</div>
        </div>

        {/* Workspaces list rows */}
        {filteredWorkspaces.length === 0 ? (
          <div className="py-12 text-center text-zinc-400">
            <AlertCircle className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-700" />
            <p className="mt-3 text-xs font-semibold">{t("dashboard.empty")}</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-900 border-b border-zinc-100 dark:border-zinc-900">
            {filteredWorkspaces.map((ws) => {
              const docCount = documents.filter((d) => d.workspaceId === ws.id).length;
              const noteCount = notes.filter((n) => n.workspaceId === ws.id).length;
              const threadCount = threads.filter((t) => t.workspaceId === ws.id).length;
              const dateObj = new Date(ws.updatedAt);
              const formattedDate = `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;

              return (
                <div
                  key={ws.id}
                  onClick={() => router.push(`/workspaces/${ws.id}`)}
                  className="group flex flex-col md:flex-row md:items-center px-4 py-4 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/35 transition-colors duration-150 cursor-pointer relative"
                >
                  
                  {/* Column 1: Workspace Name & Symbol */}
                  <div className="w-full md:w-1/4 flex items-center gap-3 pr-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-extrabold text-xs border border-zinc-200 dark:border-zinc-700 group-hover:border-indigo-500 dark:group-hover:border-indigo-400 transition">
                      {ws.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xs font-bold text-zinc-900 dark:text-white tracking-tight truncate group-hover:text-indigo-650 dark:group-hover:text-indigo-400 transition">
                        {ws.name}
                      </h2>
                      <span className="mt-0.5 inline-block text-[9px] font-bold text-zinc-400 dark:text-zinc-500">
                        {t("dashboard.role")}: {ws.role}
                      </span>
                    </div>
                  </div>

                  {/* Column 2: Description */}
                  <div className="w-full md:w-2/5 text-xs text-zinc-500 dark:text-zinc-400 pr-4 mt-2 md:mt-0 line-clamp-1">
                    {ws.description ?? "暂无描述"}
                  </div>

                  {/* Column 3: Metrics summary */}
                  <div className="w-full md:w-1/5 flex items-center gap-3.5 text-[10px] text-zinc-400 dark:text-zinc-500 font-bold mt-2 md:mt-0">
                    <span className="flex items-center gap-0.5" title={`${docCount} documents`}>
                      <FileText className="h-3 w-3 text-zinc-300 dark:text-zinc-700 shrink-0" />
                      {docCount}
                    </span>
                    <span className="flex items-center gap-0.5" title={`${noteCount} notes`}>
                      <BookOpen className="h-3 w-3 text-zinc-300 dark:text-zinc-700 shrink-0" />
                      {noteCount}
                    </span>
                    <span className="flex items-center gap-0.5" title={`${threadCount} chat histories`}>
                      <MessageSquare className="h-3 w-3 text-zinc-300 dark:text-zinc-700 shrink-0" />
                      {threadCount}
                    </span>
                  </div>

                  {/* Column 4: Date Updated */}
                  <div className="w-full md:w-1/8 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 text-left md:text-right pr-6 mt-2 md:mt-0 flex items-center md:justify-end gap-1">
                    <Calendar className="h-3 w-3 md:hidden shrink-0" />
                    <span>{formattedDate}</span>
                  </div>

                  {/* Column 5: Actions (Trash can icon appears on hover) */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 md:static md:translate-y-0 w-[60px] flex items-center justify-center shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t("dashboard.confirmDelete"))) {
                          deleteWorkspace(ws.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition duration-150 cursor-pointer"
                      title="删除此工作区"
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
  );
}
