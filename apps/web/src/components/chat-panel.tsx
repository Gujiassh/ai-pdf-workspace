"use client";

import React, { useState, useRef, useEffect } from "react";
import { useWorkspace, Message, Citation } from "@/lib/mock-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  Send, Sparkles, FileText, BookmarkPlus, Loader2, 
  MessageCircleQuestion, ChevronRight, X
} from "lucide-react";

export function ChatPanel() {
  const {
    currentWorkspace,
    activeThread,
    documents,
    selectionText,
    setSelectionText,
    setRightPanelOpen,
    sendMessage,
    createNote,
    setActiveDocumentId,
    setActivePdfPage,
    setActiveTab,
  } = useWorkspace();

  const { t } = useTranslation();

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNoteEditorId, setShowNoteEditorId] = useState<string | null>(null);
  
  const [quickNoteTitle, setQuickNoteTitle] = useState("");
  const [quickNoteContent, setQuickNoteContent] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const wsDocs = documents.filter((d) => d.workspaceId === currentWorkspace?.id);
  const docsReady = wsDocs.some((d) => d.status === "ready");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeThread?.messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const text = input.trim();
    setInput("");
    setLoading(true);
    
    await sendMessage(text);
    setLoading(false);
  };

  const handleCitationClick = (citation: Citation) => {
    setActiveDocumentId(citation.documentId);
    setActivePdfPage(citation.pageNumber);
  };

  const openQuickNoteEditor = (citation: Citation) => {
    setShowNoteEditorId(citation.id);
    setQuickNoteTitle(`引自《${citation.documentName}》第 ${citation.pageNumber} 页的笔记`);
    setQuickNoteContent(`引文原文：\n"${citation.snippet}"\n\n我的备忘结论：\n`);
  };

  const handleSaveQuickNote = (citation: Citation) => {
    if (!quickNoteTitle.trim()) return;
    
    createNote(quickNoteTitle, quickNoteContent, {
      documentId: citation.documentId,
      documentName: citation.documentName,
      pageNumber: citation.pageNumber,
      snippet: citation.snippet,
    });

    setShowNoteEditorId(null);
    setQuickNoteTitle("");
    setQuickNoteContent("");
    
    setActiveTab("notes");
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950 transition-colors duration-200">
      {/* Header with Collapse Option */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between transition">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
            {activeThread ? activeThread.title : t("chat.header")}
          </h3>
          <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold block mt-0.5">
            {t("chat.scope")}: {t("chat.scopeAll")}
          </span>
        </div>
        
        {/* Collapse Button */}
        <button
          onClick={() => setRightPanelOpen(false)}
          className="p-1 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 transition shrink-0 cursor-pointer"
          title="隐藏侧边板"
        >
          <ChevronRight className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!activeThread || activeThread.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 pt-16">
            <MessageCircleQuestion className="h-8 w-8 text-zinc-300 dark:text-zinc-700 animate-pulse" />
            <h4 className="mt-3 text-xs font-semibold text-zinc-700 dark:text-zinc-400">{t("chat.emptyTitle")}</h4>
            <p className="mt-1 w-60 text-[10px] leading-5 text-zinc-400 dark:text-zinc-500">
              {docsReady 
                ? t("chat.emptyDesc")
                : t("chat.inputPlaceholderNoDocs")}
            </p>
          </div>
        ) : (
          activeThread.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              {/* User message */}
              {msg.role === "user" ? (
                <div className="max-w-[85%] rounded-2xl bg-zinc-950 dark:bg-zinc-800 px-3.5 py-2.5 text-xs text-white dark:text-zinc-100 leading-relaxed shadow-sm transition">
                  {msg.content}
                </div>
              ) : (
                /* Assistant message */
                <div className="w-full max-w-[95%]">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span>AI 研究顾问</span>
                  </div>
                  
                  <div className="text-xs leading-6 text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                    {msg.content || (
                      <span className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-600 font-medium italic">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400 dark:text-zinc-600" />
                        正在检索向量数据库...
                      </span>
                    )}
                  </div>

                  {/* Citations list */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3.5 space-y-2 border-t border-dashed border-zinc-100 dark:border-zinc-900 pt-3 transition">
                      <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">{t("chat.sourceTitle")}</span>
                      
                      <div className="flex flex-wrap gap-1.5">
                        {msg.citations.map((cit) => (
                          <div key={cit.id} className="relative inline-flex items-center">
                            <button
                              onClick={() => handleCitationClick(cit)}
                              className="flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-2.5 py-0.5 text-[9px] font-bold text-zinc-600 dark:text-zinc-400 transition cursor-pointer"
                            >
                              <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                              <span>{cit.documentName.split(".pdf")[0]} p.{cit.pageNumber}</span>
                            </button>
                            
                            <button
                              onClick={() => openQuickNoteEditor(cit)}
                              title={t("chat.quickNote")}
                              className="ml-1 p-0.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-indigo-600 dark:hover:text-indigo-400 transition text-zinc-400 dark:text-zinc-600 shrink-0 cursor-pointer"
                            >
                              <BookmarkPlus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Save Note inline overlay */}
                  {msg.citations?.map((cit) => showNoteEditorId === cit.id && (
                    <div 
                      key={`editor-${cit.id}`}
                      className="mt-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-3 animate-in slide-in-from-top-1 duration-200 text-zinc-700 dark:text-zinc-300"
                    >
                      <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">{t("chat.noteEditorTitle")}</span>
                      <input
                        type="text"
                        value={quickNoteTitle}
                        onChange={(e) => setQuickNoteTitle(e.target.value)}
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-semibold outline-none text-zinc-800 dark:text-zinc-100 focus:border-zinc-400"
                      />
                      <textarea
                        value={quickNoteContent}
                        onChange={(e) => setQuickNoteContent(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-xs outline-none text-zinc-800 dark:text-zinc-100 focus:border-zinc-400 resize-none"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setShowNoteEditorId(null)}
                          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1 text-[10px] font-bold text-zinc-500 hover:bg-zinc-100 transition cursor-pointer"
                        >
                          {t("chat.cancel")}
                        </button>
                        <button
                          onClick={() => handleSaveQuickNote(cit)}
                          className="rounded-lg bg-indigo-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 transition cursor-pointer"
                        >
                          {t("chat.save")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating selected text context notice */}
      {selectionText && (
        <div className="mx-3 mt-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 p-2.5 flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-150">
          <div className="min-w-0 flex-1">
            <span className="text-[8px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider block">{t("chat.selectionContext")}</span>
            <p className="truncate text-[10px] text-zinc-600 dark:text-zinc-400 leading-snug font-semibold mt-0.5">
              "{selectionText}"
            </p>
          </div>
          <button
            onClick={() => setSelectionText(null)}
            className="p-1 rounded-md hover:bg-indigo-100 hover:text-indigo-900 transition shrink-0"
          >
            <X className="h-3 w-3 text-indigo-500" />
          </button>
        </div>
      )}

      {/* Input Chat form */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/20 dark:bg-zinc-950/40 shrink-0 transition">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!docsReady || loading || !activeThread}
            placeholder={
              !activeThread
                ? t("chat.inputPlaceholderEmpty")
                : selectionText
                ? t("chat.selectionContext")
                : t("chat.placeholder")
            }
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-4 pr-10 py-3 text-xs outline-none shadow-xs text-zinc-800 dark:text-zinc-100 focus:border-zinc-400 dark:focus:border-zinc-700 disabled:bg-zinc-50 dark:disabled:bg-zinc-950 disabled:text-zinc-400 dark:disabled:text-zinc-600 transition"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || !activeThread}
            className="absolute right-2 p-1.5 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 disabled:bg-zinc-100 dark:disabled:bg-zinc-900 disabled:text-zinc-300 dark:disabled:text-zinc-700 transition active:scale-95 shrink-0 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
