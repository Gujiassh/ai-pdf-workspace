import type { AuthApiUser, AuthErrorPayload, AuthUser } from "./types";

export function normalizeAuthUser(user: AuthApiUser): AuthUser {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

export function getAuthErrorMessage(
  payload: AuthErrorPayload | undefined,
  fallback: string,
): string {
  return payload?.error?.message ?? payload?.detail ?? fallback;
}
