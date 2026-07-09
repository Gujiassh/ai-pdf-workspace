"use client";

import React, { useState } from "react";

import type { TranslationKey } from "@/lib/i18n-context";

interface CreateWorkspaceDialogProps {
  show: boolean;
  onClose: () => void;
  onCreate: (name: string, desc: string | null) => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function CreateWorkspaceDialog({
  show,
  onClose,
  onCreate,
  t,
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!show) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onCreate(name.trim(), desc.trim() || null);
      setName("");
      setDesc("");
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create workspace.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl text-zinc-300">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">{t("dashboard.createBtn")}</h3>
        <p className="mt-1 text-[10px] text-zinc-500">隔离专有的 PDF 文档、模型 Prompt 和对话记忆上下文。</p>
        
        <form onSubmit={(event) => {
          void handleSubmit(event);
        }} className="mt-4 space-y-3.5">
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500">工作区名称</label>
            <input
              type="text"
              required
              placeholder="例如: 财务报表风控、大模型开发文档..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs outline-none text-white focus:border-zinc-700 transition"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500">用途描述</label>
            <textarea
              placeholder="该工作区主要收纳的文件类型说明..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs outline-none text-white focus:border-zinc-700 resize-none transition"
            />
          </div>
          {errorMessage ? (
            <p className="text-xs font-medium text-rose-400">{errorMessage}</p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                onClose();
              }}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-500 hover:bg-zinc-800 transition active:scale-95 cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "提交中..." : "创建并进入"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
