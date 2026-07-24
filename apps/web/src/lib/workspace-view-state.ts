"use client";

import { useCallback, useRef, useState } from "react";

import type { EvidenceTarget } from "@/lib/evidence/types";
import type { Asset } from "./workspace-context";

export type WorkspaceTab = "chat" | "notes" | "settings";

export const DEFAULT_EVIDENCE_PANEL_WIDTH = 500;
export const MIN_EVIDENCE_PANEL_WIDTH = 400;
export const MAX_EVIDENCE_PANEL_WIDTH = 920;
export const MIN_CHAT_CANVAS_WIDTH = 440;

export function clampEvidencePanelWidth(requestedWidth: number, workspaceWidth: number): number {
  const availableMaximum = Math.max(
    MIN_EVIDENCE_PANEL_WIDTH,
    Math.min(MAX_EVIDENCE_PANEL_WIDTH, workspaceWidth - MIN_CHAT_CANVAS_WIDTH),
  );
  return Math.min(availableMaximum, Math.max(MIN_EVIDENCE_PANEL_WIDTH, requestedWidth));
}

export const isAssetViewable = (status: Asset["status"]): boolean =>
  status === "chunked" || status === "ready";

export function getWorkspaceViewableAssets(workspaceId: string, assets: Asset[]): Asset[] {
  return assets.filter(
    (asset) => asset.workspaceId === workspaceId && isAssetViewable(asset.status),
  );
}

export function getWorkspaceViewStateForWorkspace(
  workspaceId: string,
  assets: Asset[],
): {
  openAssetIds: string[];
  activeAssetId: string | null;
  activePdfPage: number;
  evidencePanelOpen: boolean;
  evidencePanelExpanded: boolean;
} {
  const viewableAssets = getWorkspaceViewableAssets(workspaceId, assets);
  const firstAssetId = viewableAssets[0]?.id ?? null;
  return {
    openAssetIds: firstAssetId ? [firstAssetId] : [],
    activeAssetId: firstAssetId,
    activePdfPage: 1,
    evidencePanelOpen: false,
    evidencePanelExpanded: false,
  };
}

export type WorkspaceViewState = {
  currentWorkspaceId: string;
  activeThreadId: string | null;
  openAssetIds: string[];
  activeAssetId: string | null;
  activePdfPage: number;
  activeTab: WorkspaceTab;
  leftSidebarOpen: boolean;
  evidencePanelOpen: boolean;
  evidencePanelExpanded: boolean;
  selectionText: string | null;
  selectedAssetIds: string[];
  selectedTagIds: string[];
};

