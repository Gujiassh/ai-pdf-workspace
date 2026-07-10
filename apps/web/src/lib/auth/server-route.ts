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
