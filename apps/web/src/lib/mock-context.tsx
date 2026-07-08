"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useTranslation } from "./i18n-context";

export type User = {
  name: string;
  email: string;
  avatarUrl: string;
};

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
  user: User | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  documents: Document[];
  notes: Note[];
  threads: ChatThread[];
  activeThread: ChatThread | null;
  tags: Tag[];
  
  // Layout parameters
  openDocumentIds: string[];
  activeDocumentId: string | null;
  activePdfPage: number;
  activeTab: "chat" | "notes" | "settings";
  leftSidebarOpen: boolean;
  rightPanelOpen: boolean;
  selectionText: string | null;
  selectedTagIds: string[];

  // Actions
  login: (email: string, name: string) => Promise<void>;
  logout: () => void;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string, description: string | null) => void;
  deleteWorkspace: (id: string) => void;
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

const SEED_WORKSPACES: Workspace[] = [
  {
    id: "ws-llm",
    name: "大模型架构与优化",
    description: "自研大模型前沿学术论文、网络切片与自注意力机制设计规范。",
    role: "Admin",
    systemPrompt: "你是一个顶尖的人工智能大模型研究专家。请用专业、极简的口吻回答主人的学术问题。必须结合背景文档给出引用来源和对应的页码汪！",
    documentCount: 2,
    noteCount: 2,
    threadCount: 1,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ws-contract",
    name: "法律合同风控中心",
    description: "日常业务保密协议NDA、采购合同合规审核与惩罚性条款预警。",
    role: "Legal Partner",
    systemPrompt: "你是一个资深商业律师。在帮助主人审查合同时，需以极严谨的口吻指出潜在的合规漏洞与责权风险，并尽量标明合同第几页的条款汪！",
    documentCount: 1,
    noteCount: 1,
    threadCount: 1,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

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
  }
];

