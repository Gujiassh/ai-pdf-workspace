import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "ai_pdf_workspace_session";
const SESSION_EXPIRES_IN = "7d";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string;
};

function getSessionSecret(): Uint8Array {
  const secret = process.env.AI_PDF_SESSION_SECRET;
  if (!secret) {
    throw new Error("AI_PDF_SESSION_SECRET is required for auth session signing.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRES_IN)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      avatarUrl: String(payload.avatarUrl),
    };
  } catch {
    return null;
  }
}

export { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE_SECONDS };
export type { SessionPayload };
