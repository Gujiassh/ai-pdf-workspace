import type { AssetDetailResponseDto } from "@/lib/assets/types";
import type { ImageRegionLocator, SourceVersions, SpatialRegion } from "@/lib/evidence/types";

export type SurfacePoint = { x: number; y: number };
export type SurfaceSize = { width: number; height: number };

export type CurrentImageGeometry = {
  workspaceId: string;
  assetId: string;
  processingGeneration: number;
  widthPixels: number;
  heightPixels: number;
  orientationApplied: true;
};

export type ImageViewerSource =
  | { status: "loading" }
  | { status: "invalid" }
  | {
    status: "ready";
    mode: "current" | "frozen";
    url: string;
    geometry: { widthPixels: number; heightPixels: number };
  };

function isBoundedRegion(region: SpatialRegion): boolean {
  return Number.isFinite(region.x)
    && Number.isFinite(region.y)
    && Number.isFinite(region.width)
    && Number.isFinite(region.height)
    && region.x >= 0
    && region.y >= 0
    && region.width > 0
    && region.height > 0
    && region.x + region.width <= 1
    && region.y + region.height <= 1;
}

export function isValidImageEvidenceSnapshot(
  locator: ImageRegionLocator,
  sourceVersions: SourceVersions,
): boolean {
  return locator.version === 1
    && locator.coordinateSpace === "image_normalized_top_left_v1"
    && Number.isInteger(locator.widthPixels)
    && locator.widthPixels > 0
    && Number.isInteger(locator.heightPixels)
    && locator.heightPixels > 0
    && locator.orientationApplied === true
    && locator.regions.length > 0
    && locator.regions.every(isBoundedRegion)
    && Number.isInteger(sourceVersions.processingGeneration)
    && sourceVersions.processingGeneration > 0
    && sourceVersions.representationId.length > 0;
}

export function isImageNaturalSizeCompatible(
  geometry: { widthPixels: number; heightPixels: number },
  naturalWidth: number,
  naturalHeight: number,
): boolean {
  return geometry.widthPixels === naturalWidth && geometry.heightPixels === naturalHeight;
}

export function buildOrientedImageUrl(
  workspaceId: string,
  assetId: string,
  sourceVersions: SourceVersions,
): string {
  const params = new URLSearchParams({
    processingGeneration: String(sourceVersions.processingGeneration),
    evidenceRepresentationId: sourceVersions.representationId,
  });
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}/representations/image-oriented/file?${params}`;
}

export function buildCurrentOrientedImageUrl(
  workspaceId: string,
  assetId: string,
  processingGeneration: number,
): string {
  const params = new URLSearchParams({
    processingGeneration: String(processingGeneration),
  });
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}/representations/current-image-oriented/file?${params}`;
}

export function readCurrentImageGeometry(
  payload: AssetDetailResponseDto,
  workspaceId: string,
  assetId: string,
): CurrentImageGeometry | null {
  const generation = payload.asset.currentProcessingGeneration;
  if (
    payload.asset.id !== assetId
    || payload.asset.workspaceId !== workspaceId
    || payload.asset.kind !== "image"
    || payload.detail.kind !== "image"
    || !Number.isInteger(generation)
    || generation <= 0
    || !Number.isInteger(payload.detail.widthPixels)
    || payload.detail.widthPixels <= 0
    || !Number.isInteger(payload.detail.heightPixels)
    || payload.detail.heightPixels <= 0
    || payload.detail.orientationApplied !== true
  ) {
    return null;
  }
  return {
    workspaceId,
    assetId,
    processingGeneration: generation,
    widthPixels: payload.detail.widthPixels,
    heightPixels: payload.detail.heightPixels,
    orientationApplied: true,
  };
}

export function resolveImageViewerSource({
  workspaceId,
  assetId,
  locator,
  sourceVersions,
  currentGeometry,
}: {
  workspaceId: string;
  assetId: string;
  locator: ImageRegionLocator | null;
  sourceVersions: SourceVersions | null;
  currentGeometry: CurrentImageGeometry | null;
}): ImageViewerSource {
  const hasFrozenEvidence = locator !== null || sourceVersions !== null;
  if (hasFrozenEvidence) {
    if (!locator || !sourceVersions || !isValidImageEvidenceSnapshot(locator, sourceVersions)) {
      return { status: "invalid" };
    }
    return {
      status: "ready",
      mode: "frozen",
      url: buildOrientedImageUrl(workspaceId, assetId, sourceVersions),
      geometry: locator,
    };
  }
  if (
    !currentGeometry
    || currentGeometry.workspaceId !== workspaceId
    || currentGeometry.assetId !== assetId
  ) {
    return { status: "loading" };
  }
  return {
    status: "ready",
    mode: "current",
    url: buildCurrentOrientedImageUrl(
      workspaceId,
      assetId,
      currentGeometry.processingGeneration,
    ),
    geometry: currentGeometry,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampImageZoom(value: number, minimum: number, maximum: number): number {
  return clamp(Math.round(value), minimum, maximum);
}

export function calculatePinchZoom(
  startZoomPercent: number,
  startDistance: number,
  currentDistance: number,
  minimum: number,
  maximum: number,
): number {
  if (startDistance <= 0 || currentDistance <= 0) {
    return clampImageZoom(startZoomPercent, minimum, maximum);
  }
  return clampImageZoom(
    startZoomPercent * currentDistance / startDistance,
    minimum,
    maximum,
  );
}

export function moveNormalizedImagePoint(
  point: SurfacePoint,
  deltaX: number,
  deltaY: number,
): SurfacePoint {
  return {
    x: clamp(point.x + deltaX, 0, 1),
    y: clamp(point.y + deltaY, 0, 1),
  };
}

export function normalizeImagePoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
): SurfacePoint {
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("Image selection surface must have positive dimensions.");
  }
  return {
    x: clamp((clientX - bounds.left) / bounds.width, 0, 1),
    y: clamp((clientY - bounds.top) / bounds.height, 0, 1),
  };
}

export function createImageRegion(
  start: SurfacePoint,
  end: SurfacePoint,
  surface: SurfaceSize,
  minimumPixels = 8,
): SpatialRegion | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width * surface.width < minimumPixels || height * surface.height < minimumPixels) {
    return null;
  }
  return { x, y, width, height };
}
