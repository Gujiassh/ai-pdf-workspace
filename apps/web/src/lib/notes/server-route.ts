import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { readRequiredServerSession, unauthorizedResponse } from "@/lib/auth/server-route";

export async function proxyNotesRequest(
  request: Request,
  apiPath: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = request.method as "GET" | "POST" | "PATCH" | "DELETE",
) {
  const session = await readRequiredServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const headers: Record<string, string> = { "x-user-id": session.userId };
  let body: string | undefined;
  if (method === "POST" || method === "PATCH") {
    headers["Content-Type"] = request.headers.get("content-type") ?? "application/json";
    body = await request.text();
  }

  const response = await fetch(`${getApiBaseUrl()}${apiPath}`, {
    method,
    cache: "no-store",
    headers,
    body,
  });

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as unknown;
    return NextResponse.json(data, { status: response.status });
  }

  const detail = (await response.text()).trim();
  return NextResponse.json(
    detail ? { detail } : { detail: "Notes request failed." },
    { status: response.status },
  );
}