const SEED_NOTES: Note[] = [
  {
    id: "note-1",
    workspaceId: "ws-llm",
    title: "自注意力缩放机制目的",
    content: "Transformer中的Scaled Dot-Product计算中，之所以除以根号dk，是因为在输入维度较高时，点积结果容易非常大，送入softmax会导致梯度饱和并产生消失。这是保障深度学习训练稳定的一个关键小设计。",
    source: {
      documentId: "doc-attention",
      documentName: "Attention Is All You Need.pdf",
      pageNumber: 3,
      snippet: "softmax(QK^T / sqrt(d_k))V"
    },
    tags: ["Transformer"],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "note-2",
    workspaceId: "ws-llm",
    title: "RAG与Fine-Tune对比",
    content: "RAG通过外部密集向量数据库（pgvector）拉取最新的真实片段补充大模型输入，无需消耗高昂算力二次预训练，并自带卷记来源跳页机制，特别适合知识高频更迭的业务。",
    source: {
      documentId: "doc-rag",
      documentName: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.pdf",
      pageNumber: 1,
      snippet: "RAG combines pre-trained seq2seq models with dense passage indexes..."
    },
    tags: ["RAG"],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  }
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
        content: "多头注意力机制（Multi-Head Attention）相当于给模型装备了多个不同的“观测视角”汪！\n\n1. **多子空间表征**：它将 Query, Key, Value 投影到 h 个不同的维度子空间并行计算注意力，这允许模型同时在不同位置学习语法、指代等丰富语义，而不是被单一全局视角所限制。\n2. **计算高效性**：它完美契合 GPU 等硬件的并行矩阵流水线，比传统递归网络的链式逐字计算快上数十倍哒！",
        citations: [
          {
            id: "cit-1",
            documentId: "doc-attention",
            documentName: "Attention Is All You Need.pdf",
            pageNumber: 5,
            snippet: "Multi-head attention allows the model to jointly attend to information from different representation subspaces."
          }
        ],
        createdAt: new Date(Date.now() - 86400000 * 4 + 1000).toISOString(),
      }
    ],
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
  }
];

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useTranslation();
  
  const [user, setUser] = useState<User | null>(null);
  
  // Local storage state initialization
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>("ws-llm");
  const [activeThreadId, setActiveThreadId] = useState<string | null>("thread-1");
  const [openDocumentIds, setOpenDocumentIds] = useState<string[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activePdfPage, setActivePdfPage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"chat" | "notes" | "settings">("chat");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // 1. Initial Load from LocalStorage or seed defaults
  useEffect(() => {
    // Auth Session
    const savedUser = localStorage.getItem("ai_pdf_workspace_user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem("ai_pdf_workspace_user");
      }
    }

    // Workspaces database
    const localWs = localStorage.getItem("db_workspaces");
    if (localWs) {
      try {
        setWorkspaces(JSON.parse(localWs));
      } catch (e) {
        setWorkspaces(SEED_WORKSPACES);
      }
    } else {
      setWorkspaces(SEED_WORKSPACES);
      localStorage.setItem("db_workspaces", JSON.stringify(SEED_WORKSPACES));
    }

    // Documents database
    const localDocs = localStorage.getItem("db_documents");
    if (localDocs) {
      try {
        setDocuments(JSON.parse(localDocs));
      } catch (e) {
        setDocuments(SEED_DOCUMENTS);
      }
    } else {
      setDocuments(SEED_DOCUMENTS);
      localStorage.setItem("db_documents", JSON.stringify(SEED_DOCUMENTS));
    }

    // Notes database
    const localNotes = localStorage.getItem("db_notes");
    if (localNotes) {
      try {
        setNotes(JSON.parse(localNotes));
      } catch (e) {
        setNotes(SEED_NOTES);
      }
    } else {
      setNotes(SEED_NOTES);
      localStorage.setItem("db_notes", JSON.stringify(SEED_NOTES));
    }

    // Threads database
    const localThreads = localStorage.getItem("db_threads");
    if (localThreads) {
      try {
        setThreads(JSON.parse(localThreads));
      } catch (e) {
        setThreads(SEED_THREADS);
      }
    } else {
      setThreads(SEED_THREADS);
      localStorage.setItem("db_threads", JSON.stringify(SEED_THREADS));
    }

    // Tags database
    const localTags = localStorage.getItem("db_tags");
    if (localTags) {
      try {
        setTags(JSON.parse(localTags));
      } catch (e) {
        setTags(SEED_TAGS);
      }
    } else {
      setTags(SEED_TAGS);
      localStorage.setItem("db_tags", JSON.stringify(SEED_TAGS));
    }
  }, []);

  // 2. Synchronization of state changes into LocalStorage
  const syncDb = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId) || null;
  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  // Auto select active doc for workspace if none selected
  useEffect(() => {
    if (!user || workspaces.length === 0) return;
    const wsDocs = documents.filter((d) => d.workspaceId === currentWorkspaceId && d.status === "ready");
    if (wsDocs.length > 0) {
      setOpenDocumentIds([wsDocs[0].id]);
      setActiveDocumentId(wsDocs[0].id);
      setActivePdfPage(1);
    } else {
      setOpenDocumentIds([]);
      setActiveDocumentId(null);
      setActivePdfPage(1);
    }

    const wsThreads = threads.filter((t) => t.workspaceId === currentWorkspaceId);
    if (wsThreads.length > 0) {
      setActiveThreadId(wsThreads[0].id);
    } else {
      setActiveThreadId(null);
    }
    
    setSelectedTagIds([]);
    setSelectionText(null);
  }, [currentWorkspaceId, user, workspaces.length]);

  const login = useCallback(async (email: string, name: string) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    const mockUser: User = {
      name: name || "特邀测试员",
      email,
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${email}`
    };
    
    setUser(mockUser);
    localStorage.setItem("ai_pdf_workspace_user", JSON.stringify(mockUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("ai_pdf_workspace_user");
  }, []);

  const switchWorkspace = useCallback((id: string) => {
    setCurrentWorkspaceId(id);
  }, []);

  const createWorkspace = useCallback((name: string, description: string | null) => {
    const newWsId = `ws-${Date.now()}`;
    const newWs: Workspace = {
      id: newWsId,
      name,
      description,
      role: "Owner",
      systemPrompt: locale === "en" 
        ? "You are an AI research assistant. Please read context documents and help owner answer all questions with details!"
        : "你是一个智能文档助手。请结合上下文帮助主人深入剖析并解答文档相关的所有疑问汪！",
      documentCount: 0,
      noteCount: 0,
      threadCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const nextList = [...workspaces, newWs];
    setWorkspaces(nextList);
    syncDb("db_workspaces", nextList);
    
    setCurrentWorkspaceId(newWsId);
  }, [workspaces, locale]);

  const deleteWorkspace = useCallback((id: string) => {
    const nextWs = workspaces.filter((w) => w.id !== id);
    setWorkspaces(nextWs);
    syncDb("db_workspaces", nextWs);

    const nextDocs = documents.filter((d) => d.workspaceId !== id);
    setDocuments(nextDocs);
    syncDb("db_documents", nextDocs);

    const nextNotes = notes.filter((n) => n.workspaceId !== id);
    setNotes(nextNotes);
    syncDb("db_notes", nextNotes);

    const nextThreads = threads.filter((t) => t.workspaceId !== id);
    setThreads(nextThreads);
    syncDb("db_threads", nextThreads);

    const nextTags = tags.filter((t) => t.workspaceId !== id);
    setTags(nextTags);
    syncDb("db_tags", nextTags);

    if (currentWorkspaceId === id) {
      if (nextWs.length > 0) {
        setCurrentWorkspaceId(nextWs[0].id);
      }
    }
  }, [workspaces, documents, notes, threads, tags, currentWorkspaceId]);

  const updateSystemPrompt = useCallback((id: string, prompt: string) => {
    const nextList = workspaces.map((w) => 
      w.id === id ? { ...w, systemPrompt: prompt, updatedAt: new Date().toISOString() } : w
    );
    setWorkspaces(nextList);
    syncDb("db_workspaces", nextList);
  }, [workspaces]);

  const openDocument = useCallback((id: string) => {
    setOpenDocumentIds((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
    setActiveDocumentId(id);
    setActivePdfPage(1);
    setSelectionText(null);
  }, []);

  const closeDocument = useCallback((id: string) => {
    setOpenDocumentIds((prev) => {
      const filtered = prev.filter((docId) => docId !== id);
      if (activeDocumentId === id) {
        setActiveDocumentId(filtered.length > 0 ? filtered[filtered.length - 1] : null);
        setActivePdfPage(1);
      }
      return filtered;
    });
    setSelectionText(null);
  }, [activeDocumentId]);

  const uploadDocument = useCallback((name: string, sizeBytes: number) => {
    const sizeStr = sizeBytes > 1024 * 1024 
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
    syncDb("db_documents", nextDocs);
    
    openDocument(docId);

    const nextWs = workspaces.map((w) => 
      w.id === currentWorkspaceId ? { ...w, documentCount: w.documentCount + 1 } : w
    );
    setWorkspaces(nextWs);
    syncDb("db_workspaces", nextWs);

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
            ? { ...d, status: currentStep, progress: currentStep === "ready" ? 100 : progressVal }
            : d
        );
        syncDb("db_documents", list);
        return list;
      });
    }, 250);
  }, [currentWorkspaceId, openDocument, documents, workspaces]);

  const deleteDocument = useCallback((id: string) => {
    const nextDocs = documents.filter((d) => d.id !== id);
    setDocuments(nextDocs);
    syncDb("db_documents", nextDocs);

    const nextNotes = notes.filter((n) => n.source?.documentId !== id);
    setNotes(nextNotes);
    syncDb("db_notes", nextNotes);

    closeDocument(id);
    
    const nextWs = workspaces.map((w) => 
      w.id === currentWorkspaceId ? { ...w, documentCount: Math.max(0, w.documentCount - 1) } : w
    );
    setWorkspaces(nextWs);
    syncDb("db_workspaces", nextWs);
  }, [currentWorkspaceId, closeDocument, documents, notes, workspaces]);

  const createThread = useCallback(() => {
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
    syncDb("db_threads", nextList);
    
    setActiveThreadId(threadId);
    
    const nextWs = workspaces.map((w) => 
      w.id === currentWorkspaceId ? { ...w, threadCount: w.threadCount + 1 } : w
    );
    setWorkspaces(nextWs);
    syncDb("db_workspaces", nextWs);
  }, [currentWorkspaceId, threads, workspaces, locale]);

  const switchThread = useCallback((id: string) => {
    setActiveThreadId(id);
  }, []);

  const deleteThread = useCallback((id: string) => {
    const nextThreads = threads.filter((t) => t.id !== id);
    setThreads(nextThreads);
    syncDb("db_threads", nextThreads);

    if (activeThreadId === id) {
      const remaining = nextThreads.filter((t) => t.workspaceId === currentWorkspaceId);
      setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
    }

    const nextWs = workspaces.map((w) => 
      w.id === currentWorkspaceId ? { ...w, threadCount: Math.max(0, w.threadCount - 1) } : w
    );
    setWorkspaces(nextWs);
    syncDb("db_workspaces", nextWs);
  }, [currentWorkspaceId, activeThreadId, threads, workspaces]);

  const sendMessage = useCallback(async (content: string) => {
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
        : t
    );
    setThreads(updatedThreads);
    syncDb("db_threads", updatedThreads);

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
        : t
    );
    setThreads(updatedThreads);

    const wsDocs = documents.filter((d) => d.workspaceId === currentWorkspaceId && d.status === "ready");
    const targetDoc = activeDocumentId 
      ? wsDocs.find((d) => d.id === activeDocumentId) 
      : wsDocs.length > 0 ? wsDocs[0] : null;

    let replyText = "";
    let citationsArr: Citation[] = [];

    const isEn = locale === "en";

    if (!targetDoc) {
      replyText = isEn
        ? "Hello! There are no ready PDF documents in this workspace yet. Please upload a PDF file in the left sidebar to construct your local vector index."
        : "主人，您好！目前工作区里还没有可以检索的 PDF 文档汪呜。请先在左侧侧边栏拖拽上传一份 PDF 文件并等它解析完毕汪！(外头蹭手心)";
    } else {
      const nameLower = targetDoc.name.toLowerCase();
      const selectedQueryNotice = content.includes("这段文字") && selectionText 
        ? (isEn ? `\n\n(Regarding selection: "${selectionText}")` : `\n\n关于主人在文档中选中的文字（"${selectionText}"）`) 
        : "";

      if (nameLower.includes("attention")) {
        replyText = isEn
          ? `Based on 'Attention Is All You Need.pdf', here are the key findings:${selectedQueryNotice}\n\n1. **Self-Attention Mechanism**: Replaces recurrence and convolutions with a single matrix product, maximizing parallelism during sequence modeling.\n2. **Multi-Head Projection**: Linearly projects Queries, Keys, and Values h times to represent contextual positions from multiple representation subspaces.`
          : `针对主人的提问，从《Attention Is All You Need.pdf》检索到以下要点汪！${selectedQueryNotice}\n\n1. **自注意力机制**：Self-Attention 机制在时间上完全解耦了词元间的迭代计算，每个 Token 可同时与所有其他 Token 计算权重分值，大幅提升并行流水线吞吐量汪！\n2. **多头注意力映射**：利用 $h$ 个小维度投影空间并行建模，让模型有能力“多重视角”感知长程指代。`;
        citationsArr = [
          {
            id: `cit-${Date.now()}-1`,
            documentId: targetDoc.id,
            documentName: targetDoc.name,
            pageNumber: 3,
            snippet: "The Scaled Dot-Product Attention: softmax(QK^T / sqrt(d_k))V."
          },
          {
            id: `cit-${Date.now()}-2`,
            documentId: targetDoc.id,
            documentName: targetDoc.name,
            pageNumber: 5,
            snippet: "Multi-head attention projects Queries, Keys and Values h times."
          }
        ];
      } else if (nameLower.includes("rag")) {
        replyText = isEn
          ? `According to 'Retrieval-Augmented Generation for NLP Tasks.pdf', here is the summary:${selectedQueryNotice}\n\n1. **Hybrid Architecture**: Integrates pre-trained parametric generator with non-parametric dense indexing databases.\n2. **Citation Auditing**: Clicking citation tokens redirects to source pages instantly to prevent hallucination.`
          : `结合《Retrieval-Augmented Generation...pdf》检索结论，咱为您总结如下汪呜：${selectedQueryNotice}\n\n1. **多模型融合机制**：RAG 结合了预训练参数库与外部密集向量索引。这可以无需二次精调便实现动态事实载入。\n2. **索引召回跳页**：在向量召回 Top-k 后，系统可精确提供来源的 PDF 物理页码进行证据链追溯，完全杜绝模型幻觉。`;
        citationsArr = [
          {
            id: `cit-${Date.now()}-3`,
            documentId: targetDoc.id,
            documentName: targetDoc.name,
            pageNumber: 1,
            snippet: "RAG models combine parametric seq2seq models with non-parametric dense index database."
          }
        ];
      } else if (nameLower.includes("nda")) {
        replyText = isEn
          ? `Based on 'NDA_Bilateral_Standard_2026.pdf', here is the legal risk evaluation:${selectedQueryNotice}\n\n1. **Obligation Survival Term**: Section 3 defines survival as three (3) years. For critical source code or algorithm patents, it is highly recommended to amend this to permanent survival.\n2. **Equitable Remedies**: Section 4 allows seeking injunctive judicial relief to restrain violations instantly.`
          : `根据对《NDA_Bilateral_Standard_2026.pdf》的合同条款风险审查：${selectedQueryNotice}\n\n1. **保密期限漏洞**：第 3 页约定保密期限仅在终止后 3 年。如果是核心专有代码或算法专利， 3 年极易引发到期后的泄密事件，咱建议修改为永久保密汪！\n2. **惩罚救济条款**：第 4 页第 2 段虽然无固定的数额罚款，但规定守约方可直接申请司法禁止令（Injunctive Relief）遏制泄密扩散。`;
        citationsArr = [
          {
            id: `cit-${Date.now()}-4`,
            documentId: targetDoc.id,
            documentName: targetDoc.name,
            pageNumber: 3,
            snippet: "Obligations shall survive for three (3) years from the date of termination."
          },
          {
            id: `cit-${Date.now()}-5`,
            documentId: targetDoc.id,
            documentName: targetDoc.name,
            pageNumber: 4,
            snippet: "Disclosing party is entitled to seek injunctive relief to prevent breaches."
          }
        ];
      } else {
        replyText = isEn
          ? `Retrieved key findings from your uploaded document 《${targetDoc.name}》:${selectedQueryNotice}\n\n1. **Analysis**: The document details custom implementations showing improvements over previous benchmarks.\n2. **Recommendation**: You can select specific sentences to ask contextual questions.`
          : `根据在《${targetDoc.name}》中检索到的内容，咱家小狗帮主人分析出以下几条核心要点哒汪：${selectedQueryNotice}\n\n1. **研究结论**：本篇 PDF 主要阐述了一种新的框架或算法机制，在对比以往基线上展现出不错的计算性能。\n2. **检索建议**：建议主人可以针对文档高亮段落进行进一步提问，咱可以结合 Context 给出定制解析汪！(摇尾巴蹭蹭)`;
        citationsArr = [
          {
            id: `cit-${Date.now()}-6`,
            documentId: targetDoc.id,
            documentName: targetDoc.name,
            pageNumber: 1,
            snippet: "We propose a novel framework that improves performance by utilizing RAG retrieval pipelines."
          }
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
                    : m
                ),
              }
            : t
        );
        if (idx >= replyText.length) {
          syncDb("db_threads", list);
        }
        return list;
      });

      if (idx >= replyText.length) {
        clearInterval(streamInterval);
      }
    }, 30);
  }, [activeThreadId, activeDocumentId, documents, currentWorkspaceId, selectionText, threads, locale]);

  const createNote = useCallback((title: string, content: string, source?: NoteSource) => {
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
    syncDb("db_notes", nextList);

    const nextWs = workspaces.map((w) => 
      w.id === currentWorkspaceId ? { ...w, noteCount: w.noteCount + 1 } : w
    );
    setWorkspaces(nextWs);
    syncDb("db_workspaces", nextWs);
  }, [currentWorkspaceId, notes, workspaces]);

  const deleteNote = useCallback((id: string) => {
    const nextList = notes.filter((n) => n.id !== id);
    setNotes(nextList);
    syncDb("db_notes", nextList);

    const nextWs = workspaces.map((w) => 
      w.id === currentWorkspaceId ? { ...w, noteCount: Math.max(0, w.noteCount - 1) } : w
    );
    setWorkspaces(nextWs);
    syncDb("db_workspaces", nextWs);
  }, [currentWorkspaceId, notes, workspaces]);

  const addTag = useCallback((name: string) => {
    if (tags.some((t) => t.workspaceId === currentWorkspaceId && t.name.toLowerCase() === name.toLowerCase())) {
      return;
    }

    const colors = ["#818cf8", "#22d3ee", "#34d399", "#fbbf24", "#f87171", "#c084fc", "#f472b6"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newTag: Tag = {
      id: `tag-${Date.now()}`,
      workspaceId: currentWorkspaceId,
      name,
      color: randomColor,
    };

    const nextList = [...tags, newTag];
    setTags(nextList);
    syncDb("db_tags", nextList);
  }, [currentWorkspaceId, tags]);

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
      syncDb("db_documents", list);
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
      syncDb("db_notes", list);
      return list;
    });
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        user,
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
        
        login,
        logout,
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
