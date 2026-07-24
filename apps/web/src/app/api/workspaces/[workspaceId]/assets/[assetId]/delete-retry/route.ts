import { NextResponse } from "next/server";

import { buildApiHeaders, readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { getApiBaseUrl } from "@/lib/api-base-url";

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, assetId } = await context.params;
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}/assets/${assetId}/delete-retry`, {
    method: "POST",
    cache: "no-store",
    headers: buildApiHeaders(session.userId),
  });
  const data = (await response.json()) as unknown;
  return NextResponse.json(data, { status: response.status });
}
