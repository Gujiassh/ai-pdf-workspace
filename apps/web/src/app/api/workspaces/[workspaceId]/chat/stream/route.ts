import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { buildApiHeaders, readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";

const FORWARDED_HEADERS = ["cache-control", "connection", "content-type", "x-accel-buffering"];

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId } = await context.params;
  const requestInit: RequestInit & { duplex?: "half" } = {
    method: "POST",
    cache: "no-store",
    headers: {
      "Accept": "text/event-stream",
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      ...buildApiHeaders(session.userId),
    },
    body: request.body,
    duplex: "half",
  };
  const response = await fetch(
    `${getApiBaseUrl()}/v1/workspaces/${workspaceId}/chat/stream`,
    requestInit,
  );

  const headers = new Headers();
  for (const header of FORWARDED_HEADERS) {
    const value = response.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/event-stream; charset=utf-8");
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers,
  });
}
