"use client";

import React, { useState, useRef, useEffect } from "react";
import { useWorkspace, Citation } from "@/lib/workspace-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  Send, MessageCircleQuestion, ChevronRight, X
} from "lucide-react";
import { ChatBubble } from "./chat-bubble";

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
    setQuickNoteTitle(t("chat.noteTitleTemplate").replace("{doc}", citation.documentName).replace("{page}", String(citation.pageNumber)));
    setQuickNoteContent(t("chat.noteContentTemplate").replace("{snippet}", citation.snippet));
  };

  const handleSaveQuickNote = async (citation: Citation) => {
    if (!quickNoteTitle.trim()) return;

    try {
      await createNote(quickNoteTitle, quickNoteContent, {
        messageCitationId: citation.id,
        documentId: citation.documentId,
        documentName: citation.documentName,
        pageNumber: citation.pageNumber,
        snippet: citation.snippet,
      });
      setShowNoteEditorId(null);
      setQuickNoteTitle("");
      setQuickNoteContent("");
      setActiveTab("notes");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save note.");
    }
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
          title={t("chat.hideSidebar")}
        >
          <ChevronRight className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!activeThread || activeThread.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-zinc-300 dark:text-zinc-700">
            <MessageCircleQuestion className="h-6 w-6 animate-pulse" />
            <span className="mt-2 text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">{t("chat.emptyTitle")}</span>
          </div>
        ) : (
          activeThread.messages.map((msg) => (
            <ChatBubble
              key={msg.id}
              msg={msg}
              onCitationClick={handleCitationClick}
              onQuickNoteOpen={openQuickNoteEditor}
              showNoteEditorId={showNoteEditorId}
              setShowNoteEditorId={setShowNoteEditorId}
              quickNoteTitle={quickNoteTitle}
              setQuickNoteTitle={setQuickNoteTitle}
              quickNoteContent={quickNoteContent}
              setQuickNoteContent={setQuickNoteContent}
              onSaveQuickNote={handleSaveQuickNote}
              t={t}
            />
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
              &quot;{selectionText}&quot;
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
