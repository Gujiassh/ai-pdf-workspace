import test from "node:test";
import assert from "node:assert/strict";

import { getAuthErrorMessage, normalizeAuthUser } from "./normalize";

test("normalizeAuthUser maps backend user payload to session user", () => {
  assert.deepEqual(
    normalizeAuthUser({
      id: "user_123",
      email: "demo@example.com",
      name: "Demo",
      avatarUrl: "https://example.com/avatar.svg",
    }),
    {
      userId: "user_123",
      email: "demo@example.com",
      name: "Demo",
      avatarUrl: "https://example.com/avatar.svg",
    },
  );
});

test("getAuthErrorMessage prefers nested error message then detail then fallback", () => {
  assert.equal(
    getAuthErrorMessage(
      { error: { message: "Invalid credentials." }, detail: "Wrong email." },
      "Fallback",
    ),
    "Invalid credentials.",
  );

  assert.equal(getAuthErrorMessage({ detail: "Wrong email." }, "Fallback"), "Wrong email.");
  assert.equal(getAuthErrorMessage(undefined, "Fallback"), "Fallback");
});
