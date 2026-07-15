import { NextResponse } from "next/server";

import { readServerSession } from "@/lib/auth/server-session";

export function unauthorizedResponse() {
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

export async function readRequiredServerSession() {
  return readServerSession();
}


const DEFAULT_API_INTERNAL_TOKEN = "local-development-internal-token";

export function buildApiHeaders(
  userId: string,
  additionalHeaders: Record<string, string> = {},
): Record<string, string> {
  return {
    "x-user-id": userId,
    "x-ai-pdf-internal-token": process.env.AI_PDF_API_INTERNAL_TOKEN ?? DEFAULT_API_INTERNAL_TOKEN,
    ...additionalHeaders,
  };
}
