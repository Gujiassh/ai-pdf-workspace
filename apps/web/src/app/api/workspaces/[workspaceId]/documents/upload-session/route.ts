import { NextResponse } from "next/server";

import { buildApiHeaders, readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { getApiBaseUrl } from "@/lib/api-base-url";
import type { CreateUploadSessionResponseDto } from "@/lib/documents/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId } = await context.params;
  const body = await request.json();
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}/documents/upload-session`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...buildApiHeaders(session.userId),
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as CreateUploadSessionResponseDto | Record<string, unknown>;
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  const typed = data as CreateUploadSessionResponseDto;
  return NextResponse.json({
    ...typed,
    upload: {
      ...typed.upload,
      url: `/api/workspaces/${workspaceId}/documents/${typed.document.id}/upload?objectKey=${encodeURIComponent(typed.upload.objectKey)}`,
    },
  }, { status: response.status });
}
