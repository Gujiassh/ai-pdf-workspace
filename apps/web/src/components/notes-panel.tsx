"use client";

import React, { useState } from "react";
import { useWorkspace, Note } from "@/lib/mock-context";
import { 
  Plus, Trash2, FileText, ExternalLink, Tag as TagIcon, 
  X, CheckSquare, Sparkles, BookOpen
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

  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");

  const wsNotes = notes.filter((n) => n.workspaceId === currentWorkspace?.id);
  const wsTags = tags.filter((t) => t.workspaceId === currentWorkspace?.id);

  // Filter notes by search text AND selected tags
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
    <div className="flex h-full flex-col bg-white">
      {/* Header controls */}
      <div className="border-b border-zinc-200/80 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900">知识沉淀笔记</h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 active:scale-95 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            新建笔记
          </button>
        </div>
        
        {/* Search filter input */}
        <input
          type="text"
          placeholder="搜索工作区笔记..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs outline-none focus:border-zinc-300 focus:bg-white transition"
        />

        {/* Selected tag filters info */}
        {selectedTagIds.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-zinc-400">已过滤标签:</span>
            <div className="flex flex-wrap gap-1">
              {selectedTagIds.map((tagId) => {
                const tag = tags.find((t) => t.id === tagId);
                return tag ? (
                  <span
                    key={tagId}
                    className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
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
        {/* Free Note creation overlay */}
        {showAddForm && (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3 animate-in slide-in-from-top-1 duration-150">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">标题</label>
              <input
                type="text"
                required
                placeholder="输入笔记小标题..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-zinc-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">正文</label>
              <textarea
                required
                placeholder="记录灵感、重点摘录或待办要点..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-zinc-300 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 transition"
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition"
              >
                保存
              </button>
            </div>
          </form>
        )}

        {filteredNotes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 pt-16">
            <BookOpen className="h-8 w-8 text-zinc-300" />
            <h4 className="mt-3 text-xs font-semibold text-zinc-700">没有找到笔记</h4>
            <p className="mt-1 w-64 text-[10px] leading-5 text-zinc-400">
              {wsNotes.length === 0 
                ? "您还没有在这个工作区创建笔记。你可以手动新建，或者在问答回答的来源引用中点击一键快捷生成。"
                : "当前标签或搜索过滤器未匹配到任何笔记。"}
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              className="rounded-2xl border border-zinc-100 bg-zinc-50/20 p-4 space-y-3 transition hover:border-zinc-200 hover:bg-zinc-50/50"
            >
              {/* Note Header */}
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-xs font-bold text-zinc-900 leading-snug">{note.title}</h4>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="text-zinc-400 hover:text-rose-600 transition p-0.5 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Note Content */}
              <p className="text-xs leading-6 text-zinc-600 whitespace-pre-wrap">{note.content}</p>

              {/* Note metadata/citation source link */}
              {note.source && (
                <div 
                  onClick={() => handleSourceClick(note)}
                  className="flex items-center justify-between rounded-lg bg-white border border-zinc-150 p-2.5 cursor-pointer hover:border-zinc-300 hover:bg-zinc-50/30 transition duration-150"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-indigo-700 uppercase tracking-wider">
                      <FileText className="h-2.5 w-2.5 shrink-0" />
                      <span>来源归属：{note.source.documentName.split(".pdf")[0]} p.{note.source.pageNumber}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-zinc-400 italic">
                      "{note.source.snippet}"
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-zinc-400 shrink-0 ml-2" />
                </div>
              )}

              {/* Tags bindings inside notes */}
              <div className="flex flex-wrap items-center gap-1">
                <TagIcon className="h-3 w-3 text-zinc-400 shrink-0" />
                
                {wsTags.map((tag) => {
                  const hasTag = note.tags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleNoteTag(note.id, tag.name)}
                      className={`rounded-full px-2 py-0.5 text-[9px] font-bold transition ${
                        hasTag 
                          ? "text-white" 
                          : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
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
