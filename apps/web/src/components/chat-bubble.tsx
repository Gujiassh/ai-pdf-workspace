"use client";

import React, { useState } from "react";
import type { TranslationKey } from "@/lib/i18n-context";
import { Message, Citation } from "@/lib/workspace-context";
import { Sparkles, Loader2, FileText, BookmarkPlus, X, Check, Pencil } from "lucide-react";
import { ChatMarkdown } from "./chat-markdown";

interface ChatBubbleProps {
  msg: Message;
  onCitationClick: (cit: Citation) => void;
  onQuickNoteOpen: (cit: Citation) => void;
  showNoteEditorId: string | null;
  setShowNoteEditorId: (id: string | null) => void;
  quickNoteTitle: string;
  setQuickNoteTitle: (title: string) => void;
  quickNoteContent: string;
  setQuickNoteContent: (content: string) => void;
  onSaveQuickNote: (cit: Citation) => void;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  t: (key: TranslationKey) => string;
}

export function ChatBubble({
  msg,
  onCitationClick,
  onQuickNoteOpen,
  showNoteEditorId,
  setShowNoteEditorId,
  quickNoteTitle,
  setQuickNoteTitle,
  quickNoteContent,
  setQuickNoteContent,
  onSaveQuickNote,
  onEditMessage,
  t,
}: ChatBubbleProps) {
  const isUser = msg.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);
  const [saving, setSaving] = useState(false);

  const submitEdit = async () => {
    const nextContent = draft.trim();
    if (!nextContent || saving) return;
    setSaving(true);
    try {
      await onEditMessage(msg.id, nextContent);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-chat-message={msg.role}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out`}
    >
      {isUser ? (
        /* User message bubble */
        <div className="group flex max-w-[92%] items-start gap-1.5">
          {editing ? (
            <div className="min-w-[240px] rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void submitEdit();
                  }
                }}
                rows={3}
                autoFocus
                disabled={saving}
                className="w-full resize-none bg-transparent px-2 py-1 text-xs leading-relaxed text-zinc-900 outline-none dark:text-zinc-100"
              />
              <div className="flex justify-end gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setDraft(msg.content); setEditing(false); }}
                  disabled={saving}
                  className="rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {t("chat.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void submitEdit()}
                  disabled={!draft.trim() || saving}
                  className="flex items-center gap-1 rounded-md bg-zinc-950 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                >
                  <Check className="h-3 w-3" />
                  {saving ? t("chat.retrieving") : t("chat.save")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="max-w-[85%] rounded-2xl bg-zinc-950 px-3.5 py-2.5 text-xs leading-relaxed text-white shadow-sm transition duration-200 hover:scale-[1.005] active:scale-[0.99] dark:bg-zinc-800 dark:text-zinc-100">
                {msg.content}
              </div>
              <button
                type="button"
                onClick={() => { setDraft(msg.content); setEditing(true); }}
                title="编辑问题"
                aria-label="编辑问题"
                className="mt-1 rounded-md p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-900 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ) : (
        /* Assistant message bubble */
        <div className="w-full max-w-[95%]">
          <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1 select-none">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span>{t("chat.aiConsultant")}</span>
          </div>
          
          {msg.content ? (
            <ChatMarkdown
              content={msg.content}
              citations={msg.citations ?? []}
              onCitationClick={onCitationClick}
            />
          ) : (
            <div className="text-xs leading-6 text-zinc-700 dark:text-zinc-300">
              <span className="flex items-center gap-1.5 font-medium italic text-zinc-400 dark:text-zinc-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400 dark:text-zinc-500" />
                {t("chat.retrieving")}
              </span>
            </div>
          )}

          {/* Citations list */}
          {msg.citations && msg.citations.length > 0 && (
            <div className="mt-3.5 space-y-2 border-t border-dashed border-zinc-100 dark:border-zinc-900 pt-3 transition">
              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block select-none">{t("chat.sourceTitle")}</span>
              
              <div className="flex flex-wrap gap-1.5">
                {msg.citations.map((cit) => (
                  <div key={cit.id} className="relative inline-flex items-center">
                    <button
                      onClick={() => onCitationClick(cit)}
                      className="flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2.5 py-0.5 text-[9px] font-bold text-zinc-600 dark:text-zinc-400 transition hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                      <span>{cit.documentName.split(".pdf")[0]} p.{cit.pageNumber}</span>
                    </button>
                    
                    <button
                      onClick={() => onQuickNoteOpen(cit)}
                      title={t("chat.quickNote")}
                      className="ml-1 p-0.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-indigo-600 dark:hover:text-indigo-400 transition text-zinc-400 dark:text-zinc-600 shrink-0 cursor-pointer hover:scale-110"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Save Note inline overlay editor */}
          {msg.citations?.map((cit) => showNoteEditorId === cit.id && (
            <div 
              key={`editor-${cit.id}`}
              className="mt-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-3 animate-in slide-in-from-top-2 duration-300 text-zinc-700 dark:text-zinc-300 shadow-lg"
            >
              <div className="flex justify-between items-center pb-1 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">{t("chat.popoverTitle")}</span>
                <button
                  onClick={() => setShowNoteEditorId(null)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition rounded-full p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              
              <div className="space-y-2">
                <div>
                  <label className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">{t("chat.popoverTitleLabel")}</label>
                  <input
                    type="text"
                    value={quickNoteTitle}
                    onChange={(e) => setQuickNoteTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-hidden focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">{t("chat.popoverContentLabel")}</label>
                  <textarea
                    rows={4}
                    value={quickNoteContent}
                    onChange={(e) => setQuickNoteContent(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-hidden focus:border-indigo-500 transition resize-none font-sans"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowNoteEditorId(null)}
                  className="rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 py-1.5 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 transition active:scale-95 cursor-pointer"
                >
                  {t("chat.cancel")}
                </button>
                <button
                  onClick={() => onSaveQuickNote(cit)}
                  className="flex items-center gap-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 px-2.5 py-1.5 text-[10px] font-bold text-white transition active:scale-95 cursor-pointer"
                >
                  <Check className="h-3 w-3 shrink-0" />
                  {t("chat.saveToNote")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
