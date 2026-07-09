"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import { normalizeWorkspaceSummary, pickAccessibleWorkspaceId } from "@/lib/workspaces/normalize";
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

export type DocumentStatus = "uploaded" | "parsing" | "chunking" | "embedding" | "ready" | "failed";

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

export type Citation = {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  snippet: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
};

export type ChatThread = {
  id: string;
  workspaceId: string;
  title: string;
  messages: Message[];
  createdAt: string;
};

export type NoteSource = {
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
  uploadDocument: (name: string, size: number) => void;
  deleteDocument: (id: string) => void;
  openDocument: (id: string) => void;
  closeDocument: (id: string) => void;
  createThread: () => void;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  createNote: (title: string, content: string, source?: NoteSource) => void;
  deleteNote: (id: string) => void;
  addTag: (name: string) => void;
  toggleDocumentTag: (docId: string, tagName: string) => void;
  toggleNoteTag: (noteId: string, tagName: string) => void;
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
const DB_NOTES_KEY = "db_notes";
const DB_THREADS_KEY = "db_threads";
const DB_TAGS_KEY = "db_tags";

const SEED_DOCUMENTS: Document[] = [
  {
    id: "doc-attention",
    workspaceId: "ws-llm",
    name: "Attention Is All You Need.pdf",
    size: "2.1 MB",
    pagesCount: 15,
    status: "ready",
    progress: 100,
    tags: ["Transformer", "NLP"],
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: "doc-rag",
    workspaceId: "ws-llm",
    name: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.pdf",
    size: "1.4 MB",
    pagesCount: 8,
    status: "ready",
    progress: 100,
    tags: ["RAG", "NLP"],
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: "doc-nda",
    workspaceId: "ws-contract",
    name: "NDA_Bilateral_Standard_2026.pdf",
    size: "450 KB",
    pagesCount: 4,
    status: "ready",
    progress: 100,
    tags: ["NDA", "Legal"],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

const SEED_NOTES: Note[] = [
  {
    id: "note-1",
    workspaceId: "ws-llm",
    title: "自注意力缩放机制目的",
    content:
      "Transformer中的Scaled Dot-Product计算中，之所以除以根号dk，是因为在输入维度较高时，点积结果容易非常大，送入softmax会导致梯度饱和并产生消失。这是保障深度学习训练稳定的一个关键小设计。",
    source: {
      documentId: "doc-attention",
      documentName: "Attention Is All You Need.pdf",
      pageNumber: 3,
      snippet: "softmax(QK^T / sqrt(d_k))V",
    },
    tags: ["Transformer"],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "note-2",
    workspaceId: "ws-llm",
    title: "RAG与Fine-Tune对比",
    content:
      "RAG通过外部密集向量数据库（pgvector）拉取最新的真实片段补充大模型输入，无需消耗高昂算力二次预训练，并自带卷记来源跳页机制，特别适合知识高频更迭的业务。",
    source: {
      documentId: "doc-rag",
      documentName: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.pdf",
      pageNumber: 1,
      snippet: "RAG combines pre-trained seq2seq models with dense passage indexes...",
    },
    tags: ["RAG"],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

const SEED_TAGS: Tag[] = [
  { id: "tag-trans", workspaceId: "ws-llm", name: "Transformer", color: "#818cf8" },
  { id: "tag-rag", workspaceId: "ws-llm", name: "RAG", color: "#22d3ee" },
  { id: "tag-nlp", workspaceId: "ws-llm", name: "NLP", color: "#34d399" },
  { id: "tag-nda", workspaceId: "ws-contract", name: "NDA", color: "#fbbf24" },
  { id: "tag-legal", workspaceId: "ws-contract", name: "Legal", color: "#f87171" },
];

const SEED_THREADS: ChatThread[] = [
  {
    id: "thread-1",
    workspaceId: "ws-llm",
    title: "Transformer 自注意力解析",
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "多头注意力有什么额外的好处？",
        createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
      {
        id: "msg-2",
        role: "assistant",
        content:
          "多头注意力机制（Multi-Head Attention）相当于给模型装备了多个不同的“观测视角”汪！\n\n1. **多子空间表征**：它将 Query, Key, Value 投影到 h 个不同的维度子空间并行计算注意力，这允许模型同时在不同位置学习语法、指代等丰富语义，而不是被单一全局视角所限制。\n2. **计算高效性**：它完美契合 GPU 等硬件的并行矩阵流水线，比传统递归网络的链式逐字计算快上数十倍哒！",
        citations: [
          {
            id: "cit-1",
            documentId: "doc-attention",
            documentName: "Attention Is All You Need.pdf",
            pageNumber: 5,
            snippet:
              "Multi-head attention allows the model to jointly attend to information from different representation subspaces.",
          },
        ],
        createdAt: new Date(Date.now() - 86400000 * 4 + 1000).toISOString(),
      },
    ],
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
];

const areDocumentsValid = (arr: unknown): arr is Document[] => {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (d) =>
      d &&
      typeof d === "object" &&
      typeof (d as Document).id === "string" &&
      typeof (d as Document).workspaceId === "string" &&
      typeof (d as Document).name === "string" &&
      typeof (d as Document).pagesCount === "number",
  );
};

const areNotesValid = (arr: unknown): arr is Note[] => {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (n) =>
      n &&
      typeof n === "object" &&
      typeof (n as Note).id === "string" &&
      typeof (n as Note).workspaceId === "string" &&
      typeof (n as Note).title === "string" &&
      typeof (n as Note).content === "string",
  );
};

const areThreadsValid = (arr: unknown): arr is ChatThread[] => {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (t) =>
      t &&
      typeof t === "object" &&
      typeof (t as ChatThread).id === "string" &&
      typeof (t as ChatThread).workspaceId === "string" &&
      typeof (t as ChatThread).title === "string" &&
      Array.isArray((t as ChatThread).messages),
  );
};

const areTagsValid = (arr: unknown): arr is Tag[] => {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (t) =>
      t &&
      typeof t === "object" &&
      typeof (t as Tag).id === "string" &&
      typeof (t as Tag).workspaceId === "string" &&
      typeof (t as Tag).name === "string",
  );
};

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

const getWorkspaceReadyDocs = (workspaceId: string, docs: Document[]) => docs.filter((d) => d.workspaceId === workspaceId && d.status === "ready");
const getWorkspaceThreads = (workspaceId: string, items: ChatThread[]) => items.filter((t) => t.workspaceId === workspaceId);

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

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useTranslation();
  const { user, isHydrating: isAuthHydrating } = useAuth();

  const [isHydrating, setIsHydrating] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [documents, setDocuments] = useState<Document[]>(() => readJson(DB_DOCUMENTS_KEY, SEED_DOCUMENTS, areDocumentsValid));
  const [notes, setNotes] = useState<Note[]>(() => readJson(DB_NOTES_KEY, SEED_NOTES, areNotesValid));
  const [threads, setThreads] = useState<ChatThread[]>(() => readJson(DB_THREADS_KEY, SEED_THREADS, areThreadsValid));
  const [tags, setTags] = useState<Tag[]>(() => readJson(DB_TAGS_KEY, SEED_TAGS, areTagsValid));
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
  const documentsRef = useRef(documents);
  const threadsRef = useRef(threads);
  const workspacePromptOverridesRef = useRef(workspacePromptOverrides);

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspaceId;
  }, [currentWorkspaceId]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    workspacePromptOverridesRef.current = workspacePromptOverrides;
  }, [workspacePromptOverrides]);

  const syncDb = (key: string, data: unknown) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || null;
  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  const syncWorkspaceViewState = (workspaceId: string, docs: Document[], threadItems: ChatThread[]) => {
    const wsDocs = getWorkspaceReadyDocs(workspaceId, docs);
    setOpenDocumentIds(wsDocs.length > 0 ? [wsDocs[0].id] : []);
    setActiveDocumentId(wsDocs[0]?.id ?? null);
    setActivePdfPage(1);
    const wsThreads = getWorkspaceThreads(workspaceId, threadItems);
    setActiveThreadId(wsThreads[0]?.id ?? null);
    setSelectedTagIds([]);
    setSelectionText(null);
  };

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
          const nextWorkspaceId = pickAccessibleWorkspaceId(items, currentWorkspaceIdRef.current);
          setCurrentWorkspaceId(nextWorkspaceId);
          if (nextWorkspaceId) {
            syncWorkspaceViewState(nextWorkspaceId, documentsRef.current, threadsRef.current);
          } else {
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
  }, [isAuthHydrating, locale, user]);

  const switchWorkspace = useCallback((id: string) => {
    setCurrentWorkspaceId(id);
    syncWorkspaceViewState(id, documents, threads);
  }, [documents, threads]);

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
      syncWorkspaceViewState(newWorkspace.id, documents, threads);
    },
    [documents, locale, threads, workspacePromptOverrides],
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
      syncDb(DB_NOTES_KEY, nextNotes);

      const nextThreads = threads.filter((t) => t.workspaceId !== id);
      setThreads(nextThreads);
      syncDb(DB_THREADS_KEY, nextThreads);

      const nextTags = tags.filter((t) => t.workspaceId !== id);
      setTags(nextTags);
      syncDb(DB_TAGS_KEY, nextTags);

      const nextPromptOverrides = { ...workspacePromptOverrides };
      delete nextPromptOverrides[id];
      setWorkspacePromptOverrides(nextPromptOverrides);
      syncDb(DB_WORKSPACE_PROMPTS_KEY, nextPromptOverrides);

      if (currentWorkspaceId === id) {
        const fallbackWorkspaceId = nextWs[0]?.id ?? "";
        setCurrentWorkspaceId(fallbackWorkspaceId);
        if (fallbackWorkspaceId) {
          syncWorkspaceViewState(fallbackWorkspaceId, nextDocs, nextThreads);
        } else {
          setOpenDocumentIds([]);
          setActiveDocumentId(null);
          setActiveThreadId(null);
          setSelectionText(null);
          setSelectedTagIds([]);
        }
      }
    },
    [currentWorkspaceId, documents, locale, notes, tags, threads, workspacePromptOverrides, workspaces],
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
    (name: string, sizeBytes: number) => {
      const sizeStr =
        sizeBytes > 1024 * 1024
          ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
          : `${(sizeBytes / 1024).toFixed(0)} KB`;

      const docId = `doc-${Date.now()}`;
      const newDoc: Document = {
        id: docId,
        workspaceId: currentWorkspaceId,
        name,
        size: sizeStr,
        pagesCount: Math.floor(Math.random() * 12) + 3,
        status: "uploaded",
        progress: 0,
        tags: [],
        createdAt: new Date().toISOString(),
      };

      const nextDocs = [newDoc, ...documents];
      setDocuments(nextDocs);
      syncDb(DB_DOCUMENTS_KEY, nextDocs);

      openDocument(docId);

      const nextWs = workspaces.map((w) =>
        w.id === currentWorkspaceId ? { ...w, documentCount: w.documentCount + 1 } : w,
      );
      setWorkspaces(nextWs);

      let currentStep: DocumentStatus = "uploaded";
      let progressVal = 0;

      const interval = setInterval(() => {
        progressVal += 15;
        if (progressVal >= 100) {
          progressVal = 0;
          if (currentStep === "uploaded") {
            currentStep = "parsing";
          } else if (currentStep === "parsing") {
            currentStep = "chunking";
          } else if (currentStep === "chunking") {
            currentStep = "embedding";
          } else if (currentStep === "embedding") {
            currentStep = "ready";
            clearInterval(interval);
          }
        }

        setDocuments((prev) => {
          const list = prev.map((d) =>
            d.id === docId
              ? {
                  ...d,
                  status: currentStep,
                  progress: currentStep === "ready" ? 100 : progressVal,
                }
              : d,
          );
          syncDb(DB_DOCUMENTS_KEY, list);
          return list;
        });
      }, 250);
    },
    [currentWorkspaceId, documents, openDocument, workspaces],
  );

  const deleteDocument = useCallback(
    (id: string) => {
      const nextDocs = documents.filter((d) => d.id !== id);
      setDocuments(nextDocs);
      syncDb(DB_DOCUMENTS_KEY, nextDocs);

      const nextNotes = notes.filter((n) => n.source?.documentId !== id);
      setNotes(nextNotes);
      syncDb(DB_NOTES_KEY, nextNotes);

      closeDocument(id);

      const nextWs = workspaces.map((w) =>
        w.id === currentWorkspaceId
          ? { ...w, documentCount: Math.max(0, w.documentCount - 1) }
          : w,
      );
      setWorkspaces(nextWs);
    },
    [closeDocument, currentWorkspaceId, documents, notes, workspaces],
  );

  const createThread = useCallback(
    () => {
      const threadId = `thread-${Date.now()}`;
      const newThread: ChatThread = {
        id: threadId,
        workspaceId: currentWorkspaceId,
        title: locale === "en" ? "New Chat" : "新会话",
        messages: [],
        createdAt: new Date().toISOString(),
      };

      const nextList = [newThread, ...threads];
      setThreads(nextList);
      syncDb(DB_THREADS_KEY, nextList);
      setActiveThreadId(threadId);

      const nextWs = workspaces.map((w) =>
        w.id === currentWorkspaceId ? { ...w, threadCount: w.threadCount + 1 } : w,
      );
      setWorkspaces(nextWs);
    },
    [currentWorkspaceId, locale, threads, workspaces],
  );

  const switchThread = useCallback((id: string) => {
    setActiveThreadId(id);
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      const nextThreads = threads.filter((t) => t.id !== id);
      setThreads(nextThreads);
      syncDb(DB_THREADS_KEY, nextThreads);

      if (activeThreadId === id) {
        const remaining = nextThreads.filter((t) => t.workspaceId === currentWorkspaceId);
        setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
      }

      const nextWs = workspaces.map((w) =>
        w.id === currentWorkspaceId ? { ...w, threadCount: Math.max(0, w.threadCount - 1) } : w,
      );
      setWorkspaces(nextWs);
    },
    [activeThreadId, currentWorkspaceId, threads, workspaces],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeThreadId) return;

      const userMessage: Message = {
        id: `msg-user-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };

      let updatedThreads = threads.map((t) =>
        t.id === activeThreadId
          ? {
              ...t,
              title: t.messages.length === 0 ? content.slice(0, 16) : t.title,
              messages: [...t.messages, userMessage],
            }
          : t,
      );
      setThreads(updatedThreads);
      syncDb(DB_THREADS_KEY, updatedThreads);

      const assistantMsgId = `msg-ai-${Date.now()}`;
      const assistantMessagePlaceholder: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };

      updatedThreads = updatedThreads.map((t) =>
        t.id === activeThreadId
          ? { ...t, messages: [...t.messages, assistantMessagePlaceholder] }
          : t,
      );
      setThreads(updatedThreads);

      const wsDocs = documents.filter(
        (d) => d.workspaceId === currentWorkspaceId && d.status === "ready",
      );
      const targetDoc = activeDocumentId
        ? wsDocs.find((d) => d.id === activeDocumentId) || null
        : wsDocs[0] ?? null;

      let replyText = "";
      let citationsArr: Citation[] = [];
      const isEn = locale === "en";
      const selectedQueryNotice =
        content.includes("这段文字") && selectionText
          ? isEn
            ? `\n\n(Regarding selection: "${selectionText}")`
            : `\n\n关于选中的文字（"${selectionText}"）`
          : "";

      if (!targetDoc) {
        replyText = isEn
          ? "Hello! There are no ready PDF documents in this workspace yet. Please upload a PDF file first."
          : "当前工作区里还没有可以检索的 PDF 文档。请先上传 PDF 文件。";
      } else {
        const nameLower = (targetDoc.name ?? "").toLowerCase();
        if (nameLower.includes("attention")) {
          replyText = isEn
            ? `Based on 'Attention Is All You Need.pdf', here are the key findings:${selectedQueryNotice}\n\n1. **Self-Attention Mechanism**: Replaces recurrence and convolutions with a single matrix product.\n2. **Multi-Head Projection**: Projects Q/K/V into multiple representation subspaces.`
            : `针对《Attention Is All You Need.pdf》，检索到以下要点：${selectedQueryNotice}\n\n1. **自注意力机制**：用并行矩阵运算替代时序递归。\n2. **多头投影**：把 Q/K/V 投影到多个表示子空间。`;
          citationsArr = [
            {
              id: `cit-${Date.now()}-1`,
              documentId: targetDoc.id,
              documentName: targetDoc.name,
              pageNumber: 3,
              snippet: "The Scaled Dot-Product Attention: softmax(QK^T / sqrt(d_k))V.",
            },
            {
              id: `cit-${Date.now()}-2`,
              documentId: targetDoc.id,
              documentName: targetDoc.name,
              pageNumber: 5,
              snippet:
                "Multi-head attention projects Queries, Keys and Values h times.",
            },
          ];
        } else if (nameLower.includes("rag")) {
          replyText = isEn
            ? `According to 'Retrieval-Augmented Generation...', here is the summary:${selectedQueryNotice}\n\n1. **Hybrid Architecture**: Integrates pre-trained generators with dense retrieval.\n2. **Citation Auditing**: Clicking citations jumps back to source pages.`
            : `结合《Retrieval-Augmented Generation...》检索结果，总结如下：${selectedQueryNotice}\n\n1. **混合架构**：结合预训练生成模型和密集检索。\n2. **引用回跳**：点击引用可回到原始页码。`;
          citationsArr = [
            {
              id: `cit-${Date.now()}-3`,
              documentId: targetDoc.id,
              documentName: targetDoc.name,
              pageNumber: 1,
              snippet:
                "RAG models combine parametric seq2seq models with non-parametric dense index database.",
            },
          ];
        } else if (nameLower.includes("nda")) {
          replyText = isEn
            ? `Based on 'NDA_Bilateral_Standard_2026.pdf', here is the legal risk evaluation:${selectedQueryNotice}\n\n1. **Obligation Survival Term**: The 3-year confidentiality term may be too short.\n2. **Equitable Remedies**: Injunctive relief is allowed.`
            : `根据《NDA_Bilateral_Standard_2026.pdf》的合同风险审查：${selectedQueryNotice}\n\n1. **保密期限**：3 年可能过短。\n2. **救济方式**：支持申请禁止令。`;
          citationsArr = [
            {
              id: `cit-${Date.now()}-4`,
              documentId: targetDoc.id,
              documentName: targetDoc.name,
              pageNumber: 3,
              snippet:
                "Obligations shall survive for three (3) years from the date of termination.",
            },
            {
              id: `cit-${Date.now()}-5`,
              documentId: targetDoc.id,
              documentName: targetDoc.name,
              pageNumber: 4,
              snippet:
                "Disclosing party is entitled to seek injunctive relief to prevent breaches.",
            },
          ];
        } else {
          replyText = isEn
            ? `Retrieved key findings from ${targetDoc.name}:${selectedQueryNotice}\n\n1. **Analysis**: The document outlines a custom framework.\n2. **Recommendation**: Select text for more targeted questions.`
            : `根据《${targetDoc.name}》检索到以下要点：${selectedQueryNotice}\n\n1. **分析**：文档描述了一套自定义框架。\n2. **建议**：可以划词继续追问。`;
          citationsArr = [
            {
              id: `cit-${Date.now()}-6`,
              documentId: targetDoc.id,
              documentName: targetDoc.name,
              pageNumber: 1,
              snippet:
                "We propose a novel framework that improves performance by utilizing RAG retrieval pipelines.",
            },
          ];
        }
      }

      let idx = 0;
      const streamInterval = setInterval(() => {
        idx += 8;
        const part = replyText.slice(0, idx);

        setThreads((prev) => {
          const list = prev.map((t) =>
            t.id === activeThreadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: part,
                          citations: idx >= replyText.length ? citationsArr : undefined,
                        }
                      : m,
                  ),
                }
              : t,
          );
          if (idx >= replyText.length) {
            syncDb(DB_THREADS_KEY, list);
          }
          return list;
        });

        if (idx >= replyText.length) {
          clearInterval(streamInterval);
        }
      }, 30);
    },
    [
      activeDocumentId,
      activeThreadId,
      currentWorkspaceId,
      documents,
      locale,
      selectionText,
      threads,
    ],
  );

  const createNote = useCallback(
    (title: string, content: string, source?: NoteSource) => {
      const newNote: Note = {
        id: `note-${Date.now()}`,
        workspaceId: currentWorkspaceId,
        title,
        content,
        source,
        tags: [],
        createdAt: new Date().toISOString(),
      };

      const nextList = [newNote, ...notes];
      setNotes(nextList);
      syncDb(DB_NOTES_KEY, nextList);

      const nextWs = workspaces.map((w) =>
        w.id === currentWorkspaceId ? { ...w, noteCount: w.noteCount + 1 } : w,
      );
      setWorkspaces(nextWs);
    },
    [currentWorkspaceId, notes, workspaces],
  );

  const deleteNote = useCallback(
    (id: string) => {
      const nextList = notes.filter((n) => n.id !== id);
      setNotes(nextList);
      syncDb(DB_NOTES_KEY, nextList);

      const nextWs = workspaces.map((w) =>
        w.id === currentWorkspaceId ? { ...w, noteCount: Math.max(0, w.noteCount - 1) } : w,
      );
      setWorkspaces(nextWs);
    },
    [currentWorkspaceId, notes, workspaces],
  );

  const addTag = useCallback(
    (name: string) => {
      const normalizedName = name.trim().toLowerCase();
      if (!normalizedName) {
        return;
      }

      if (
        tags.some(
          (t) =>
            t.workspaceId === currentWorkspaceId &&
            (t.name ?? "").toLowerCase() === normalizedName,
        )
      ) {
        return;
      }

      const colors = [
        "#818cf8",
        "#22d3ee",
        "#34d399",
        "#fbbf24",
        "#f87171",
        "#c084fc",
        "#f472b6",
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const newTag: Tag = {
        id: `tag-${Date.now()}`,
        workspaceId: currentWorkspaceId,
        name,
        color: randomColor,
      };

      const nextList = [...tags, newTag];
      setTags(nextList);
      syncDb(DB_TAGS_KEY, nextList);
    },
    [currentWorkspaceId, tags],
  );

  const toggleDocumentTag = useCallback((docId: string, tagName: string) => {
    setDocuments((prev) => {
      const list = prev.map((d) => {
        if (d.id !== docId) return d;
        const exists = d.tags.includes(tagName);
        return {
          ...d,
          tags: exists ? d.tags.filter((t) => t !== tagName) : [...d.tags, tagName],
        };
      });
      syncDb(DB_DOCUMENTS_KEY, list);
      return list;
    });
  }, []);

  const toggleNoteTag = useCallback((noteId: string, tagName: string) => {
    setNotes((prev) => {
      const list = prev.map((n) => {
        if (n.id !== noteId) return n;
        const exists = n.tags.includes(tagName);
        return {
          ...n,
          tags: exists ? n.tags.filter((t) => t !== tagName) : [...n.tags, tagName],
        };
      });
      syncDb(DB_NOTES_KEY, list);
      return list;
    });
  }, []);

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
        deleteNote,
        addTag,
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
