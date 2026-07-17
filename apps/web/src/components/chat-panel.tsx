"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Library, MessageCircleQuestion, X } from "lucide-react";

import { isNearChatBottom } from "@/lib/chat-scroll";
import { useTranslation } from "@/lib/i18n-context";
import { Citation, useWorkspace } from "@/lib/workspace-context";

import { ChatBubble } from "./chat-bubble";

export function ChatPanel() {
  const {
    currentWorkspace,
    activeThread,
    documents,
    selectionText,
    setSelectionText,
    sendMessage,
    createNote,
    openDocument,
    setActivePdfPage,
    setActiveTab,
  } = useWorkspace();

  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNoteEditorId, setShowNoteEditorId] = useState<string | null>(null);
  const [quickNoteTitle, setQuickNoteTitle] = useState("");
  const [quickNoteContent, setQuickNoteContent] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const shouldFollowMessagesRef = useRef(true);
  const activeThreadIdRef = useRef<string | null>(null);

  const workspaceDocuments = documents.filter((document) => document.workspaceId === currentWorkspace?.id);
  const readyDocumentCount = workspaceDocuments.filter((document) => document.status === "ready").length;
  const docsReady = readyDocumentCount > 0;

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (container) {
      shouldFollowMessagesRef.current = isNearChatBottom(container);
    }
  };

  useEffect(() => {
    const threadId = activeThread?.id ?? null;
    const switchedThread = activeThreadIdRef.current !== threadId;
    activeThreadIdRef.current = threadId;

    if (switchedThread) {
      shouldFollowMessagesRef.current = true;
    }
    if (!shouldFollowMessagesRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeThread?.id, activeThread?.messages]);

  useEffect(() => {
    if (selectionText) {
      composerRef.current?.focus();
    }
  }, [selectionText]);

  const submitMessage = async () => {
    const text = input.trim();
    if (!text || loading || !activeThread) {
      return;
    }

    setInput("");
    setLoading(true);
    try {
      await sendMessage(text);
    } finally {
      setLoading(false);
      composerRef.current?.focus();
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submitMessage();
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    if (loading) return;
    setLoading(true);
    try {
      await sendMessage(content, { editMessageId: messageId });
    } finally {
      setLoading(false);
    }
  };

  const handleCitationClick = (citation: Citation) => {
    if (!citation.documentId) {
      return;
    }
    openDocument(citation.documentId);
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
    <div className="flex h-full flex-col bg-card text-foreground">
      <div className="shrink-0 border-b border-border bg-card px-4 py-3 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-zinc-950 dark:text-white sm:text-base">
              {activeThread ? activeThread.title : t("chat.header")}
            </h2>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              <Library className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span>{readyDocumentCount} {t("workspace.readyDocuments")}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{t("chat.scopeAll")}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        data-chat-scroll
        onScroll={handleMessagesScroll}
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-6 sm:px-8 sm:py-8"
      >
        <div className="mx-auto w-full max-w-4xl space-y-8">
          {!activeThread || activeThread.messages.length === 0 ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center text-zinc-400 dark:text-zinc-600">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background">
                <MessageCircleQuestion className="h-5 w-5" />
              </span>
              <span className="mt-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t("chat.emptyTitle")}</span>
            </div>
          ) : (
            activeThread.messages.map((message) => (
              <ChatBubble
                key={message.id}
                msg={message}
                onCitationClick={handleCitationClick}
                onQuickNoteOpen={openQuickNoteEditor}
                showNoteEditorId={showNoteEditorId}
                setShowNoteEditorId={setShowNoteEditorId}
                quickNoteTitle={quickNoteTitle}
                setQuickNoteTitle={setQuickNoteTitle}
                quickNoteContent={quickNoteContent}
                setQuickNoteContent={setQuickNoteContent}
                onSaveQuickNote={handleSaveQuickNote}
                onEditMessage={handleEditMessage}
                t={t}
              />
            ))
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-3 py-3 sm:px-8 sm:py-4">
        <div className="mx-auto w-full max-w-4xl">
          {selectionText ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/70 dark:bg-amber-950/30">
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">
                  {t("chat.selectionContext")}
                </span>
                <p className="mt-0.5 truncate text-[11px] text-amber-950/70 dark:text-amber-100/70">
                  &quot;{selectionText}&quot;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectionText(null)}
                title={t("chat.clearSelection")}
                aria-label={t("chat.clearSelection")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-amber-700 transition hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/60"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="relative flex items-end gap-2 rounded-xl border border-border bg-background p-2 shadow-sm transition focus-within:border-zinc-400 focus-within:shadow-md dark:focus-within:border-zinc-600">
            <textarea
              ref={composerRef}
              rows={1}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitMessage();
                }
              }}
              disabled={!docsReady || loading || !activeThread}
              placeholder={
                !docsReady
                  ? t("chat.inputPlaceholderNoDocs")
                  : !activeThread
                    ? t("chat.inputPlaceholderEmpty")
                    : t("chat.placeholder")
              }
              aria-label={t("chat.placeholder")}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading || !activeThread || !docsReady}
              title={t("chat.send")}
              aria-label={t("chat.send")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white transition hover:bg-zinc-800 active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 dark:disabled:bg-zinc-900 dark:disabled:text-zinc-700"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
