"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { useTranslation } from "@/lib/i18n-context";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { PdfViewer } from "@/components/pdf-viewer";
import { ChatPanel } from "@/components/chat-panel";
import { NotesPanel } from "@/components/notes-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { BookOpen, MessageSquare, Settings2 } from "lucide-react";

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const {
    isHydrating: isWorkspaceHydrating,
    workspaces,
    currentWorkspace,
    switchWorkspace,
    activeTab,
    setActiveTab,
    leftSidebarOpen,
    rightPanelOpen,
    setLeftSidebarOpen,
    setRightPanelOpen,
  } = useWorkspace();

  const { user, isHydrating: isAuthHydrating } = useAuth();
  const { t } = useTranslation();

  const workspaceId = params?.workspaceId as string;

  useEffect(() => {
    if (isAuthHydrating || isWorkspaceHydrating) {
      return;
    }

    if (!user) {
      router.push("/");
      return;
    }

    if (workspaceId) {
      const exists = workspaces.some((workspace) => workspace.id === workspaceId);
      if (exists) {
        switchWorkspace(workspaceId);
      } else {
        router.push("/");
      }
    }
  }, [isAuthHydrating, isWorkspaceHydrating, router, switchWorkspace, user, workspaceId, workspaces]);

  if (isAuthHydrating || isWorkspaceHydrating || !currentWorkspace) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 text-sm font-medium text-zinc-500 dark:bg-zinc-950">
        {t("workspace.loading")}
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-zinc-50 font-sans text-zinc-700 antialiased transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-300">
      {leftSidebarOpen && (
        <div
          onClick={() => setLeftSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs duration-200 animate-in fade-in lg:hidden"
        />
      )}

      <WorkspaceSidebar />

      <div className="z-10 flex flex-1 flex-col overflow-hidden border-r border-zinc-800 lg:z-auto">
        <PdfViewer />
      </div>

      {rightPanelOpen && (
        <div
          onClick={() => setRightPanelOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs duration-200 animate-in fade-in lg:hidden"
        />
      )}

      {rightPanelOpen && (
        <div className="absolute inset-y-0 right-0 z-40 flex w-[384px] max-w-[90vw] shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white shadow-2xl duration-300 animate-in slide-in-from-right dark:border-zinc-800 dark:bg-zinc-950 lg:relative lg:z-auto">
          <div className="flex shrink-0 gap-1.5 border-b border-zinc-200 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                activeTab === "chat"
                  ? "border border-zinc-200 bg-white text-zinc-950 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                  : "text-zinc-500 hover:bg-white/40 hover:text-zinc-900 dark:hover:bg-zinc-900/30 dark:hover:text-white"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t("workspace.tabChat")}
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                activeTab === "notes"
                  ? "border border-zinc-200 bg-white text-zinc-950 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                  : "text-zinc-500 hover:bg-white/40 hover:text-zinc-900 dark:hover:bg-zinc-900/30 dark:hover:text-white"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              {t("workspace.tabNotes")} ({currentWorkspace.noteCount})
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
                activeTab === "settings"
                  ? "border border-zinc-200 bg-white text-zinc-950 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                  : "text-zinc-500 hover:bg-white/40 hover:text-zinc-900 dark:hover:bg-zinc-900/30 dark:hover:text-white"
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t("workspace.tabSettings")}
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {activeTab === "chat" && <ChatPanel />}
            {activeTab === "notes" && <NotesPanel />}
            {activeTab === "settings" && <SettingsPanel />}
          </div>
        </div>
      )}
    </div>
  );
}
