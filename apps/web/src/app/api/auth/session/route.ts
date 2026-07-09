import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const session = await verifySessionToken(token);
  if (!session) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({ user: session }, { status: 200 });
}
