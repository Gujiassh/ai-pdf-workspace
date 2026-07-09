import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";

export async function POST(request: Request) {
  const body = await request.json();
  const response = await fetch(`${getApiBaseUrl()}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
