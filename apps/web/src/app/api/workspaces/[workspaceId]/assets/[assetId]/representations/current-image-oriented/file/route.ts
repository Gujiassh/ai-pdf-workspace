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
  const processingGeneration = new URL(request.url).searchParams.get("processingGeneration");
  if (!processingGeneration) {
    return NextResponse.json({ detail: "Current image generation is required." }, { status: 400 });
  }

  const { workspaceId, assetId } = await context.params;
  const apiUrl = buildImageStreamApiUrl(getApiBaseUrl(), workspaceId, assetId, {
    mode: "current",
    processingGeneration,
  });
  const response = await fetch(apiUrl, {
    cache: "no-store",
    headers: buildApiHeaders(session.userId),
  });
  return proxyImageStreamResponse(response);
}
