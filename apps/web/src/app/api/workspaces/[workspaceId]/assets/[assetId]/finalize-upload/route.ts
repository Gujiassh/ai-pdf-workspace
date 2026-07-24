import { NextResponse } from "next/server";

import { buildApiHeaders, readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { getApiBaseUrl } from "@/lib/api-base-url";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, assetId } = await context.params;
  const body = await request.json();
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}/assets/${assetId}/finalize-upload`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...buildApiHeaders(session.userId),
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as unknown;
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(data, { status: response.status });
}
