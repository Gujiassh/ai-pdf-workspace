"use client";

import Link from "next/link";
import { useState } from "react";
import { useWorkspace } from "@/lib/mock-context";
import { 
  Plus, Trash2, FolderOpen, Calendar, FileText, 
  MessageSquare, BookOpen, AlertCircle
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
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-zinc-400" />
        <h3 className="mt-3 text-sm font-semibold text-zinc-900">暂无工作区</h3>
        <p className="mt-1 text-xs text-zinc-500">点击下方按钮创建第一个 RAG 知识库工作区。</p>
        <button
          onClick={() => setShowAddForm(true)}
          className="mt-4 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          创建工作区
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Header bar */}
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">所有工作区 ({workspaces.length})</span>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 active:scale-95 shrink-0"
        >
          <Plus className="h-4 w-4" />
          创建新工作区
        </button>
      </div>

      {/* Creation form inline */}
      {showAddForm && (
        <form onSubmit={handleCreate} className="rounded-3xl border border-zinc-200 bg-white p-6 space-y-4 shadow-md animate-in slide-in-from-top-2 duration-200">
          <h3 className="text-sm font-bold text-zinc-900">新建知识库工作区</h3>
          <div className="grid gap-3.5 md:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-zinc-600">工作区名称</label>
              <input
                type="text"
                required
                placeholder="例如: 智能投研、学术论文库"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600">备注描述</label>
              <input
                type="text"
                placeholder="该工作区的用途与文件类别说明..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs outline-none focus:border-zinc-400"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-50 transition"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 transition"
            >
              确定创建
            </button>
          </div>
        </form>
      )}

      {/* Grid of Workspaces */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((ws) => {
          // Count documents, notes, and threads for this workspace
          const docCount = documents.filter((d) => d.workspaceId === ws.id).length;
          const noteCount = notes.filter((n) => n.workspaceId === ws.id).length;
          const threadCount = threads.filter((t) => t.workspaceId === ws.id).length;

          return (
            <div
              key={ws.id}
              className="group relative flex flex-col justify-between rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-zinc-300 transition duration-200"
            >
              <Link href={`/workspaces/${ws.id}`} className="flex-1 block">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 font-bold text-white text-base">
                    {ws.name.slice(0, 1)}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-zinc-950 tracking-tight group-hover:text-indigo-600 transition">
                      {ws.name}
                    </h2>
                    <span className="mt-0.5 inline-block rounded-md bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
                      {ws.role}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-zinc-500 min-h-[40px] line-clamp-2">
                  {ws.description ?? "暂无备注描述"}
                </p>

                <dl className="mt-5 grid grid-cols-3 gap-2 text-xs text-zinc-400 font-semibold border-t border-zinc-100 pt-4">
                  <div>
                    <dt className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-zinc-300 shrink-0" />
                      文档
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-800">{docCount}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5 text-zinc-300 shrink-0" />
                      笔记
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-800">{noteCount}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5 text-zinc-300 shrink-0" />
                      会话
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-zinc-800">{threadCount}</dd>
                  </div>
                </dl>
              </Link>

              {/* Workspace deletion action */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定要删除工作区“${ws.name}”吗？这将清除所有关联文档和笔记。`)) {
                    deleteWorkspace(ws.id);
                  }
                }}
                className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition duration-200"
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
