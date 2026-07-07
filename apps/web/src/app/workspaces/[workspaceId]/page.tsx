"use client";

import React, { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/mock-context";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { PdfViewer } from "@/components/pdf-viewer";
import { ChatPanel } from "@/components/chat-panel";
import { NotesPanel } from "@/components/notes-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { 
  MessageSquare, BookOpen, Settings2, Home, HelpCircle 
} from "lucide-react";
import Link from "next/link";

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { 
    user,
    workspaces, 
    currentWorkspace, 
    switchWorkspace, 
    activeTab, 
    setActiveTab,
    rightPanelOpen
  } = useWorkspace();

  const workspaceId = params?.workspaceId as string;

  // Sync route param with context state & check authentication
  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }
    if (workspaceId) {
      const exists = workspaces.some((w) => w.id === workspaceId);
      if (exists) {
        switchWorkspace(workspaceId);
      } else {
        router.push("/");
      }
    }
  }, [workspaceId, workspaces, switchWorkspace, router, user]);

  if (!currentWorkspace) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 font-medium">
        正在载入工作区环境...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 font-sans antialiased text-zinc-300">
      {/* 1. Left Column (Sidebar navigation - adjusts to w-72 or w-16 inside) */}
      <WorkspaceSidebar />

      {/* 2. Center Column (PDF Viewer & Overview dashboard) */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-zinc-800">
        <PdfViewer />
      </div>

      {/* 3. Right Column (Workspace Tabs - collapsible) */}
      {rightPanelOpen && (
        <div className="flex w-[384px] shrink-0 flex-col overflow-hidden bg-white dark:bg-zinc-950 shadow-2xl border-l border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-right duration-300">
          {/* Right Tab Bar */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 p-2 gap-1.5 shrink-0">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                activeTab === "chat"
                  ? "bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs border border-zinc-200 dark:border-zinc-800"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-zinc-900/30"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              AI 问答
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                activeTab === "notes"
                  ? "bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs border border-zinc-200 dark:border-zinc-800"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-zinc-900/30"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              笔记 ({currentWorkspace.noteCount})
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                activeTab === "settings"
                  ? "bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs border border-zinc-200 dark:border-zinc-800"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-zinc-900/30"
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              配置
            </button>
          </div>

          {/* Dynamic Tab Body panel */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "chat" && <ChatPanel />}
            {activeTab === "notes" && <NotesPanel />}
            {activeTab === "settings" && <SettingsPanel />}
          </div>

          {/* Global Exit home Link */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-900/30 flex justify-between items-center text-[10px] text-zinc-450 dark:text-zinc-500 font-medium shrink-0">
            <Link 
              href="/workspaces" 
              className="flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 transition"
            >
              <Home className="h-3 w-3" />
              返回主大盘
            </Link>
            <span>v1.0 Self-Design Edition</span>
          </div>
        </div>
      )}
    </div>
  );
}
