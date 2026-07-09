"use client";

import React from "react";
import type { TranslationKey } from "@/lib/i18n-context";
import { Message, Citation } from "@/lib/workspace-context";
import { Sparkles, Loader2, FileText, BookmarkPlus, X, Check } from "lucide-react";

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
  t,
}: ChatBubbleProps) {
  const isUser = msg.role === "user";

  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out`}
    >
      {isUser ? (
        /* User message bubble */
        <div className="max-w-[85%] rounded-2xl bg-zinc-950 dark:bg-zinc-800 px-3.5 py-2.5 text-xs text-white dark:text-zinc-100 leading-relaxed shadow-sm hover:scale-[1.005] active:scale-[0.99] transition duration-200">
          {msg.content}
        </div>
      ) : (
        /* Assistant message bubble */
        <div className="w-full max-w-[95%]">
          <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1 select-none">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span>{t("chat.aiConsultant")}</span>
          </div>
          
          <div className="text-xs leading-6 text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
            {msg.content || (
              <span className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-600 font-medium italic">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400 dark:text-zinc-650" />
                {t("chat.retrieving")}
              </span>
            )}
          </div>

          {/* Citations list */}
          {msg.citations && msg.citations.length > 0 && (
            <div className="mt-3.5 space-y-2 border-t border-dashed border-zinc-100 dark:border-zinc-900 pt-3 transition">
              <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block select-none">{t("chat.sourceTitle")}</span>
              
              <div className="flex flex-wrap gap-1.5">
                {msg.citations.map((cit) => (
                  <div key={cit.id} className="relative inline-flex items-center">
                    <button
                      onClick={() => onCitationClick(cit)}
                      className="flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-850 px-2.5 py-0.5 text-[9px] font-bold text-zinc-600 dark:text-zinc-450 transition hover:scale-105 active:scale-95 cursor-pointer"
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
              <div className="flex justify-between items-center pb-1 border-b border-zinc-200 dark:border-zinc-850">
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
                  className="flex items-center gap-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-550 px-2.5 py-1.5 text-[10px] font-bold text-white transition active:scale-95 cursor-pointer"
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
