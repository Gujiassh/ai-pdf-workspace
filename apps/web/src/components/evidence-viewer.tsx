"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, FileQuestion } from "lucide-react";

import { productionEvidenceRegistry } from "@/lib/evidence/production-registry";
import { EvidenceModuleContractError } from "@/lib/evidence/registry";
import { useWorkspace } from "@/lib/workspace-context";

class EvidenceRendererBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`evidence_renderer_failed message=${JSON.stringify(error.message)} stack=${JSON.stringify(info.componentStack)}`);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-xs leading-5">Evidence renderer failed.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function resolveRenderer(assetKind: string, locator: Parameters<typeof productionEvidenceRegistry.resolve>[1]) {
  try {
    return {
      Renderer: productionEvidenceRegistry.resolve(assetKind, locator).EvidenceRenderer,
      error: null,
    };
  } catch (error) {
    return {
      Renderer: null,
      error: error instanceof EvidenceModuleContractError
        ? error.message
        : "Evidence renderer failed to initialize.",
    };
  }
}

export function EvidenceViewer() {
  const {
    assets,
    activeAssetId,
    activeEvidenceLocator,
    activeEvidenceSourceVersions,
  } = useWorkspace();
  const activeAsset = assets.find((asset) => asset.id === activeAssetId);

  if (!activeAsset) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-zinc-500">
        <FileQuestion className="h-5 w-5" />
        <p className="text-xs">No evidence asset selected.</p>
      </div>
    );
  }

  const resolution = resolveRenderer(activeAsset.kind, activeEvidenceLocator);
  if (!resolution.Renderer) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-rose-600 dark:text-rose-400">
        <AlertTriangle className="h-5 w-5" />
        <p className="text-xs leading-5">{resolution.error}</p>
      </div>
    );
  }

  const Renderer = resolution.Renderer;
  const locatorKey = activeEvidenceLocator ? JSON.stringify(activeEvidenceLocator) : "asset";
  const sourceVersionsKey = activeEvidenceSourceVersions
    ? JSON.stringify(activeEvidenceSourceVersions)
    : "current";
  return (
    <EvidenceRendererBoundary key={`${activeAsset.id}:${locatorKey}:${sourceVersionsKey}`}>
      <Renderer
        asset={activeAsset}
        locator={activeEvidenceLocator}
        sourceVersions={activeEvidenceSourceVersions}
      />
    </EvidenceRendererBoundary>
  );
}
