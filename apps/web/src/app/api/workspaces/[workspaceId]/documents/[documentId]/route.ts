import { NextResponse } from "next/server";

import { readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { getApiBaseUrl } from "@/lib/api-base-url";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, documentId } = await context.params;
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}/documents/${documentId}`, {
    method: "DELETE",
    cache: "no-store",
    headers: {
      "x-user-id": session.userId,
    },
  });

  if (!response.ok) {
    const data = (await response.json()) as unknown;
    return NextResponse.json(data, { status: response.status });
  }

  return new NextResponse(null, { status: 204 });
}
