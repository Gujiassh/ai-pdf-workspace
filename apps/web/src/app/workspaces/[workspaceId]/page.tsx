"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BookOpen,
  FileSearch,
  GripVertical,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelLeftOpen,
  Settings2,
  X,
} from "lucide-react";

import { ChatPanel } from "@/components/chat-panel";
import { NotesPanel } from "@/components/notes-panel";
import { PdfViewer } from "@/components/pdf-viewer";
import { SettingsPanel } from "@/components/settings-panel";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { useAuth } from "@/lib/auth/auth-context";
import { useTranslation } from "@/lib/i18n-context";
import { useWorkspace } from "@/lib/workspace-context";
import {
  clampEvidencePanelWidth,
  DEFAULT_EVIDENCE_PANEL_WIDTH,
  MAX_EVIDENCE_PANEL_WIDTH,
  MIN_EVIDENCE_PANEL_WIDTH,
} from "@/lib/workspace-view-state";

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceCanvasRef = useRef<HTMLDivElement>(null);
  const [evidencePanelWidth, setEvidencePanelWidth] = useState(DEFAULT_EVIDENCE_PANEL_WIDTH);
  const [isResizingEvidence, setIsResizingEvidence] = useState(false);
  const {
    isHydrating: isWorkspaceHydrating,
    workspaces,
    currentWorkspace,
    documents,
    activeDocumentId,
    switchWorkspace,
    activeTab,
    setActiveTab,
    leftSidebarOpen,
    evidencePanelOpen,
    evidencePanelExpanded,
    setLeftSidebarOpen,
    setEvidencePanelOpen,
    setEvidencePanelExpanded,
    closeEvidencePanel,
  } = useWorkspace();

  const { user, isHydrating: isAuthHydrating } = useAuth();
  const { t } = useTranslation();
  const workspaceId = params?.workspaceId as string;
  const activeDocument = documents.find((document) => document.id === activeDocumentId);

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

  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setLeftSidebarOpen(false);
      closeEvidencePanel();
    }
  }, [closeEvidencePanel, setLeftSidebarOpen]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (evidencePanelExpanded) {
        setEvidencePanelExpanded(false);
      } else if (evidencePanelOpen) {
        closeEvidencePanel();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeEvidencePanel, evidencePanelExpanded, evidencePanelOpen, setEvidencePanelExpanded]);

  useEffect(() => {
    const element = workspaceCanvasRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setEvidencePanelWidth((currentWidth) => clampEvidencePanelWidth(currentWidth, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const resizeEvidencePanelFromPointer = (clientX: number) => {
    const bounds = workspaceCanvasRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setEvidencePanelWidth(clampEvidencePanelWidth(bounds.right - clientX, bounds.width));
  };

  const handleEvidenceResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const workspaceWidth = workspaceCanvasRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setEvidencePanelWidth((currentWidth) => clampEvidencePanelWidth(currentWidth + 32, workspaceWidth));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setEvidencePanelWidth((currentWidth) => clampEvidencePanelWidth(currentWidth - 32, workspaceWidth));
    } else if (event.key === "Home") {
      event.preventDefault();
      setEvidencePanelWidth(MIN_EVIDENCE_PANEL_WIDTH);
    }
  };

  const handleEvidenceResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizingEvidence(true);
  };

  const handleEvidenceResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    resizeEvidencePanelFromPointer(event.clientX);
  };

  const handleEvidenceResizePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsResizingEvidence(false);
  };

  if (isAuthHydrating || isWorkspaceHydrating || !currentWorkspace) {
    return (
      <div className="workspace-theme-shell flex h-screen w-screen items-center justify-center bg-background text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {t("workspace.loading")}
      </div>
    );
  }

  return (
    <div className="workspace-theme-shell relative flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground antialiased">
      {leftSidebarOpen ? (
        <button
          type="button"
          aria-label={t("workspace.closeNavigation")}
          onClick={() => setLeftSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/35 backdrop-blur-[1px] lg:hidden"
        />
      ) : null}

      <WorkspaceSidebar />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {!leftSidebarOpen ? (
              <button
                type="button"
                onClick={() => setLeftSidebarOpen(true)}
                title={t("sidebar.expandTooltip")}
                aria-label={t("sidebar.expandTooltip")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-zinc-950 dark:text-white sm:text-[15px]">
                {currentWorkspace.name}
              </h1>
              <p className="mt-0.5 truncate text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                {t("workspace.knowledgeScope")} · {currentWorkspace.documentCount} {t("dashboard.docs")}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div role="tablist" aria-label={t("workspace.viewTabs")} className="flex items-center rounded-lg border border-border bg-card p-1">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "chat"}
                title={t("workspace.tabChat")}
                onClick={() => setActiveTab("chat")}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition sm:px-3 ${
                  activeTab === "chat"
                    ? "bg-zinc-950 text-white shadow-sm dark:bg-white dark:text-zinc-950"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("workspace.tabChat")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "notes"}
                title={t("workspace.tabNotes")}
                onClick={() => setActiveTab("notes")}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition sm:px-3 ${
                  activeTab === "notes"
                    ? "bg-zinc-950 text-white shadow-sm dark:bg-white dark:text-zinc-950"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("workspace.tabNotes")}</span>
                {currentWorkspace.noteCount > 0 ? (
                  <span className="hidden text-[9px] opacity-70 md:inline">{currentWorkspace.noteCount}</span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "settings"}
                title={t("workspace.tabSettings")}
                onClick={() => setActiveTab("settings")}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition sm:px-3 ${
                  activeTab === "settings"
                    ? "bg-zinc-950 text-white shadow-sm dark:bg-white dark:text-zinc-950"
                    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                }`}
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("workspace.tabSettings")}</span>
              </button>
            </div>

            <button
              type="button"
              data-evidence-toggle
              disabled={!activeDocument}
              aria-pressed={evidencePanelOpen}
              onClick={() => evidencePanelOpen ? closeEvidencePanel() : setEvidencePanelOpen(true)}
              title={t("workspace.evidencePanel")}
              className={`flex h-10 items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold transition sm:px-3 ${
                evidencePanelOpen
                  ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border-border bg-card text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <FileSearch className="h-4 w-4" />
              <span className="hidden md:inline">{t("workspace.evidence")}</span>
            </button>
          </div>
        </header>

        <div ref={workspaceCanvasRef} className="relative flex min-h-0 flex-1 overflow-hidden">
          <section className="min-w-0 flex-1 overflow-hidden bg-card" aria-live="polite">
            {activeTab === "chat" ? <ChatPanel /> : null}
            {activeTab === "notes" ? <NotesPanel /> : null}
            {activeTab === "settings" ? <SettingsPanel /> : null}
          </section>

          {evidencePanelOpen && !evidencePanelExpanded ? (
            <button
              type="button"
              aria-label={t("workspace.closeEvidence")}
              onClick={closeEvidencePanel}
              className="absolute inset-0 z-30 bg-black/25 backdrop-blur-[1px] xl:hidden"
            />
          ) : null}

          {evidencePanelOpen ? (
            <aside
              data-evidence-panel
              aria-label={t("workspace.evidencePanel")}
              style={evidencePanelExpanded ? undefined : ({ "--evidence-panel-width": `${evidencePanelWidth}px` } as CSSProperties)}
              className={`workspace-evidence-panel relative flex flex-col overflow-hidden border-l border-border bg-background shadow-2xl ${
                isResizingEvidence ? "" : "transition-[width,transform] duration-200"
              } ${
                evidencePanelExpanded
                  ? "fixed inset-0 z-[60] w-screen"
                  : "absolute inset-y-0 right-0 z-40 w-full sm:w-[min(92vw,720px)] xl:relative xl:z-auto xl:w-[var(--evidence-panel-width)] xl:min-w-0 xl:max-w-none xl:shadow-none"
              }`}
            >
              {!evidencePanelExpanded ? (
                <div
                  role="separator"
                  tabIndex={0}
                  data-evidence-resizer
                  aria-label={t("workspace.resizeEvidence")}
                  aria-orientation="vertical"
                  aria-valuemin={MIN_EVIDENCE_PANEL_WIDTH}
                  aria-valuemax={MAX_EVIDENCE_PANEL_WIDTH}
                  aria-valuenow={Math.round(evidencePanelWidth)}
                  onDoubleClick={() => {
                    const workspaceWidth = workspaceCanvasRef.current?.getBoundingClientRect().width ?? window.innerWidth;
                    setEvidencePanelWidth(clampEvidencePanelWidth(DEFAULT_EVIDENCE_PANEL_WIDTH, workspaceWidth));
                  }}
                  onKeyDown={handleEvidenceResizeKeyDown}
                  onPointerDown={handleEvidenceResizePointerDown}
                  onPointerMove={handleEvidenceResizePointerMove}
                  onPointerUp={handleEvidenceResizePointerUp}
                  onPointerCancel={handleEvidenceResizePointerUp}
                  className="group absolute inset-y-0 left-0 z-50 hidden w-2 touch-none cursor-col-resize items-center justify-center outline-none xl:flex"
                >
                  <span className="flex h-10 w-1 items-center justify-center rounded-full bg-zinc-300 transition group-hover:bg-amber-400 group-focus-visible:bg-amber-500 dark:bg-zinc-700">
                    <GripVertical className="h-3 w-3 text-transparent" />
                  </span>
                </div>
              ) : null}
              <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <FileSearch className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">
                      {t("workspace.pdfSource")}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                      {activeDocument?.name ?? t("viewer.noDocTitle")}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEvidencePanelExpanded(!evidencePanelExpanded)}
                    title={evidencePanelExpanded ? t("workspace.exitReader") : t("workspace.openReader")}
                    aria-label={evidencePanelExpanded ? t("workspace.exitReader") : t("workspace.openReader")}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                  >
                    {evidencePanelExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={closeEvidencePanel}
                    title={t("workspace.closeEvidence")}
                    aria-label={t("workspace.closeEvidence")}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <PdfViewer />
              </div>
            </aside>
          ) : null}
        </div>
      </main>
    </div>
  );
}
