"use client";

import React, { createContext, useContext, useRef } from "react";

import { useAuth } from "@/lib/auth/auth-context";
import type { ChatThread } from "@/lib/chat/types";
import type { TagDto } from "@/lib/notes/types";

import { useTranslation } from "./i18n-context";
import { useChat } from "./use-chat";
import { useDocuments } from "./use-documents";
import { useNotesTags } from "./use-notes-tags";
import { useWorkspaceViewState } from "./workspace-view-state";
import { useWorkspaces } from "./use-workspaces";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
  role: string;
  systemPrompt: string;
  retrievalTopK: number;
  chunkSize: number;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: string;
  generationProvider: string;
  generationModel: string;
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
  evidencePanelOpen: boolean;
  evidencePanelExpanded: boolean;
  selectionText: string | null;
  selectedTagIds: string[];
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string, description: string | null) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  updateWorkspaceSettings: (id: string, settings: WorkspaceSettingsInput) => Promise<void>;
  uploadDocument: (file: File) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  retryDocument: (id: string) => Promise<void>;
  retryDeleteDocument: (id: string) => Promise<void>;
  openDocument: (id: string) => void;
  closeDocument: (id: string) => void;
  createThread: () => Promise<void>;
  switchThread: (id: string) => void;
  deleteThread: (id: string) => Promise<void>;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
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
  setEvidencePanelOpen: (open: boolean) => void;
  setEvidencePanelExpanded: (expanded: boolean) => void;
  closeEvidencePanel: () => void;
  setSelectionText: (text: string | null) => void;
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
};

export type SendMessageOptions = {
  editMessageId?: string;
};

export type WorkspaceSettingsInput = {
  systemPrompt: string;
  retrievalTopK: number;
  chunkSize: number;
};

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useTranslation();
  const { user, isHydrating: isAuthHydrating } = useAuth();
  const viewState = useWorkspaceViewState();
  const documentsRef = useRef<Document[]>([]);
  const tagRelationsRef = useRef<TagDto[]>([]);
  const syncWorkspaceViewState = viewState.syncWorkspaceViewState;
  const clearWorkspaceViewState = viewState.clearWorkspaceViewState;

  const onWorkspaceSelected = React.useCallback(
    (workspaceId: string) => {
      syncWorkspaceViewState(workspaceId, documentsRef.current);
    },
    [syncWorkspaceViewState],
  );
  const onWorkspaceCleared = React.useCallback(() => {
    clearWorkspaceViewState();
  }, [clearWorkspaceViewState]);

  const workspaceState = useWorkspaces({
    locale,
    user,
    isAuthHydrating,
    currentWorkspaceId: viewState.currentWorkspaceId,
    currentWorkspaceIdRef: viewState.currentWorkspaceIdRef,
    setCurrentWorkspaceId: viewState.setCurrentWorkspaceId,
    onWorkspaceSelected,
    onWorkspaceCleared,
  });

  const documentState = useDocuments({
    locale,
    user,
    isAuthHydrating,
    currentWorkspaceId: viewState.currentWorkspaceId,
    tagRelationsRef,
    documentsRef,
    syncDocumentViewState: viewState.syncDocumentViewState,
    closeDocument: viewState.closeDocument,
    updateWorkspace: workspaceState.updateWorkspace,
  });

  const notesTagsState = useNotesTags({
    user,
    isAuthHydrating,
    currentWorkspaceId: viewState.currentWorkspaceId,
    currentWorkspaceIdRef: viewState.currentWorkspaceIdRef,
    tagRelationsRef,
    documentsRef,
    setSelectedTagIds: viewState.setSelectedTagIds,
    applyDocumentTags: documentState.applyTagRelations,
    updateDocumentTags: documentState.updateDocumentTags,
    removeDocumentTagName: documentState.removeTagName,
    updateWorkspace: workspaceState.updateWorkspace,
  });

  const chatState = useChat({
    locale,
    user,
    isAuthHydrating,
    currentWorkspaceId: viewState.currentWorkspaceId,
    currentWorkspaceIdRef: viewState.currentWorkspaceIdRef,
    activeThreadId: viewState.activeThreadId,
    activeThreadIdRef: viewState.activeThreadIdRef,
    selectionText: viewState.selectionText,
    setActiveThreadId: viewState.setActiveThreadId,
    updateWorkspace: workspaceState.updateWorkspace,
  });

  const deleteWorkspaceFromState = workspaceState.deleteWorkspace;
  const removeDocumentsWorkspace = documentState.removeWorkspace;
  const removeNotesTagsWorkspace = notesTagsState.removeWorkspace;
  const removeChatWorkspace = chatState.removeWorkspace;
  const deleteWorkspace = React.useCallback(
    async (id: string) => {
      await deleteWorkspaceFromState(id);
      removeDocumentsWorkspace(id);
      removeNotesTagsWorkspace(id);
      removeChatWorkspace(id);
    },
    [deleteWorkspaceFromState, removeChatWorkspace, removeDocumentsWorkspace, removeNotesTagsWorkspace],
  );

  return (
    <WorkspaceContext.Provider
      value={{
        isHydrating: workspaceState.isHydrating,
        workspaces: workspaceState.workspaces,
        currentWorkspace: workspaceState.currentWorkspace,
        documents: documentState.documents,
        notes: notesTagsState.notes,
        threads: chatState.threads,
        activeThread: chatState.activeThread,
        tags: notesTagsState.tags,
        openDocumentIds: viewState.openDocumentIds,
        activeDocumentId: viewState.activeDocumentId,
        activePdfPage: viewState.activePdfPage,
        activeTab: viewState.activeTab,
        leftSidebarOpen: viewState.leftSidebarOpen,
        evidencePanelOpen: viewState.evidencePanelOpen,
        evidencePanelExpanded: viewState.evidencePanelExpanded,
        selectionText: viewState.selectionText,
        selectedTagIds: viewState.selectedTagIds,
        switchWorkspace: workspaceState.switchWorkspace,
        createWorkspace: workspaceState.createWorkspace,
        deleteWorkspace,
        updateWorkspaceSettings: workspaceState.updateWorkspaceSettings,
        uploadDocument: documentState.uploadDocument,
        deleteDocument: documentState.deleteDocument,
        retryDocument: documentState.retryDocument,
        retryDeleteDocument: documentState.retryDeleteDocument,
        openDocument: viewState.openDocument,
        closeDocument: viewState.closeDocument,
        createThread: chatState.createThread,
        switchThread: chatState.switchThread,
        deleteThread: chatState.deleteThread,
        sendMessage: chatState.sendMessage,
        createNote: notesTagsState.createNote,
        updateNote: notesTagsState.updateNote,
        deleteNote: notesTagsState.deleteNote,
        addTag: notesTagsState.addTag,
        deleteTag: notesTagsState.deleteTag,
        toggleDocumentTag: notesTagsState.toggleDocumentTag,
        toggleNoteTag: notesTagsState.toggleNoteTag,
        setActiveDocumentId: viewState.setActiveDocumentId,
        setActivePdfPage: viewState.setActivePdfPage,
        setActiveTab: viewState.setActiveTab,
        setLeftSidebarOpen: viewState.setLeftSidebarOpen,
        setEvidencePanelOpen: viewState.setEvidencePanelOpen,
        setEvidencePanelExpanded: viewState.setEvidencePanelExpanded,
        closeEvidencePanel: viewState.closeEvidencePanel,
        setSelectionText: viewState.setSelectionText,
        setSelectedTagIds: viewState.setSelectedTagIds,
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
