const FORWARDED_IMAGE_HEADERS = [
  "cache-control",
  "content-disposition",
  "content-length",
  "content-type",
  "x-content-type-options",
];

export type ImageStreamTarget =
  | { mode: "current"; processingGeneration: string }
  | {
    mode: "frozen";
    processingGeneration: string;
    evidenceRepresentationId: string;
  };

export function buildImageStreamApiUrl(
  apiBaseUrl: string,
  workspaceId: string,
  assetId: string,
  target: ImageStreamTarget,
): URL {
  const route = target.mode === "current"
    ? "current-image-oriented"
    : "image-oriented";
  const url = new URL(
    `${apiBaseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}/representations/${route}/file`,
  );
  url.searchParams.set("processingGeneration", target.processingGeneration);
  if (target.mode === "frozen") {
    url.searchParams.set("evidenceRepresentationId", target.evidenceRepresentationId);
  }
  return url;
}

export async function proxyImageStreamResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return Response.json(await response.json() as unknown, { status: response.status });
    }
    return Response.json(
      { detail: (await response.text()).trim() || "Failed to load oriented image." },
      { status: response.status },
    );
  }

  const headers = new Headers();
  for (const name of FORWARDED_IMAGE_HEADERS) {
    const value = response.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return new Response(response.body, { status: response.status, headers });
}
