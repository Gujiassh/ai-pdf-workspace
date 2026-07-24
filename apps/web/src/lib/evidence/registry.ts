import type { ComponentType } from "react";

import type { Asset } from "@/lib/workspace-context";
import type { EvidenceLocator, SourceVersions } from "./types";

export type EvidenceRendererProps = {
  asset: Asset;
  locator: EvidenceLocator | null;
  sourceVersions: SourceVersions | null;
};

export type EvidenceModule = {
  assetKind: string;
  locatorKinds: readonly EvidenceLocator["kind"][];
  label: string;
  uploadAccept: readonly string[];
  EvidenceRenderer: ComponentType<EvidenceRendererProps>;
};

export class EvidenceModuleContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceModuleContractError";
  }
}

export function createEvidenceModuleRegistry(entries: readonly EvidenceModule[]) {
  const byAssetKind = new Map<string, EvidenceModule>();
  const locatorOwners = new Map<EvidenceLocator["kind"], string>();

  for (const entry of entries) {
    if (byAssetKind.has(entry.assetKind)) {
      throw new EvidenceModuleContractError(`Duplicate evidence asset kind: ${entry.assetKind}`);
    }
    if (entry.locatorKinds.length === 0) {
      throw new EvidenceModuleContractError(`Evidence module has no locator kinds: ${entry.assetKind}`);
    }
    for (const locatorKind of entry.locatorKinds) {
      const owner = locatorOwners.get(locatorKind);
      if (owner) {
        throw new EvidenceModuleContractError(
          `Locator kind ${locatorKind} is registered by both ${owner} and ${entry.assetKind}`,
        );
      }
      locatorOwners.set(locatorKind, entry.assetKind);
    }
    byAssetKind.set(entry.assetKind, entry);
  }

  return {
    resolve(assetKind: string, locator: EvidenceLocator | null): EvidenceModule {
      const entry = byAssetKind.get(assetKind);
      if (!entry) {
        throw new EvidenceModuleContractError(`Unsupported evidence asset kind: ${assetKind}`);
      }
      if (locator && !entry.locatorKinds.includes(locator.kind)) {
        throw new EvidenceModuleContractError(
          `Locator kind ${locator.kind} does not belong to asset kind ${assetKind}`,
        );
      }
      return entry;
    },
    list(): EvidenceModule[] {
      return [...byAssetKind.values()];
    },
  };
}
