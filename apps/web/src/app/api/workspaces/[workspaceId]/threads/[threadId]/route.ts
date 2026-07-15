import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { buildApiHeaders, readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; threadId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, threadId } = await context.params;
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}/threads/${threadId}`, {
    method: "DELETE",
    cache: "no-store",
    headers: buildApiHeaders(session.userId),
  });

  if (!response.ok) {
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  }
  return new NextResponse(null, { status: 204 });
}
