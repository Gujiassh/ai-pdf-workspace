import { NextResponse } from "next/server";

import { readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { getApiBaseUrl } from "@/lib/api-base-url";

export async function PUT(
  request: Request,
  context: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, documentId } = await context.params;
  const objectKey = new URL(request.url).searchParams.get("objectKey");
  if (!objectKey) {
    return NextResponse.json({ error: { code: "object_key_required", message: "objectKey is required." } }, { status: 400 });
  }

  const body = await request.arrayBuffer();
  const response = await fetch(
    `${getApiBaseUrl()}/v1/workspaces/${workspaceId}/documents/${documentId}/upload?objectKey=${encodeURIComponent(objectKey)}`,
    {
      method: "PUT",
      cache: "no-store",
      headers: {
        "x-user-id": session.userId,
        "content-type": request.headers.get("content-type") ?? "application/pdf",
      },
      body: Buffer.from(body),
    },
  );

  if (!response.ok) {
    const data = (await response.json()) as unknown;
    return NextResponse.json(data, { status: response.status });
  }

  return new NextResponse(null, { status: 204 });
}
