"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import { normalizeWorkspaceSummary, pickAccessibleWorkspaceId } from "@/lib/workspaces/normalize";
import type { CreateUploadSessionResponseDto, DocumentListResponseDto, DocumentSummaryDto, FinalizeUploadResponseDto } from "@/lib/documents/types";
import { consumeChatStream } from "@/lib/chat/sse";
import {
  createThread as createChatThread,
  deleteThread as deleteChatThread,
  getThreadMessages,
  listThreads,
  startChatStream,
} from "@/lib/chat/client";
import { mergeUiThreads, toUiCitation, toUiThread, toUiThreadWithMessages } from "@/lib/chat/normalize";
import type { ChatThread, Message } from "@/lib/chat/types";
import {
  createNote as createNoteApi,
  createTag as createTagApi,
  deleteNote as deleteNoteApi,
  deleteTag as deleteTagApi,
  listNotes,
  listTags,
  setDocumentTags,
  setNoteTags,
  updateNote as updateNoteApi,
} from "@/lib/notes/client";
import { applyDocumentTags, toUiNote, toUiTag } from "@/lib/notes/normalize";
import type { TagDto } from "@/lib/notes/types";
import type { CreateWorkspaceResponseDto, WorkspaceListResponseDto } from "@/lib/workspaces/types";

import { useTranslation } from "./i18n-context";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  role: string;
  systemPrompt: string;
  documentCount: number;
  noteCount: number;
  threadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentStatus = "pending_upload" | "uploaded" | "parsing" | "chunking" | "chunked" | "embedding" | "ready" | "failed" | "deleting" | "deleted";

export type Document = {
  id: string;
  workspaceId: string;
  name: string;
  size: string;
  pagesCount: number;
  status: DocumentStatus;
  progress: number;
  errorMsg?: string;
  tags: string[];
  createdAt: string;
};

export type { ChatThread, Citation, Message } from "@/lib/chat/types";

export type NoteSource = {
  messageCitationId?: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  snippet: string;
};

export type Note = {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  source?: NoteSource;
  tags: string[];
  createdAt: string;
};

export type Tag = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
};

type WorkspaceContextType = {
  isHydrating: boolean;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  documents: Document[];
  notes: Note[];
  threads: ChatThread[];
  activeThread: ChatThread | null;
  tags: Tag[];
  openDocumentIds: string[];
  activeDocumentId: string | null;
  activePdfPage: number;
  activeTab: "chat" | "notes" | "settings";
  leftSidebarOpen: boolean;
  rightPanelOpen: boolean;
  selectionText: string | null;
  selectedTagIds: string[];
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string, description: string | null) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  updateSystemPrompt: (id: string, prompt: string) => void;
  uploadDocument: (file: File) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  openDocument: (id: string) => void;
  closeDocument: (id: string) => void;
  createThread: () => Promise<void>;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  createNote: (title: string, content: string, source?: NoteSource) => Promise<void>;
  updateNote: (id: string, title: string, content: string) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  addTag: (name: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  toggleDocumentTag: (docId: string, tagName: string) => Promise<void>;
  toggleNoteTag: (noteId: string, tagName: string) => Promise<void>;
  setActiveDocumentId: (id: string | null) => void;
  setActivePdfPage: (page: number) => void;
  setActiveTab: (tab: "chat" | "notes" | "settings") => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  setSelectionText: (text: string | null) => void;
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const DB_WORKSPACE_PROMPTS_KEY = "db_workspace_prompts";
const DB_DOCUMENTS_KEY = "db_documents";

const areWorkspacePromptOverridesValid = (value: unknown): value is Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
};

