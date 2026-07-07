import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";

export async function GET() {
  const response = await fetch(`${getApiBaseUrl()}/v1/workspaces`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        error: {
          code: "workspace_list_unavailable",
          message: "Failed to load workspaces.",
        },
      },
      { status: 502 },
    );
  }

  const data = (await response.json()) as unknown;
  return NextResponse.json(data);
}
