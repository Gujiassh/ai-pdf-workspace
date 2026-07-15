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

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await readServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId } = await context.params;
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}`, {
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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await readServerSession();
  if (!session) {
    return unauthorizedResponse();
  }

  const { workspaceId } = await context.params;
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}`, {
    method: "DELETE",
    cache: "no-store",
    headers: {
      ...buildApiHeaders(session.userId),
    },
  });

  if (!response.ok) {
    const data = (await response.json()) as unknown;
    return NextResponse.json(data, { status: response.status });
  }

  return new NextResponse(null, { status: 204 });
}