const readJson = <T,>(key: string, fallback: T, validator: (value: unknown) => value is T): T => {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return validator(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const isDocumentViewable = (status: DocumentStatus) => status === "chunked" || status === "ready";
const getWorkspaceViewableDocs = (workspaceId: string, docs: Document[]) => docs.filter((d) => d.workspaceId === workspaceId && isDocumentViewable(d.status));

type WorkspaceErrorPayload = {
  detail?: string;
  error?: {
    message?: string;
  };
};

async function readResponseJsonSafely<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function getWorkspaceErrorMessage(
  payload: WorkspaceErrorPayload | undefined,
  fallback: string,
): string {
  return payload?.error?.message ?? payload?.detail ?? fallback;
}

function formatDocumentSize(byteSize: number): string {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
}

function normalizeDocumentStatus(status: string): DocumentStatus {
  if (["pending_upload", "uploaded", "parsing", "chunking", "chunked", "embedding", "ready", "failed", "deleting", "deleted"].includes(status)) {
    return status as DocumentStatus;
  }
  return "failed";
}

function getDocumentProgress(status: DocumentStatus): number {
  switch (status) {
    case "pending_upload":
      return 10;
    case "uploaded":
      return 25;
    case "parsing":
      return 50;
    case "chunking":
      return 75;
    case "chunked":
      return 100;
    case "embedding":
      return 90;
    case "ready":
      return 100;
    case "failed":
      return 100;
    case "deleting":
      return 100;
    case "deleted":
      return 100;
  }
}

function toUiDocument(document: DocumentSummaryDto): Document {
  const status = normalizeDocumentStatus(document.status);
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    name: document.sourceFilename,
    size: formatDocumentSize(document.byteSize),
    pagesCount: document.pageCount ?? 0,
    status,
    progress: getDocumentProgress(status),
    errorMsg: document.lastErrorMessage ?? undefined,
    tags: [],
    createdAt: document.createdAt,
  };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useTranslation();
  const { user, isHydrating: isAuthHydrating } = useAuth();

  const [isHydrating, setIsHydrating] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [workspacePromptOverrides, setWorkspacePromptOverrides] = useState<Record<string, string>>(() =>
    readJson(DB_WORKSPACE_PROMPTS_KEY, {}, areWorkspacePromptOverridesValid),
  );

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [openDocumentIds, setOpenDocumentIds] = useState<string[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activePdfPage, setActivePdfPage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"chat" | "notes" | "settings">("chat");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const currentWorkspaceIdRef = useRef(currentWorkspaceId);
  const activeThreadIdRef = useRef(activeThreadId);
  const documentsRef = useRef(documents);
  const threadsRef = useRef(threads);
  const tagsRef = useRef(tags);
  const tagRelationsRef = useRef<TagDto[]>([]);
  const workspacePromptOverridesRef = useRef(workspacePromptOverrides);

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspaceId;
  }, [currentWorkspaceId]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  useEffect(() => {
    workspacePromptOverridesRef.current = workspacePromptOverrides;
  }, [workspacePromptOverrides]);

  const syncDb = (key: string, data: unknown) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || null;
  const activeThread =
    threads.find((t) => t.id === activeThreadId && t.workspaceId === currentWorkspaceId) ||
    (activeThreadId === null ? threads.find((t) => t.workspaceId === currentWorkspaceId) || null : null);

  const syncWorkspaceViewState = useCallback((workspaceId: string, docs: Document[]) => {
    const wsDocs = getWorkspaceViewableDocs(workspaceId, docs);
    setOpenDocumentIds(wsDocs.length > 0 ? [wsDocs[0].id] : []);
    setActiveDocumentId(wsDocs[0]?.id ?? null);
    setActivePdfPage(1);
    activeThreadIdRef.current = null;
    setActiveThreadId(null);
    setSelectedTagIds([]);
    setSelectionText(null);
  }, []);

  const syncDocumentViewState = useCallback((workspaceId: string, docs: Document[]) => {
    const wsDocs = getWorkspaceViewableDocs(workspaceId, docs);
    setOpenDocumentIds(wsDocs.length > 0 ? [wsDocs[0].id] : []);
    setActiveDocumentId(wsDocs[0]?.id ?? null);
    setActivePdfPage(1);
  }, []);

  const replaceDocumentsForWorkspace = useCallback((workspaceId: string, workspaceDocuments: Document[], baseDocuments: Document[]) => {
    return [...baseDocuments.filter((document) => document.workspaceId !== workspaceId), ...workspaceDocuments];
  }, []);

  const fetchThreadWithMessages = useCallback(
    async (workspaceId: string, threadId: string): Promise<ChatThread> => {
      const payload = await getThreadMessages(workspaceId, threadId);
      return toUiThreadWithMessages(
        payload.thread,
        locale === "en" ? "New Chat" : "新会话",
        payload.messages,
      );
    },
    [locale],
  );

  const replaceThread = useCallback((thread: ChatThread) => {
    setThreads((prev) => mergeUiThreads(prev, [thread], thread.workspaceId));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateWorkspaces() {
      if (isAuthHydrating) {
        return;
      }

      if (!user) {
        if (!cancelled) {
          setWorkspaces([]);
          setCurrentWorkspaceId("");
          setOpenDocumentIds([]);
          setActiveDocumentId(null);
          setActiveThreadId(null);
          setSelectionText(null);
          setSelectedTagIds([]);
          setIsHydrating(false);
        }
        return;
      }

      setIsHydrating(true);
      try {
        const response = await fetch("/api/workspaces", { cache: "no-store" });
        const payload = await readResponseJsonSafely<WorkspaceListResponseDto & WorkspaceErrorPayload>(response);
        if (!response.ok) {
          throw new Error(
            getWorkspaceErrorMessage(
              payload,
              locale === "en" ? "Failed to load workspaces." : "加载工作区失败。",
            ),
          );
        }

        const items = (payload?.items ?? []).map((workspace) =>
          normalizeWorkspaceSummary(workspace, locale, workspacePromptOverridesRef.current[workspace.id]),
        );

        if (!cancelled) {
          setWorkspaces(items);
          const previousWorkspaceId = currentWorkspaceIdRef.current;
          const nextWorkspaceId = pickAccessibleWorkspaceId(items, previousWorkspaceId);
          setCurrentWorkspaceId(nextWorkspaceId);
          if (nextWorkspaceId && nextWorkspaceId !== previousWorkspaceId) {
            syncWorkspaceViewState(nextWorkspaceId, documentsRef.current);
          } else if (!nextWorkspaceId) {
            setOpenDocumentIds([]);
            setActiveDocumentId(null);
            setActiveThreadId(null);
            setSelectionText(null);
            setSelectedTagIds([]);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setWorkspaces([]);
          setCurrentWorkspaceId("");
          setOpenDocumentIds([]);
          setActiveDocumentId(null);
          setActiveThreadId(null);
          setSelectionText(null);
          setSelectedTagIds([]);
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    }

    void hydrateWorkspaces();

    return () => {
      cancelled = true;
    };
  }, [isAuthHydrating, locale, syncWorkspaceViewState, user]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDocuments() {
      if (isAuthHydrating || !user || !currentWorkspaceId) {
        return;
      }

      try {
        const response = await fetch(`/api/workspaces/${currentWorkspaceId}/documents`, { cache: "no-store" });
        const payload = await readResponseJsonSafely<DocumentListResponseDto & WorkspaceErrorPayload>(response);
        if (!response.ok) {
          throw new Error(
            getWorkspaceErrorMessage(
              payload,
              locale === "en" ? "Failed to load documents." : "加载文档列表失败。",
            ),
          );
        }

        const workspaceDocuments = applyDocumentTags(
          (payload?.items ?? []).map(toUiDocument),
          tagRelationsRef.current,
        );
        if (!cancelled) {
          const nextDocuments = replaceDocumentsForWorkspace(currentWorkspaceId, workspaceDocuments, documentsRef.current);
          setDocuments(nextDocuments);
          syncDb(DB_DOCUMENTS_KEY, nextDocuments);
          syncDocumentViewState(currentWorkspaceId, nextDocuments);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    }

    void hydrateDocuments();

    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId, isAuthHydrating, locale, replaceDocumentsForWorkspace, syncDocumentViewState, user]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateNotesAndTags() {
      if (isAuthHydrating || !user || !currentWorkspaceId) {
        return;
      }

      const workspaceId = currentWorkspaceId;
      try {
        const [notesPayload, tagsPayload] = await Promise.all([
          listNotes(workspaceId),
          listTags(workspaceId),
        ]);
        if (cancelled) {
          return;
        }

        const workspaceTags = tagsPayload.items.map(toUiTag);
        const tagsById = new Map(workspaceTags.map((tag) => [tag.id, tag]));
        const workspaceNotes = notesPayload.items.map((note) => toUiNote(note, tagsById));
        tagRelationsRef.current = [
          ...tagRelationsRef.current.filter((tag) => tag.workspaceId !== workspaceId),
          ...tagsPayload.items,
        ];
        setTags((previous) => [
          ...previous.filter((tag) => tag.workspaceId !== workspaceId),
          ...workspaceTags,
        ]);
        setNotes((previous) => [
          ...previous.filter((note) => note.workspaceId !== workspaceId),
          ...workspaceNotes,
        ]);
        setDocuments((previous) =>
          replaceDocumentsForWorkspace(
            workspaceId,
            applyDocumentTags(
              previous.filter((document) => document.workspaceId === workspaceId),
              tagsPayload.items,
            ),
            previous,
          ),
        );
        setWorkspaces((previous) => previous.map((workspace) =>
          workspace.id === workspaceId
            ? { ...workspace, noteCount: workspaceNotes.length }
            : workspace,
        ));
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    }

    void hydrateNotesAndTags();

    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId, isAuthHydrating, replaceDocumentsForWorkspace, user]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateThreads() {
      if (isAuthHydrating || !user || !currentWorkspaceId) {
        return;
      }

      const workspaceId = currentWorkspaceId;
      try {
        const payload = await listThreads(workspaceId);
        if (cancelled) {
          return;
        }

        const emptyTitle = locale === "en" ? "New Chat" : "新会话";
        const workspaceThreads = payload.items.map((thread) => toUiThread(thread, emptyTitle));
        setThreads((prev) => mergeUiThreads(prev, workspaceThreads, workspaceId));
        setWorkspaces((prev) => prev.map((workspace) =>
          workspace.id === workspaceId
            ? { ...workspace, threadCount: workspaceThreads.length }
            : workspace,
        ));

        const currentThreadId = activeThreadIdRef.current;
        const nextActiveThreadId = workspaceThreads.some((thread) => thread.id === currentThreadId)
          ? currentThreadId
          : workspaceThreads[0]?.id ?? null;
        activeThreadIdRef.current = nextActiveThreadId;
        setActiveThreadId(nextActiveThreadId);
        if (nextActiveThreadId) {
          void fetchThreadWithMessages(workspaceId, nextActiveThreadId)
            .then((hydratedThread) => {
              if (!cancelled) {
                replaceThread(hydratedThread);
              }
            })
            .catch((error) => {
              if (!cancelled) {
                console.error(error);
              }
            });
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setThreads((prev) => prev.filter((thread) => thread.workspaceId !== workspaceId));
          activeThreadIdRef.current = null;
          setActiveThreadId(null);
          setWorkspaces((prev) => prev.map((workspace) =>
            workspace.id === workspaceId
              ? { ...workspace, threadCount: 0 }
              : workspace,
          ));
        }
      }
    }

    void hydrateThreads();

    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId, fetchThreadWithMessages, isAuthHydrating, locale, replaceThread, user]);

  useEffect(() => {
    if (isAuthHydrating || !user || !currentWorkspaceId || !activeThreadId) {
      return;
    }

    let cancelled = false;
    const workspaceId = currentWorkspaceId;
    const threadId = activeThreadId;
    void fetchThreadWithMessages(workspaceId, threadId)
      .then((hydratedThread) => {
        if (!cancelled) {
          replaceThread(hydratedThread);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, currentWorkspaceId, fetchThreadWithMessages, isAuthHydrating, replaceThread, user]);

  useEffect(() => {
    if (isAuthHydrating || !user || !currentWorkspaceId) {
      return;
    }

    const hasProcessingDocument = documents.some(
      (document) => document.workspaceId === currentWorkspaceId && !["chunked", "ready", "failed", "deleted"].includes(document.status),
    );
    if (!hasProcessingDocument) {
      return;
    }

    const refreshDocuments = async () => {
      try {
        const response = await fetch(`/api/workspaces/${currentWorkspaceId}/documents`, { cache: "no-store" });
        const payload = await readResponseJsonSafely<DocumentListResponseDto>(response);
        if (!response.ok || !payload) {
          return;
        }
        const workspaceDocuments = applyDocumentTags(
          payload.items.map(toUiDocument),
              tagRelationsRef.current,
        );
        const nextDocuments = replaceDocumentsForWorkspace(currentWorkspaceId, workspaceDocuments, documentsRef.current);
        setDocuments(nextDocuments);
        syncDb(DB_DOCUMENTS_KEY, nextDocuments);
      } catch (error) {
        console.error(error);
      }
    };

    const timer = window.setInterval(() => {
      void refreshDocuments();
    }, 1_500);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentWorkspaceId, documents, isAuthHydrating, replaceDocumentsForWorkspace, user]);

  const switchWorkspace = useCallback((id: string) => {
    setCurrentWorkspaceId(id);
    syncWorkspaceViewState(id, documentsRef.current);
  }, [syncWorkspaceViewState]);

  const createWorkspace = useCallback(
    async (name: string, description: string | null) => {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      const payload = await readResponseJsonSafely<CreateWorkspaceResponseDto & WorkspaceErrorPayload>(response);
      if (!response.ok || !payload?.workspace) {
        throw new Error(
          getWorkspaceErrorMessage(
            payload,
            locale === "en" ? "Failed to create workspace." : "创建工作区失败。",
          ),
        );
      }

      const newWorkspace = normalizeWorkspaceSummary(
        payload.workspace,
        locale,
        workspacePromptOverrides[payload.workspace.id],
      );
      setWorkspaces((prev) => [...prev, newWorkspace]);
      setCurrentWorkspaceId(newWorkspace.id);
      syncWorkspaceViewState(newWorkspace.id, documentsRef.current);
    },
    [locale, syncWorkspaceViewState, workspacePromptOverrides],
  );

  const deleteWorkspace = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/workspaces/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await readResponseJsonSafely<WorkspaceErrorPayload>(response);
        throw new Error(
          getWorkspaceErrorMessage(
            payload,
            locale === "en" ? "Failed to delete workspace." : "删除工作区失败。",
          ),
        );
      }

      const nextWs = workspaces.filter((w) => w.id !== id);
      setWorkspaces(nextWs);

      const nextDocs = documents.filter((d) => d.workspaceId !== id);
      setDocuments(nextDocs);
      syncDb(DB_DOCUMENTS_KEY, nextDocs);

      const nextNotes = notes.filter((n) => n.workspaceId !== id);
      setNotes(nextNotes);

      const nextThreads = threads.filter((t) => t.workspaceId !== id);
      setThreads(nextThreads);

      const nextTags = tags.filter((t) => t.workspaceId !== id);
      setTags(nextTags);

      const nextPromptOverrides = { ...workspacePromptOverrides };
      delete nextPromptOverrides[id];
      setWorkspacePromptOverrides(nextPromptOverrides);
      syncDb(DB_WORKSPACE_PROMPTS_KEY, nextPromptOverrides);

      if (currentWorkspaceId === id) {
        const fallbackWorkspaceId = nextWs[0]?.id ?? "";
        setCurrentWorkspaceId(fallbackWorkspaceId);
        if (fallbackWorkspaceId) {
          syncWorkspaceViewState(fallbackWorkspaceId, nextDocs);
        } else {
          setOpenDocumentIds([]);
          setActiveDocumentId(null);
          setActiveThreadId(null);
          setSelectionText(null);
          setSelectedTagIds([]);
        }
      }
    },
    [currentWorkspaceId, documents, locale, notes, syncWorkspaceViewState, tags, threads, workspacePromptOverrides, workspaces],
  );

  const updateSystemPrompt = useCallback(
    (id: string, prompt: string) => {
      const nextList = workspaces.map((w) =>
        w.id === id ? { ...w, systemPrompt: prompt, updatedAt: new Date().toISOString() } : w,
      );
      setWorkspaces(nextList);
      const nextPromptOverrides = { ...workspacePromptOverrides, [id]: prompt };
      setWorkspacePromptOverrides(nextPromptOverrides);
      syncDb(DB_WORKSPACE_PROMPTS_KEY, nextPromptOverrides);
    },
    [workspacePromptOverrides, workspaces],
  );

  const openDocument = useCallback((id: string) => {
    setOpenDocumentIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveDocumentId(id);
    setActivePdfPage(1);
    setSelectionText(null);
  }, []);

  const closeDocument = useCallback(
    (id: string) => {
      setOpenDocumentIds((prev) => {
        const filtered = prev.filter((docId) => docId !== id);
        if (activeDocumentId === id) {
          setActiveDocumentId(filtered.length > 0 ? filtered[filtered.length - 1] : null);
          setActivePdfPage(1);
        }
        return filtered;
      });
      setSelectionText(null);
    },
    [activeDocumentId],
  );

  const uploadDocument = useCallback(
    async (file: File) => {
      if (!currentWorkspaceId) {
        return;
      }

      const uploadSessionResponse = await fetch(`/api/workspaces/${currentWorkspaceId}/documents/upload-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFilename: file.name,
          mimeType: file.type || "application/pdf",
          byteSize: file.size,
          title: file.name.replace(/\.pdf$/i, ""),
        }),
      });

      const uploadSessionPayload = await readResponseJsonSafely<CreateUploadSessionResponseDto & WorkspaceErrorPayload>(uploadSessionResponse);
      if (!uploadSessionResponse.ok || !uploadSessionPayload?.document || !uploadSessionPayload?.upload.url) {
        throw new Error(
          getWorkspaceErrorMessage(
            uploadSessionPayload,
            locale === "en" ? "Failed to create upload session." : "创建上传会话失败。",
          ),
        );
      }

      const pendingDocument = toUiDocument(uploadSessionPayload.document);
      setDocuments((prev) => {
        const nextDocuments = [pendingDocument, ...prev.filter((document) => document.id !== pendingDocument.id)];
        syncDb(DB_DOCUMENTS_KEY, nextDocuments);
        return nextDocuments;
      });
      setWorkspaces((prev) => prev.map((workspace) =>
        workspace.id === currentWorkspaceId
          ? { ...workspace, documentCount: workspace.documentCount + 1 }
          : workspace,
      ));

      const uploadResponse = await fetch(uploadSessionPayload.upload.url, {
        method: uploadSessionPayload.upload.method,
        headers: uploadSessionPayload.upload.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        const uploadPayload = await readResponseJsonSafely<WorkspaceErrorPayload>(uploadResponse);
        throw new Error(
          getWorkspaceErrorMessage(
            uploadPayload,
            locale === "en" ? "Failed to upload file." : "上传文件失败。",
          ),
        );
      }

      const finalizeResponse = await fetch(`/api/workspaces/${currentWorkspaceId}/documents/${pendingDocument.id}/finalize-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey: uploadSessionPayload.upload.objectKey }),
      });
      const finalizePayload = await readResponseJsonSafely<FinalizeUploadResponseDto & WorkspaceErrorPayload>(finalizeResponse);
      if (!finalizeResponse.ok || !finalizePayload?.document) {
        throw new Error(
          getWorkspaceErrorMessage(
            finalizePayload,
            locale === "en" ? "Failed to finalize upload." : "确认上传失败。",
          ),
        );
      }

      const uploadedDocument = toUiDocument(finalizePayload.document);
      setDocuments((prev) => {
        const nextDocuments = [uploadedDocument, ...prev.filter((document) => document.id !== uploadedDocument.id)];
        syncDb(DB_DOCUMENTS_KEY, nextDocuments);
        return nextDocuments;
      });
    },
    [currentWorkspaceId, locale],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      if (!currentWorkspaceId) {
        return;
      }

      const response = await fetch(`/api/workspaces/${currentWorkspaceId}/documents/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await readResponseJsonSafely<WorkspaceErrorPayload>(response);
        throw new Error(
          getWorkspaceErrorMessage(
            payload,
            locale === "en" ? "Failed to delete document." : "删除文档失败。",
          ),
        );
      }

      const nextDocs = documents.filter((d) => d.id !== id);
      setDocuments(nextDocs);
      syncDb(DB_DOCUMENTS_KEY, nextDocs);

      closeDocument(id);

      const nextWs = workspaces.map((w) =>
        w.id === currentWorkspaceId
          ? { ...w, documentCount: Math.max(0, w.documentCount - 1) }
          : w,
      );
      setWorkspaces(nextWs);
    },
    [closeDocument, currentWorkspaceId, documents, locale, workspaces],
  );

  const createThread = useCallback(
    async () => {
      if (!currentWorkspaceId) {
        return;
      }

      try {
        const payload = await createChatThread(currentWorkspaceId);
        const newThread = toUiThread(
          payload.thread,
          locale === "en" ? "New Chat" : "新会话",
        );
        setThreads((prev) => [
          newThread,
          ...prev.filter((thread) => thread.id !== newThread.id),
        ]);
        activeThreadIdRef.current = newThread.id;
        setActiveThreadId(newThread.id);
        setWorkspaces((prev) => prev.map((workspace) =>
          workspace.id === currentWorkspaceId
            ? { ...workspace, threadCount: workspace.threadCount + 1 }
            : workspace,
        ));
      } catch (error) {
        console.error(error);
      }
    },
    [currentWorkspaceId, locale],
  );

  const switchThread = useCallback((id: string) => {
    const thread = threadsRef.current.find(
      (item) => item.id === id && item.workspaceId === currentWorkspaceIdRef.current,
    );
    if (!thread) {
      return;
    }
    activeThreadIdRef.current = id;
    setActiveThreadId(id);
  }, []);

  const deleteThread = useCallback(
    async (id: string) => {
      const workspaceId = currentWorkspaceIdRef.current;
      const thread = threadsRef.current.find((item) => item.id === id && item.workspaceId === workspaceId);
      if (!workspaceId || !thread) {
        return;
      }

      try {
        await deleteChatThread(workspaceId, id);
      } catch (error) {
        console.error(error);
        return;
      }

      const nextThreads = threadsRef.current.filter((item) => item.id !== id);
      threadsRef.current = nextThreads;
      setThreads(nextThreads);

      if (activeThreadIdRef.current === id) {
        const remaining = nextThreads.filter((item) => item.workspaceId === workspaceId);
        const nextActiveThreadId = remaining[0]?.id ?? null;
        activeThreadIdRef.current = nextActiveThreadId;
        setActiveThreadId(nextActiveThreadId);
      }

      setWorkspaces((prev) => prev.map((workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, threadCount: Math.max(0, workspace.threadCount - 1) }
          : workspace,
      ));
    },
    [],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const question = content.trim();
      const workspaceId = currentWorkspaceId;
      const threadId = activeThreadId ?? threadsRef.current.find((thread) => thread.workspaceId === workspaceId)?.id ?? null;
      if (!workspaceId || !threadId || !question) {
        return;
      }

      const now = new Date().toISOString();
      const temporaryUserMessageId = `pending-user-${Date.now()}`;
      const temporaryAssistantMessageId = `pending-assistant-${Date.now()}`;
      const userMessage: Message = {
        id: temporaryUserMessageId,
        role: "user",
        content: question,
        createdAt: now,
      };
      const assistantMessage: Message = {
        id: temporaryAssistantMessageId,
        role: "assistant",
        content: "",
        citations: [],
        createdAt: now,
      };

      setThreads((prev) => prev.map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              title: thread.messages.length === 0 ? question.slice(0, 80) : thread.title,
              messages: [...thread.messages, userMessage, assistantMessage],
            }
          : thread,
      ));

      let userMessageId = temporaryUserMessageId;
      let assistantMessageId = temporaryAssistantMessageId;
      let streamCompleted = false;

      const updateThreadMessages = (update: (message: Message) => Message) => {
        setThreads((prev) => prev.map((thread) =>
          thread.id === threadId
            ? { ...thread, messages: thread.messages.map(update) }
            : thread,
        ));
      };

      const replaceMessageId = (from: string, to: string) => {
        updateThreadMessages((message) => message.id === from ? { ...message, id: to } : message);
      };

      try {
        const response = await startChatStream(workspaceId, {
          threadId,
          question,
          ...(selectionText?.trim() ? { selectionText: selectionText.trim() } : {}),
        });

        await consumeChatStream(response, {
          onMeta: (payload) => {
            userMessageId = payload.userMessageId;
            assistantMessageId = payload.assistantMessageId;
            replaceMessageId(temporaryUserMessageId, userMessageId);
            replaceMessageId(temporaryAssistantMessageId, assistantMessageId);
          },
          onDelta: (payload) => {
            updateThreadMessages((message) => message.id === assistantMessageId
              ? { ...message, content: `${message.content}${payload.text}` }
              : message,
            );
          },
          onCitations: (payload) => {
            const citations = payload.items.map(toUiCitation);
            updateThreadMessages((message) => message.id === assistantMessageId
              ? { ...message, citations }
              : message,
            );
          },
          onDone: (payload) => {
            streamCompleted = payload.threadId === threadId;
            assistantMessageId = payload.assistantMessageId;
            replaceMessageId(temporaryAssistantMessageId, assistantMessageId);
          },
        });

        if (!streamCompleted) {
          throw new Error("Chat stream ended before completion.");
        }

        const hydratedThread = await fetchThreadWithMessages(workspaceId, threadId);
        replaceThread(hydratedThread);
      } catch (error) {
        console.error(error);
        try {
          const hydratedThread = await fetchThreadWithMessages(workspaceId, threadId);
          replaceThread(hydratedThread);
        } catch {
          const message = error instanceof Error ? error.message : "Chat request failed.";
          setThreads((prev) => prev.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  messages: thread.messages
                    .filter((item) => ![temporaryUserMessageId, temporaryAssistantMessageId, userMessageId, assistantMessageId].includes(item.id))
                    .concat({
                      id: temporaryAssistantMessageId,
                      role: "assistant",
                      content: message,
                      citations: [],
                      createdAt: now,
                    }),
                }
              : thread,
          ));
        }
      }
    },
    [activeThreadId, currentWorkspaceId, fetchThreadWithMessages, replaceThread, selectionText],
  );

  const createNote = useCallback(
    async (title: string, content: string, source?: NoteSource) => {
      if (!currentWorkspaceId) {
        return;
      }

      const payload = await createNoteApi(currentWorkspaceId, {
        title: title.trim() || null,
        bodyMd: content,
        sourceCitationIds: source?.messageCitationId ? [source.messageCitationId] : [],
      });
      const tagsById = new Map(tagsRef.current.map((tag) => [tag.id, tag]));
      const newNote = toUiNote(payload.note, tagsById);
      setNotes((previous) => [newNote, ...previous.filter((note) => note.id !== newNote.id)]);
      setWorkspaces((previous) => previous.map((workspace) =>
        workspace.id === currentWorkspaceId
          ? { ...workspace, noteCount: workspace.noteCount + 1 }
          : workspace,
      ));
    },
    [currentWorkspaceId],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (!currentWorkspaceId || !notes.some((note) => note.id === id && note.workspaceId === currentWorkspaceId)) {
        return;
      }

      await deleteNoteApi(currentWorkspaceId, id);
      setNotes((previous) => previous.filter((note) => note.id !== id));
      setWorkspaces((previous) => previous.map((workspace) =>
        workspace.id === currentWorkspaceId
          ? { ...workspace, noteCount: Math.max(0, workspace.noteCount - 1) }
          : workspace,
      ));
    },
    [currentWorkspaceId, notes],
  );

  const updateNote = useCallback(
    async (id: string, title: string, content: string) => {
      if (!currentWorkspaceId || !notes.some((note) => note.id === id && note.workspaceId === currentWorkspaceId)) {
        return;
      }

      const payload = await updateNoteApi(currentWorkspaceId, id, {
        title: title.trim() || null,
        bodyMd: content,
      });
      const tagsById = new Map(tagsRef.current.map((tag) => [tag.id, tag]));
      const updatedNote = toUiNote(payload.note, tagsById);
      setNotes((previous) => previous.map((note) => note.id === id ? updatedNote : note));
    },
    [currentWorkspaceId, notes],
  );

  const addTag = useCallback(
    async (name: string) => {
      if (!currentWorkspaceId) {
        return;
      }
      const normalizedName = name.trim().toLowerCase();
      if (!normalizedName || tags.some((tag) => tag.workspaceId === currentWorkspaceId && tag.name.toLowerCase() === normalizedName)) {
        return;
      }

      const colors = ["#818cf8", "#22d3ee", "#34d399", "#fbbf24", "#f87171", "#c084fc", "#f472b6"];
      const payload = await createTagApi(currentWorkspaceId, {
        name: name.trim(),
        slug: normalizedName.replace(/\s+/g, "-"),
        color: colors[tags.length % colors.length],
      });
      const newTag = toUiTag(payload.tag);
      tagRelationsRef.current = [
        ...tagRelationsRef.current.filter((tag) => tag.id !== newTag.id),
        { ...payload.tag, documentIds: [], noteIds: [] },
      ];
      setTags((previous) => [...previous.filter((tag) => tag.id !== newTag.id), newTag]);
    },
    [currentWorkspaceId, tags],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      if (!currentWorkspaceId || !tags.some((tag) => tag.id === id && tag.workspaceId === currentWorkspaceId)) {
        return;
      }

      await deleteTagApi(currentWorkspaceId, id);
      const deletedTag = tags.find((tag) => tag.id === id);
      tagRelationsRef.current = tagRelationsRef.current.filter((tag) => tag.id !== id);
      setTags((previous) => previous.filter((tag) => tag.id !== id));
      setSelectedTagIds((previous) => previous.filter((tagId) => tagId !== id));
      if (deletedTag) {
        setDocuments((previous) => previous.map((document) => ({
          ...document,
          tags: document.workspaceId === currentWorkspaceId
            ? document.tags.filter((tagName) => tagName !== deletedTag.name)
            : document.tags,
        })));
        setNotes((previous) => previous.map((note) => ({
          ...note,
          tags: note.workspaceId === currentWorkspaceId
            ? note.tags.filter((tagName) => tagName !== deletedTag.name)
            : note.tags,
        })));
      }
    },
    [currentWorkspaceId, tags],
  );

  const toggleDocumentTag = useCallback(async (docId: string, tagName: string) => {
    const workspaceId = currentWorkspaceIdRef.current;
    const document = documentsRef.current.find((item) => item.id === docId && item.workspaceId === workspaceId);
    const tag = tagsRef.current.find((item) => item.workspaceId === workspaceId && item.name === tagName);
    if (!workspaceId || !document || !tag) {
      return;
    }

    const currentTagIds = tagsRef.current
      .filter((item) => item.workspaceId === workspaceId && document.tags.includes(item.name))
      .map((item) => item.id);
    const nextTagIds = currentTagIds.includes(tag.id)
      ? currentTagIds.filter((id) => id !== tag.id)
      : [...currentTagIds, tag.id];
    await setDocumentTags(workspaceId, docId, nextTagIds);
    tagRelationsRef.current = tagRelationsRef.current.map((relation) => ({
      ...relation,
      documentIds:
        relation.workspaceId !== workspaceId
          ? relation.documentIds
          : nextTagIds.includes(relation.id)
            ? [...new Set([...(relation.documentIds ?? []).filter((id) => id !== docId), docId])]
            : (relation.documentIds ?? []).filter((id) => id !== docId),
    }));
    setDocuments((previous) => previous.map((item) =>
      item.id === docId
        ? { ...item, tags: nextTagIds.map((id) => tagsRef.current.find((candidate) => candidate.id === id)?.name).filter((name): name is string => Boolean(name)) }
        : item,
    ));
  }, []);

  const toggleNoteTag = useCallback(async (noteId: string, tagName: string) => {
    const workspaceId = currentWorkspaceIdRef.current;
    const note = notes.find((item) => item.id === noteId && item.workspaceId === workspaceId);
    const tag = tagsRef.current.find((item) => item.workspaceId === workspaceId && item.name === tagName);
    if (!workspaceId || !note || !tag) {
      return;
    }

    const currentTagIds = tagsRef.current
      .filter((item) => item.workspaceId === workspaceId && note.tags.includes(item.name))
      .map((item) => item.id);
    const nextTagIds = currentTagIds.includes(tag.id)
      ? currentTagIds.filter((id) => id !== tag.id)
      : [...currentTagIds, tag.id];
    await setNoteTags(workspaceId, noteId, nextTagIds);
    tagRelationsRef.current = tagRelationsRef.current.map((relation) => ({
      ...relation,
      noteIds:
        relation.workspaceId !== workspaceId
          ? relation.noteIds
          : nextTagIds.includes(relation.id)
            ? [...new Set([...(relation.noteIds ?? []).filter((id) => id !== noteId), noteId])]
            : (relation.noteIds ?? []).filter((id) => id !== noteId),
    }));
    setNotes((previous) => previous.map((item) =>
      item.id === noteId
        ? { ...item, tags: nextTagIds.map((id) => tagsRef.current.find((candidate) => candidate.id === id)?.name).filter((name): name is string => Boolean(name)) }
        : item,
    ));
  }, [notes]);

  return (
    <WorkspaceContext.Provider
      value={{
        isHydrating,
        workspaces,
        currentWorkspace,
        documents,
        notes,
        threads,
        activeThread,
        tags,
        openDocumentIds,
        activeDocumentId,
        activePdfPage,
        activeTab,
        leftSidebarOpen,
        rightPanelOpen,
        selectionText,
        selectedTagIds,
        switchWorkspace,
        createWorkspace,
        deleteWorkspace,
        updateSystemPrompt,
        uploadDocument,
        deleteDocument,
        openDocument,
        closeDocument,
        createThread,
        switchThread,
        deleteThread,
        sendMessage,
        createNote,
        updateNote,
        deleteNote,
        addTag,
        deleteTag,
        toggleDocumentTag,
        toggleNoteTag,
        setActiveDocumentId,
        setActivePdfPage,
        setActiveTab,
        setLeftSidebarOpen,
        setRightPanelOpen,
        setSelectionText,
        setSelectedTagIds,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
