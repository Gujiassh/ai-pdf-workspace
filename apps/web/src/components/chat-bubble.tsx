"use client";

import React, { useState } from "react";
import type { TranslationKey } from "@/lib/i18n-context";
import { getLocatorSummary } from "@/lib/evidence/types";
import { Message, Citation } from "@/lib/workspace-context";
import type { InputEvidence } from "@/lib/chat/types";
import { CircleAlert, Sparkles, Loader2, FileText, BookmarkPlus, X, Check, Pencil, ScanSearch } from "lucide-react";
import { ChatMarkdown } from "./chat-markdown";

interface ChatBubbleProps {
  msg: Message;
  onCitationClick: (cit: Citation) => void;
  onInputEvidenceClick: (evidence: InputEvidence) => void;
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
  onInputEvidenceClick,
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
  const isFailed = !isUser && msg.status === "failed";
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
        <div className="group flex max-w-[88%] items-start gap-2 sm:max-w-[78%]">
          {editing ? (
            <div className="min-w-[min(72vw,320px)] rounded-xl border border-zinc-300 bg-white p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
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
                className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-zinc-900 outline-none dark:text-zinc-100"
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
              <div className="max-w-full overflow-hidden rounded-xl bg-zinc-950 text-white shadow-sm dark:bg-zinc-800 dark:text-zinc-100">
                <p className="px-4 py-3 text-sm leading-6">{msg.content}</p>
                {msg.inputEvidence && msg.inputEvidence.length > 0 ? (
                  <div className="border-t border-white/15 px-2 py-2">
                    {msg.inputEvidence.map((evidence) => (
                      <button
                        key={evidence.id}
                        type="button"
                        data-message-input-evidence={evidence.id}
                        disabled={!evidence.sourceAvailable}
                        onClick={() => onInputEvidenceClick(evidence)}
                        className="flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-[10px] font-medium text-zinc-200 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ScanSearch className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                        <span className="min-w-0 truncate">
                          {evidence.assetTitle} · {getLocatorSummary(evidence.locator)}
                          {!evidence.sourceAvailable ? ` · ${t("viewer.sourceUnavailable")}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : msg.pendingInputEvidenceCount && msg.pendingInputEvidenceCount > 0 ? (
                  <div
                    data-message-input-evidence-pending={msg.pendingInputEvidenceCount}
                    className="flex min-h-8 items-center gap-1.5 border-t border-white/15 px-4 py-2 text-[10px] font-medium text-zinc-200"
                  >
                    <ScanSearch className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                    <span>
                      {t("chat.inputEvidenceLocked").replace(
                        "{count}",
                        String(msg.pendingInputEvidenceCount),
                      )}
                    </span>
                  </div>
                ) : null}
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
        <div className="w-full" data-chat-status={isFailed ? "failed" : msg.status ?? "completed"}>
          <div className={`mb-2 flex select-none items-center gap-1.5 text-[10px] font-bold uppercase ${isFailed ? "text-red-700 dark:text-red-300" : "text-zinc-400 dark:text-zinc-500"}`}>
            {isFailed ? (
              <CircleAlert className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}
            <span>{isFailed ? t("chat.responseFailed") : t("chat.aiConsultant")}</span>
          </div>
          
          {isFailed ? (
            <div role="alert" className="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm leading-6 text-red-950 dark:bg-red-950/30 dark:text-red-100">
              {msg.content && <p>{msg.content}</p>}
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">{t("chat.failureHint")}</p>
            </div>
          ) : msg.content ? (
            <ChatMarkdown
              content={msg.content}
              citations={msg.citations ?? []}
              onCitationClick={onCitationClick}
            />
          ) : (
            <div className="text-sm leading-7 text-zinc-700 dark:text-zinc-300">
              <span className="flex items-center gap-1.5 font-medium italic text-zinc-400 dark:text-zinc-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400 dark:text-zinc-500" />
                {t("chat.retrieving")}
              </span>
            </div>
          )}

          {/* Citations list */}
          {!isFailed && msg.citations && msg.citations.length > 0 && (
            <div className="mt-5 space-y-2.5 border-t border-zinc-100 pt-4 transition dark:border-zinc-900">
              <span className="block select-none text-[9px] font-bold uppercase text-zinc-400 dark:text-zinc-500">{t("chat.sourceTitle")}</span>
              
              <div className="flex flex-wrap gap-1.5">
                {msg.citations.map((cit) => (
                  <div key={cit.id} className="relative inline-flex items-center">
                    <button
                      data-citation-id={cit.id}
                      onClick={() => onCitationClick(cit)}
                      disabled={!cit.sourceAvailable}
                      className="flex min-h-7 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-950 transition hover:border-amber-300 hover:bg-amber-100 active:scale-[0.98] dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:border-amber-800 dark:hover:bg-amber-950/60"
                    >
                      <FileText className="h-3 w-3 shrink-0 text-zinc-400" />
                      <span>
                        {cit.assetTitle} · {getLocatorSummary(cit.locator)}
                        {!cit.sourceAvailable ? ` · ${t("viewer.sourceUnavailable")}` : ""}
                      </span>
                    </button>
                    
                    <button
                      onClick={() => onQuickNoteOpen(cit)}
                      title={t("chat.quickNote")}
                      className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-emerald-700 dark:text-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-emerald-400"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Save Note inline overlay editor */}
          {!isFailed && msg.citations?.map((cit) => showNoteEditorId === cit.id && (
            <div 
              key={`editor-${cit.id}`}
              className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-zinc-700 shadow-lg animate-in slide-in-from-top-2 duration-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300"
            >
              <div className="flex justify-between items-center pb-1 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">{t("chat.popoverTitle")}</span>
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
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 transition focus:border-emerald-500 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">{t("chat.popoverContentLabel")}</label>
                  <textarea
                    rows={4}
                    value={quickNoteContent}
                    onChange={(e) => setQuickNoteContent(e.target.value)}
                    className="mt-1 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 font-sans text-sm text-zinc-900 transition focus:border-emerald-500 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
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
                  className="flex items-center gap-1 rounded-lg bg-zinc-950 px-3 py-2 text-[10px] font-bold text-white transition hover:bg-zinc-800 active:scale-95 dark:bg-emerald-600 dark:hover:bg-emerald-500"
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
