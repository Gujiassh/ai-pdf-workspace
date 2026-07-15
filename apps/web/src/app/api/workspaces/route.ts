import { buildApiHeaders } from "@/lib/auth/server-route";
import { NextResponse } from "next/server";

import { readServerSession } from "@/lib/auth/server-session";
import { getApiBaseUrl } from "@/lib/api-base-url";

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: {
        code: "auth_required",
        message: "Authentication required.",
      },
    },
    { status: 401 },
  );
}

export async function GET() {
  const session = await readServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces`, {
    cache: "no-store",
    headers: {
      ...buildApiHeaders(session.userId),
    },
  });

  const data = (await response.json()) as unknown;
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const session = await readServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const body = await request.json();
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces`, {
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
