import { NextResponse } from "next/server";

import { buildApiHeaders, readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { getApiBaseUrl } from "@/lib/api-base-url";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, assetId } = await context.params;
  const apiUrl = new URL(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}/assets/${assetId}`);
  const pageNumber = new URL(_request.url).searchParams.get("pageNumber");
  if (pageNumber) {
    apiUrl.searchParams.set("pageNumber", pageNumber);
  }
  const response = await fetch(apiUrl, {
    cache: "no-store",
    headers: {
      ...buildApiHeaders(session.userId),
    },
  });
  const data = (await response.json()) as unknown;

  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, assetId } = await context.params;
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}/assets/${assetId}`, {
    method: "DELETE",
    cache: "no-store",
    headers: {
      ...buildApiHeaders(session.userId),
    },
  });

  const data = (await response.json()) as unknown;
  return NextResponse.json(data, { status: response.status });
}
