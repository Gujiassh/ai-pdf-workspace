import { NextResponse } from "next/server";

import { readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { getApiBaseUrl } from "@/lib/api-base-url";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, documentId } = await context.params;
  const body = await request.json();
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}/documents/${documentId}/finalize-upload`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": session.userId,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as unknown;
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(data, { status: response.status });
}
