import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces/${workspaceId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      return NextResponse.json(
        {
          error: {
            code: "workspace_not_found",
            message: "Workspace not found.",
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "workspace_detail_unavailable",
          message: "Failed to load workspace detail.",
        },
      },
      { status: 502 },
    );
  }

  const data = (await response.json()) as unknown;
  return NextResponse.json(data);
}
