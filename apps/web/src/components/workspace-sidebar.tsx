"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkspace, Document } from "@/lib/workspace-context";
import { useTheme } from "@/lib/theme-context";
import { useTranslation } from "@/lib/i18n-context";
import { 
  Plus, Trash2, MessageSquare, 
  Tag as TagIcon, ChevronDown, UploadCloud, X, ChevronLeft, ChevronRight,
  Sun, Moon, Globe, LogOut, Home
} from "lucide-react";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
export function WorkspaceSidebar() {
  const {
    workspaces,
    currentWorkspace,
    documents,
    threads,
    activeThread,
    tags,
    activeDocumentId,
    leftSidebarOpen,
    selectedTagIds,
    switchWorkspace,
    createWorkspace,
    uploadDocument,
    deleteDocument,
    openDocument,
    createThread,
    switchThread,
    deleteThread,
    addTag,
    setLeftSidebarOpen,
    setSelectedTagIds,
  } = useWorkspace();

  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useTranslation();

  const [showWsMenu, setShowWsMenu] = useState(false);
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const wsDocs = documents.filter((d) => d.workspaceId === currentWorkspace?.id);
  const wsThreads = threads.filter((t) => t.workspaceId === currentWorkspace?.id);
  const wsTags = tags.filter((t) => t.workspaceId === currentWorkspace?.id);
  
  const isAnyDocProcessing = wsDocs.some((d) => d.status !== "ready" && d.status !== "failed");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      uploadDocument(file.name, file.size);
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };



  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    addTag(newTagName.trim());
    setNewTagName("");
  };

  const toggleTagFilter = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready": return "bg-emerald-500";
      case "failed": return "bg-rose-500";
      default: return "bg-cyan-400 animate-pulse";
    }
  };

  const getStatusLabel = (doc: Document) => {
    switch (doc.status) {
      case "uploaded": return `${t("sidebar.statusUploaded")} (${doc.progress}%)`;
      case "parsing": return `${t("sidebar.statusParsing")} (${doc.progress}%)`;
      case "chunking": return `${t("sidebar.statusChunking")} (${doc.progress}%)`;
      case "embedding": return `${t("sidebar.statusEmbedding")} (${doc.progress}%)`;
      case "ready": return t("sidebar.statusReady");
      default: return t("sidebar.statusFailed");
    }
  };

  // 1. COLLAPSED SIDEBAR (Slim Rail)
  if (!leftSidebarOpen) {
    return (
      <div className="flex h-full w-16 flex-col items-center justify-between border-r border-zinc-800 bg-zinc-950 py-4 shrink-0 transition-all duration-300 hidden md:flex">
        <div className="flex flex-col items-center gap-6 w-full">
          {/* Expand Toggle */}
          <button
            onClick={() => setLeftSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition active:scale-95"
            title={t("sidebar.expandTooltip")}
          >
            <ChevronRight className="h-4.5 w-4.5" />
          </button>

          <div className="h-px w-8 bg-zinc-800" />

          {/* Current Workspace Icon Indicator */}
          <button
            onClick={() => setLeftSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-extrabold text-sm shadow-md hover:bg-indigo-500 transition active:scale-95"
            title={currentWorkspace?.name}
          >
            {currentWorkspace?.name.slice(0, 1)}
          </button>

          {/* Quick upload icon */}
          <button
            onClick={triggerUpload}
            className="group relative flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition active:scale-95"
            title={t("sidebar.uploadTooltip")}
          >
            <UploadCloud className="h-4 w-4" />
            {isAnyDocProcessing && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            )}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            className="hidden"
          />

          {/* Quick Thread Icon */}
          <button
            onClick={createThread}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 transition active:scale-95"
            title={t("sidebar.newThread")}
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white transition"
            title={t("sidebar.themeTooltip")}
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-500 transition"
            title={t("sidebar.logout")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // 2. EXPANDED SIDEBAR (Full Width)
  return (
    <div className="flex h-full w-72 flex-col border-r border-zinc-800 bg-zinc-950 shrink-0 transition-all duration-300 text-zinc-300 absolute lg:relative z-40 lg:z-auto h-screen inset-y-0 left-0 shadow-2xl lg:shadow-none">
      
      {/* Expanded Header */}
      <div className="relative border-b border-zinc-800/80 p-4 flex items-center justify-between gap-2.5">
        {/* Home icon button - Return to Home */}
        <Link
          href="/"
          className="p-1.5 rounded-lg border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-900 transition shrink-0 cursor-pointer flex items-center justify-center"
          title={t("sidebar.homeTooltip")}
        >
          <Home className="h-4 w-4" />
        </Link>

        <button
          onClick={() => setShowWsMenu(!showWsMenu)}
          className="flex-1 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left shadow-sm transition hover:border-zinc-700 hover:bg-zinc-900 active:scale-[0.98]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white font-extrabold text-sm shadow-md">
              {currentWorkspace?.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-white">{currentWorkspace?.name}</div>
              <div className="text-[10px] text-zinc-500 font-semibold">{t("dashboard.role")}: {currentWorkspace?.role}</div>
            </div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        </button>

        {/* Collapse Sidebar Button */}
        <button
          onClick={() => setLeftSidebarOpen(false)}
          className="p-1.5 rounded-lg border border-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-900 transition shrink-0"
          title={t("sidebar.collapseTooltip")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {showWsMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowWsMenu(false)} />
            <div className="absolute left-4 right-4 top-16 z-20 mt-1.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-2 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150 text-zinc-300">
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      switchWorkspace(ws.id);
                      setShowWsMenu(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-zinc-800 ${
                      ws.id === currentWorkspace?.id ? "bg-zinc-800 font-semibold text-white" : "text-zinc-400"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="truncate">{ws.name}</div>
                      <div className="truncate text-[10px] text-zinc-500">{ws.description || t("sidebar.noDesc")}</div>
                    </div>
                    {ws.id === currentWorkspace?.id && (
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              
              <div className="mt-2 border-t border-zinc-800 pt-2">
                <button
                  onClick={() => setShowCreateWs(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-2 py-2 text-xs font-bold text-white transition hover:bg-zinc-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("dashboard.createBtn")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Navigation and Lists */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Documents section (Tab enabled) */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-505">{t("sidebar.docsHeader")}</span>
            <button
              onClick={triggerUpload}
              className="flex items-center gap-1 rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 text-[10px] font-bold text-white hover:bg-zinc-800 transition active:scale-95"
            >
              <Plus className="h-3 w-3" />
              {t("sidebar.uploadBtn")}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              className="hidden"
            />
          </div>

          <div className="mt-2.5 space-y-1">
            {wsDocs.length === 0 ? (
              <div 
                onClick={triggerUpload}
                className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/10 p-5 text-center transition hover:border-zinc-700"
              >
                <UploadCloud className="h-6 w-6 text-zinc-600 group-hover:text-zinc-400 transition" />
                <span className="mt-1.5 text-[10px] font-bold text-zinc-500">{t("sidebar.dropzone")}</span>
              </div>
            ) : (
              wsDocs.map((doc) => {
                const isActive = activeDocumentId === doc.id;
                
                return (
                  <div
                    key={doc.id}
                    onClick={() => doc.status === "ready" && openDocument(doc.id)}
                    className={`group relative flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 transition ${
                      isActive
                        ? "bg-zinc-900 text-white font-semibold"
                        : "text-zinc-400 hover:bg-zinc-900/40 hover:text-zinc-200"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${getStatusColor(doc.status)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs">{doc.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-zinc-500 font-semibold">
                          <span>{doc.size}</span>
                          <span>•</span>
                          <span>{doc.pagesCount} {t("viewer.pages")}</span>
                          {doc.status !== "ready" && (
                            <>
                              <span>•</span>
                              <span className="text-cyan-400 font-bold">{getStatusLabel(doc)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDocument(doc.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>

                    {/* Simulating progress bar overlay */}
                    {doc.status !== "ready" && doc.status !== "failed" && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 overflow-hidden">
                        <div 
                          className="h-full bg-cyan-400 transition-all duration-300"
                          style={{ width: `${doc.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tags management */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-505">{t("sidebar.tagsHeader")}</span>
          <form onSubmit={handleAddTag} className="mt-2.5 flex gap-1.5">
            <input
              type="text"
              placeholder={t("sidebar.placeholder")}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs outline-none text-white focus:border-zinc-700"
            />
            <button 
              type="submit" 
              className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-1 text-[10px] font-bold text-white hover:bg-zinc-800 active:scale-95"
            >
              {t("sidebar.add")}
            </button>
          </form>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {wsTags.length === 0 ? (
              <span className="text-[10px] text-zinc-600">{t("sidebar.noTags")}</span>
            ) : (
              wsTags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTagFilter(tag.id)}
                    className={`flex items-center gap-0.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold transition ${
                      isSelected
                        ? "text-zinc-950 font-black"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                    }`}
                    style={{ backgroundColor: isSelected ? tag.color : undefined }}
                  >
                    <TagIcon className="h-2 w-2 shrink-0" />
                    {tag.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat History section */}
        <div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-505">{t("sidebar.threadsHeader")}</span>
            <button
              onClick={createThread}
              className="flex items-center gap-0.5 rounded-lg bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-zinc-800 active:scale-95"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <div className="mt-2.5 space-y-0.5">
            {wsThreads.length === 0 ? (
              <span className="text-[10px] text-zinc-600 block">{t("sidebar.noThreads")}</span>
            ) : (
              wsThreads.map((th) => (
                <div
                  key={th.id}
                  onClick={() => switchThread(th.id)}
                  className={`group flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs transition ${
                    activeThread?.id === th.id
                      ? "bg-zinc-900 text-white font-semibold"
                      : "text-zinc-500 hover:bg-zinc-900/20 hover:text-zinc-300"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MessageSquare className="h-3 w-3 text-zinc-600" />
                    <span className="truncate text-xs">{th.title || t("sidebar.newThread")}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteThread(th.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-500 transition"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Footer controls with language & theme selector */}
      <div className="border-t border-zinc-800 p-3 bg-zinc-950 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          {user && (
            <Image
              src={user.avatarUrl}
              alt={user.name}
              width={28}
              height={28}
              unoptimized
              className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-800"
            />
          )}
          <div className="text-left leading-none">
            <div className="text-[10px] font-bold text-white truncate max-w-[80px]">{user?.name}</div>
            <div className="text-[9px] text-zinc-500 truncate max-w-[80px] mt-0.5">{user?.email}</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Language Switch */}
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="p-1 rounded-lg hover:bg-zinc-900 hover:text-white transition text-zinc-500 font-bold text-[10px] flex items-center gap-0.5"
            title={locale === "zh" ? "Switch to English" : "切换为中文"}
          >
            <Globe className="h-3.5 w-3.5" />
            {locale === "zh" ? "EN" : "中"}
          </button>

          {/* Theme Switch */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg hover:bg-zinc-900 hover:text-white transition text-zinc-500"
            title={t("sidebar.themeTooltip")}
          >
            {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="p-1 rounded-lg hover:bg-zinc-900 hover:text-rose-400 transition text-zinc-500"
            title={t("sidebar.logout")}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* New Workspace modal overlay */}
      <CreateWorkspaceDialog
        show={showCreateWs}
        onClose={() => setShowCreateWs(false)}
        onCreate={(name, desc) => {
          createWorkspace(name, desc);
          setShowWsMenu(false);
        }}
        t={t}
      />
    </div>
  );
}
