import type { PageGeometry, SpatialRegion } from "@/lib/evidence/types";
import type { PdfRenderedGeometry } from "./pdf-renderer";

const POINT_TOLERANCE = 0.5;

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= POINT_TOLERANCE;
}

export function isPdfGeometryCompatible(
  locator: PageGeometry,
  rendered: PdfRenderedGeometry,
): boolean {
  return locator.rotationDegrees === rendered.rotationDegrees
    && locator.cropBoxPoints.every((value, index) => closeEnough(value, rendered.cropBoxPoints[index]))
    && closeEnough(locator.displayWidthPoints, rendered.displayWidthPoints)
    && closeEnough(locator.displayHeightPoints, rendered.displayHeightPoints);
}

export type SurfacePoint = { x: number; y: number };
export type SurfaceSize = { width: number; height: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeSurfacePoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
): SurfacePoint {
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error("PDF selection surface must have positive dimensions.");
  }
  return {
    x: clamp((clientX - bounds.left) / bounds.width, 0, 1),
    y: clamp((clientY - bounds.top) / bounds.height, 0, 1),
  };
}

export function createSurfaceRegion(
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
