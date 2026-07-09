"use client";

import React, { useState } from "react";
import { useWorkspace, Note } from "@/lib/workspace-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  Plus, Trash2, FileText, ExternalLink, Tag as TagIcon, BookOpen
} from "lucide-react";

export function NotesPanel() {
  const {
    currentWorkspace,
    notes,
    tags,
    selectedTagIds,
    createNote,
    deleteNote,
    toggleNoteTag,
    setActiveDocumentId,
    setActivePdfPage,
  } = useWorkspace();

  const { t } = useTranslation();

  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");

  const wsNotes = notes.filter((n) => n.workspaceId === currentWorkspace?.id);
  const wsTags = tags.filter((t) => t.workspaceId === currentWorkspace?.id);

  const filteredNotes = wsNotes.filter((note) => {
    const matchesSearch = 
      note.title.toLowerCase().includes(search.toLowerCase()) ||
      note.content.toLowerCase().includes(search.toLowerCase());
      
    const matchesTags = 
      selectedTagIds.length === 0 ||
      selectedTagIds.some((tagId) => {
        const tag = tags.find((t) => t.id === tagId);
        return tag ? note.tags.includes(tag.name) : false;
      });

    return matchesSearch && matchesTags;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    createNote(title.trim(), content.trim());
    setTitle("");
    setContent("");
    setShowAddForm(false);
  };

  const handleSourceClick = (note: Note) => {
    if (note.source) {
      setActiveDocumentId(note.source.documentId);
      setActivePdfPage(note.source.pageNumber);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950 transition-colors duration-200">
      {/* Header controls */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 transition">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{t("notes.header")}</h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-950 dark:bg-white px-2 py-1.5 text-xs font-bold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("notes.createBtn")}
          </button>
        </div>
        
        {/* Search filter input */}
        <input
          type="text"
          placeholder={t("notes.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2.5 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-55 dark:bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-zinc-400 focus:bg-white text-zinc-800 dark:text-zinc-100 transition"
        />

        {/* Selected tag filters info */}
        {selectedTagIds.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{t("notes.filterLabel")}</span>
            <div className="flex flex-wrap gap-1">
              {selectedTagIds.map((tagId) => {
                const tag = tags.find((t) => t.id === tagId);
                return tag ? (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold text-white"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Notes List & Editor Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {showAddForm && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4 space-y-3.5 animate-in slide-in-from-top-1 duration-150 text-zinc-800 dark:text-zinc-200">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">{t("notes.formTitle")}</h4>
            <div>
              <label className="block text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{t("notes.formTitleLabel")}</label>
              <input
                type="text"
                required
                placeholder={t("notes.searchPlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-xs outline-none text-zinc-800 dark:text-zinc-100 focus:border-zinc-400"
              />
            </div>
            <div>
              <label className="block text-[9px] font-bold text-zinc-400 dark:text-zinc-550 uppercase tracking-wider">{t("notes.formContentLabel")}</label>
              <textarea
                required
                placeholder={t("notes.formPlaceholder")}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 py-1.5 text-xs outline-none text-zinc-800 dark:text-zinc-100 focus:border-zinc-400 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 transition cursor-pointer"
              >
                {t("chat.cancel")}
              </button>
              <button
                type="submit"
                className="rounded-lg bg-zinc-950 dark:bg-white px-3 py-1.5 text-xs font-bold text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition cursor-pointer"
              >
                {t("notes.formSave")}
              </button>
            </div>
          </form>
        )}

        {filteredNotes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-zinc-300 dark:text-zinc-700">
            <BookOpen className="h-6 w-6 animate-pulse" />
            <span className="mt-2 text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600">{t("notes.emptyTitle")}</span>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              className="rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/10 p-4 space-y-3 transition hover:border-zinc-200 hover:bg-zinc-50/50 dark:hover:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white leading-snug">{note.title}</h4>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="text-zinc-400 hover:text-rose-600 transition p-0.5 shrink-0 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="text-xs leading-6 text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{note.content}</p>

              {/* Note source Link */}
              {note.source && (
                <div 
                  onClick={() => handleSourceClick(note)}
                  className="flex items-center justify-between rounded-xl bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 p-2.5 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition duration-150"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[8px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                      <FileText className="h-2.5 w-2.5 shrink-0" />
                      <span>{t("notes.source")}：{note.source.documentName.split(".pdf")[0]} p.{note.source.pageNumber}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                      &quot;{note.source.snippet}&quot;
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-zinc-400 dark:text-zinc-600 shrink-0 ml-2" />
                </div>
              )}

              {/* Tags inside note cards */}
              <div className="flex flex-wrap items-center gap-1">
                <TagIcon className="h-3 w-3 text-zinc-400 dark:text-zinc-600 shrink-0" />
                
                {wsTags.map((tag) => {
                  const hasTag = note.tags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleNoteTag(note.id, tag.name)}
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold transition ${
                        hasTag 
                          ? "text-white shadow-xs" 
                          : "bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 hover:bg-zinc-200"
                      }`}
                      style={{ backgroundColor: hasTag ? tag.color : undefined }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
