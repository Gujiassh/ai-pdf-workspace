"use client";

import React, { useState } from "react";
import { useWorkspace, Note } from "@/lib/workspace-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  Plus, Trash2, FileText, ExternalLink, Tag as TagIcon, BookOpen, Pencil
} from "lucide-react";

export function getNoteCardClassName(isEditing: boolean) {
  const baseClassName = "space-y-3 rounded-lg border p-4 transition-colors duration-150";

  return isEditing
    ? `${baseClassName} border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900`
    : `${baseClassName} border-zinc-100 bg-zinc-50/20 hover:border-zinc-200 hover:bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/10 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/50`;
}

export function NotesPanel() {
  const {
    currentWorkspace,
    notes,
    tags,
    selectedTagIds,
    createNote,
    updateNote,
    deleteNote,
    toggleNoteTag,
    openDocument,
    setActivePdfPage,
  } = useWorkspace();

  const { t } = useTranslation();

  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const safeLower = (value: string | null | undefined) => value?.toLowerCase() ?? "";

  const wsNotes = notes.filter((n) => n.workspaceId === currentWorkspace?.id);
  const wsTags = tags.filter((t) => t.workspaceId === currentWorkspace?.id);

  const normalizedSearch = safeLower(search);

  const filteredNotes = wsNotes.filter((note) => {
    const matchesSearch =
      safeLower(note.title).includes(normalizedSearch) ||
      safeLower(note.content).includes(normalizedSearch);
      
    const matchesTags = 
      selectedTagIds.length === 0 ||
      selectedTagIds.some((tagId) => {
        const tag = tags.find((t) => t.id === tagId);
        return tag ? note.tags.includes(tag.name) : false;
      });

    return matchesSearch && matchesTags;
  });

  const resetEditor = () => {
    setShowAddForm(false);
    setEditingNoteId(null);
    setTitle("");
    setContent("");
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || saving || editingNoteId) return;

    setSaving(true);
    try {
      await createNote(title.trim(), content.trim());
      resetEditor();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create note.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (event: React.FormEvent, noteId: string) => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || saving || editingNoteId !== noteId) return;

    setSaving(true);
    try {
      await updateNote(noteId, title.trim(), content.trim());
      resetEditor();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update note.");
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setShowAddForm(false);
  };

  const handleSourceClick = (note: Note) => {
    if (note.source) {
      openDocument(note.source.documentId);
      setActivePdfPage(note.source.pageNumber);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white transition-colors duration-200 dark:bg-zinc-950">
      {/* Header controls */}
      <div className="border-b border-zinc-200 px-4 py-3 transition dark:border-zinc-800 sm:px-8">
        <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">{t("notes.header")}</h3>
          <button
            onClick={() => {
              if (showAddForm) {
                resetEditor();
              } else {
                setEditingNoteId(null);
                setTitle("");
                setContent("");
                setShowAddForm(true);
              }
            }}
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
          className="mt-2.5 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-xs outline-none focus:border-zinc-400 focus:bg-white text-zinc-800 dark:text-zinc-100 transition"
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
      </div>

      {/* Main Notes List & Editor Form */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="mx-auto w-full max-w-5xl space-y-4">
        {showAddForm && (
          <form onSubmit={handleCreateSubmit} className="space-y-3.5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-zinc-800 animate-in slide-in-from-top-1 duration-150 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
              {t("notes.formTitle")}
            </h4>
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
              <label className="block text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">{t("notes.formContentLabel")}</label>
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
                onClick={resetEditor}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 transition cursor-pointer"
              >
                {t("chat.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
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
              data-note-card={note.id}
              data-note-editing={editingNoteId === note.id ? "true" : "false"}
              className={getNoteCardClassName(editingNoteId === note.id)}
            >
              {editingNoteId === note.id ? (
                <form onSubmit={(event) => void handleEditSubmit(event, note.id)} className="space-y-3.5">
                  <h4 className="text-xs font-bold uppercase text-zinc-900 dark:text-white">{t("notes.formEditTitle")}</h4>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-zinc-400 dark:text-zinc-500">{t("notes.formTitleLabel")}</label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-zinc-400 dark:text-zinc-500">{t("notes.formContentLabel")}</label>
                    <textarea
                      required
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      rows={5}
                      className="mt-1.5 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-6 text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={resetEditor} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
                      {t("chat.cancel")}
                    </button>
                    <button type="submit" disabled={saving} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 dark:hover:text-zinc-950">
                      {saving ? t("settings.saving") : t("notes.formSave")}
                    </button>
                  </div>
                </form>
              ) : (
                <>
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white leading-snug">{note.title}</h4>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => beginEdit(note)}
                    title={t("notes.edit")}
                    className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition p-0.5 cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void deleteNote(note.id).catch((error) => alert(error instanceof Error ? error.message : "Failed to delete note."))}
                    title={t("notes.delete")}
                    className="text-zinc-400 hover:text-rose-600 transition p-0.5 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs leading-6 text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{note.content}</p>

              {/* Note source Link */}
              {note.source && (
                <button
                  type="button"
                  onClick={() => handleSourceClick(note)}
                  className="flex w-full items-center justify-between border-l-2 border-amber-300 bg-amber-50/60 px-3 py-2 text-left transition hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 dark:hover:bg-amber-950/35"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-amber-800 dark:text-amber-300">
                      <FileText className="h-2.5 w-2.5 shrink-0" />
                      <span>{t("notes.source")}：{note.source.documentName.split(".pdf")[0]} p.{note.source.pageNumber}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                      &quot;{note.source.snippet}&quot;
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-zinc-400 dark:text-zinc-600 shrink-0 ml-2" />
                </button>
              )}

              {/* Tags inside note cards */}
              <div className="flex flex-wrap items-center gap-1">
                <TagIcon className="h-3 w-3 text-zinc-400 dark:text-zinc-600 shrink-0" />
                
                {wsTags.map((tag) => {
                  const hasTag = note.tags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => void toggleNoteTag(note.id, tag.name).catch((error) => alert(error instanceof Error ? error.message : "Failed to update note tags."))}
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
                </>
              )}
            </div>
          ))
        )}
        </div>
      </div>
    </div>
  );
}
