"use client";

import { useCallback, useRef, useState } from "react";

import type { Document } from "./workspace-context";

export type WorkspaceTab = "chat" | "notes" | "settings";

export const isDocumentViewable = (status: Document["status"]): boolean =>
  status === "chunked" || status === "ready";

export function getWorkspaceViewableDocs(workspaceId: string, documents: Document[]): Document[] {
  return documents.filter(
    (document) => document.workspaceId === workspaceId && isDocumentViewable(document.status),
  );
}

export function getWorkspaceViewStateForWorkspace(
  workspaceId: string,
  documents: Document[],
): {
  openDocumentIds: string[];
  activeDocumentId: string | null;
  activePdfPage: number;
} {
  const viewableDocuments = getWorkspaceViewableDocs(workspaceId, documents);
  const firstDocumentId = viewableDocuments[0]?.id ?? null;
  return {
    openDocumentIds: firstDocumentId ? [firstDocumentId] : [],
    activeDocumentId: firstDocumentId,
    activePdfPage: 1,
  };
}

export type WorkspaceViewState = {
  currentWorkspaceId: string;
  activeThreadId: string | null;
  openDocumentIds: string[];
  activeDocumentId: string | null;
  activePdfPage: number;
  activeTab: WorkspaceTab;
  leftSidebarOpen: boolean;
  rightPanelOpen: boolean;
  selectionText: string | null;
  selectedTagIds: string[];
};

export function useWorkspaceViewState() {
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState("");
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(null);
  const [openDocumentIds, setOpenDocumentIds] = useState<string[]>([]);
  const [activeDocumentId, setActiveDocumentIdState] = useState<string | null>(null);
  const [activePdfPage, setActivePdfPage] = useState(1);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("chat");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const currentWorkspaceIdRef = useRef(currentWorkspaceId);
  const activeThreadIdRef = useRef(activeThreadId);
  const activeDocumentIdRef = useRef(activeDocumentId);

  const setCurrentWorkspaceId = useCallback((id: string) => {
    currentWorkspaceIdRef.current = id;
    setCurrentWorkspaceIdState(id);
  }, []);

  const setActiveThreadId = useCallback((id: string | null) => {
    activeThreadIdRef.current = id;
    setActiveThreadIdState(id);
  }, []);

  const setActiveDocumentId = useCallback((id: string | null) => {
    activeDocumentIdRef.current = id;
    setActiveDocumentIdState(id);
  }, []);

  const syncWorkspaceViewState = useCallback(
    (workspaceId: string, documents: Document[]) => {
      const nextState = getWorkspaceViewStateForWorkspace(workspaceId, documents);
      setOpenDocumentIds(nextState.openDocumentIds);
      setActiveDocumentId(nextState.activeDocumentId);
      setActivePdfPage(nextState.activePdfPage);
      setActiveThreadId(null);
      setSelectedTagIds([]);
      setSelectionText(null);
    },
    [setActiveDocumentId, setActiveThreadId],
  );

  const syncDocumentViewState = useCallback(
    (workspaceId: string, documents: Document[]) => {
      const nextState = getWorkspaceViewStateForWorkspace(workspaceId, documents);
      setOpenDocumentIds(nextState.openDocumentIds);
      setActiveDocumentId(nextState.activeDocumentId);
      setActivePdfPage(nextState.activePdfPage);
    },
    [setActiveDocumentId],
  );

  const clearWorkspaceViewState = useCallback(() => {
    setOpenDocumentIds([]);
    setActiveDocumentId(null);
    setActivePdfPage(1);
    setActiveThreadId(null);
    setSelectedTagIds([]);
    setSelectionText(null);
  }, [setActiveDocumentId, setActiveThreadId]);

  const openDocument = useCallback(
    (id: string) => {
      setOpenDocumentIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
      setActiveDocumentId(id);
      setActivePdfPage(1);
      setSelectionText(null);
    },
    [setActiveDocumentId],
  );

  const closeDocument = useCallback(
    (id: string) => {
      setOpenDocumentIds((previous) => {
        const nextDocumentIds = previous.filter((documentId) => documentId !== id);
        if (activeDocumentIdRef.current === id) {
          setActiveDocumentId(nextDocumentIds[nextDocumentIds.length - 1] ?? null);
          setActivePdfPage(1);
        }
        return nextDocumentIds;
      });
      setSelectionText(null);
    },
    [setActiveDocumentId],
  );

  return {
    currentWorkspaceId,
    activeThreadId,
    openDocumentIds,
    activeDocumentId,
    activePdfPage,
    activeTab,
    leftSidebarOpen,
    rightPanelOpen,
    selectionText,
    selectedTagIds,
    currentWorkspaceIdRef,
    activeThreadIdRef,
    setCurrentWorkspaceId,
    setActiveThreadId,
    setActiveDocumentId,
    setActivePdfPage,
    setActiveTab,
    setLeftSidebarOpen,
    setRightPanelOpen,
    setSelectionText,
    setSelectedTagIds,
    syncWorkspaceViewState,
    syncDocumentViewState,
    clearWorkspaceViewState,
    openDocument,
    closeDocument,
  };
}
