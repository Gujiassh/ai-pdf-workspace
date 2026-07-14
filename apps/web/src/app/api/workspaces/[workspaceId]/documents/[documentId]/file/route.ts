import { NextResponse } from "next/server";

import { readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";
import { getApiBaseUrl } from "@/lib/api-base-url";

const FORWARDED_HEADERS = [
  "cache-control",
  "content-disposition",
  "content-length",
  "content-range",
  "content-type",
];

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId, documentId } = await context.params;
  const response = await fetch(
    `${getApiBaseUrl()}/v1/workspaces/${workspaceId}/documents/${documentId}/file`,
    {
      cache: "no-store",
      headers: {
        "x-user-id": session.userId,
      },
    },
  );

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as unknown;
      return NextResponse.json(data, { status: response.status });
    }
    const detail = (await response.text()).trim() || "Failed to load document file.";
    return NextResponse.json({ detail }, { status: response.status });
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = response.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers,
  });
}