export function useWorkspaceViewState() {
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState("");
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(null);
  const [openAssetIds, setOpenAssetIds] = useState<string[]>([]);
  const [activeAssetId, setActiveAssetIdState] = useState<string | null>(null);
  const [activeEvidenceTarget, setActiveEvidenceTarget] = useState<EvidenceTarget | null>(null);
  const [activePdfPage, setActivePdfPage] = useState(1);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("chat");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [evidencePanelOpen, setEvidencePanelOpen] = useState(false);
  const [evidencePanelExpanded, setEvidencePanelExpanded] = useState(false);
  const [selectionText, setSelectionText] = useState<string | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const currentWorkspaceIdRef = useRef(currentWorkspaceId);
  const activeThreadIdRef = useRef(activeThreadId);
  const activeAssetIdRef = useRef(activeAssetId);

  const setCurrentWorkspaceId = useCallback((id: string) => {
    currentWorkspaceIdRef.current = id;
    setCurrentWorkspaceIdState(id);
  }, []);

  const setActiveThreadId = useCallback((id: string | null) => {
    activeThreadIdRef.current = id;
    setActiveThreadIdState(id);
  }, []);

  const setActiveAssetId = useCallback((id: string | null) => {
    activeAssetIdRef.current = id;
    setActiveAssetIdState(id);
  }, []);

  const syncWorkspaceViewState = useCallback(
    (workspaceId: string, assets: Asset[]) => {
      const nextState = getWorkspaceViewStateForWorkspace(workspaceId, assets);
      setOpenAssetIds(nextState.openAssetIds);
      setActiveAssetId(nextState.activeAssetId);
      setActivePdfPage(nextState.activePdfPage);
      setActiveEvidenceTarget(null);
      setActiveThreadId(null);
      setSelectedAssetIds([]);
      setSelectedTagIds([]);
      setSelectionText(null);
      setEvidencePanelOpen(nextState.evidencePanelOpen);
      setEvidencePanelExpanded(nextState.evidencePanelExpanded);
    },
    [setActiveAssetId, setActiveThreadId],
  );

  const syncAssetViewState = useCallback(
    (workspaceId: string, assets: Asset[]) => {
      const nextState = getWorkspaceViewStateForWorkspace(workspaceId, assets);
      setOpenAssetIds(nextState.openAssetIds);
      setActiveAssetId(nextState.activeAssetId);
      setActivePdfPage(nextState.activePdfPage);
      setActiveEvidenceTarget(null);
      const readyAssetIds = new Set(
        assets
          .filter((asset) => asset.workspaceId === workspaceId && asset.status === "ready")
          .map((asset) => asset.id),
      );
      setSelectedAssetIds((previous) => previous.filter((assetId) => readyAssetIds.has(assetId)));
    },
    [setActiveAssetId],
  );

  const clearWorkspaceViewState = useCallback(() => {
    setOpenAssetIds([]);
    setActiveAssetId(null);
    setActivePdfPage(1);
    setActiveEvidenceTarget(null);
    setActiveThreadId(null);
    setSelectedAssetIds([]);
    setSelectedTagIds([]);
    setSelectionText(null);
    setEvidencePanelOpen(false);
    setEvidencePanelExpanded(false);
  }, [setActiveAssetId, setActiveThreadId]);

  const openAsset = useCallback(
    (id: string) => {
      setOpenAssetIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
      setActiveAssetId(id);
      setActivePdfPage(1);
      setActiveEvidenceTarget(null);
      setSelectionText(null);
      setEvidencePanelOpen(true);
      setEvidencePanelExpanded(false);
    },
    [setActiveAssetId],
  );

  const closeAsset = useCallback(
    (id: string) => {
      setOpenAssetIds((previous) => {
        const nextAssetIds = previous.filter((assetId) => assetId !== id);
        if (activeAssetIdRef.current === id) {
          setActiveAssetId(nextAssetIds[nextAssetIds.length - 1] ?? null);
          setActivePdfPage(1);
          setActiveEvidenceTarget(null);
        }
        return nextAssetIds;
      });
      setSelectionText(null);
      setSelectedAssetIds((previous) => previous.filter((assetId) => assetId !== id));
    },
    [setActiveAssetId],
  );

  const closeEvidencePanel = useCallback(() => {
    setEvidencePanelExpanded(false);
    setEvidencePanelOpen(false);
  }, []);

  const openEvidence = useCallback(
    (target: EvidenceTarget) => {
      setOpenAssetIds((previous) => previous.includes(target.assetId)
        ? previous
        : [...previous, target.assetId]);
      setActiveAssetId(target.assetId);
      setActiveEvidenceTarget(target);
      if (target.locator.kind === "pdf_page" || target.locator.kind === "pdf_region") {
        setActivePdfPage(target.locator.pageNumber);
      }
      setSelectionText(null);
      setEvidencePanelOpen(true);
      setEvidencePanelExpanded(false);
    },
    [setActiveAssetId],
  );

  const toggleAssetScope = useCallback((assetId: string) => {
    setSelectedAssetIds((previous) => previous.includes(assetId)
      ? previous.filter((id) => id !== assetId)
      : [...previous, assetId]);
  }, []);

  const clearAssetScope = useCallback(() => setSelectedAssetIds([]), []);

  return {
    currentWorkspaceId,
    activeThreadId,
    openAssetIds,
    activeAssetId,
    activeEvidenceTarget,
    activeEvidenceLocator: activeEvidenceTarget?.locator ?? null,
    activeEvidenceSourceVersions: activeEvidenceTarget?.sourceVersions ?? null,
    activePdfPage,
    activeTab,
    leftSidebarOpen,
    evidencePanelOpen,
    evidencePanelExpanded,
    selectionText,
    selectedAssetIds,
    selectedTagIds,
    currentWorkspaceIdRef,
    activeThreadIdRef,
    setCurrentWorkspaceId,
    setActiveThreadId,
    setActiveAssetId,
    setActivePdfPage,
    setActiveTab,
    setLeftSidebarOpen,
    setEvidencePanelOpen,
    setEvidencePanelExpanded,
    closeEvidencePanel,
    setSelectionText,
    toggleAssetScope,
    clearAssetScope,
    setSelectedTagIds,
    syncWorkspaceViewState,
    syncAssetViewState,
    clearWorkspaceViewState,
    openAsset,
    openEvidence,
    closeAsset,
  };
}
