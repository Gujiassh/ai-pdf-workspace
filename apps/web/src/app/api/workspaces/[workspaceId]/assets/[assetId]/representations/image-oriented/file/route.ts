import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { buildApiHeaders, readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { buildImageStreamApiUrl, proxyImageStreamResponse } from "@/lib/evidence/image-stream";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, assetId } = await context.params;
  const requestUrl = new URL(request.url);
  const processingGeneration = requestUrl.searchParams.get("processingGeneration");
  const evidenceRepresentationId = requestUrl.searchParams.get("evidenceRepresentationId");
  if (!processingGeneration || !evidenceRepresentationId) {
    return NextResponse.json(
      { detail: "Image evidence snapshot is required." },
      { status: 400 },
    );
  }

  const apiUrl = buildImageStreamApiUrl(getApiBaseUrl(), workspaceId, assetId, {
    mode: "frozen",
    processingGeneration,
    evidenceRepresentationId,
  });
  const response = await fetch(apiUrl, {
    cache: "no-store",
    headers: buildApiHeaders(session.userId),
  });

  return proxyImageStreamResponse(response);
}
