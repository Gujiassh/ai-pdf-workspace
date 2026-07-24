import assert from "node:assert/strict";
import test from "node:test";

import { buildImageStreamApiUrl, proxyImageStreamResponse } from "./image-stream";

test("image stream BFF keeps current and frozen upstream contracts separate", () => {
  const current = buildImageStreamApiUrl("http://api:8000", "workspace/id", "asset/id", {
    mode: "current",
    processingGeneration: "7",
  });
  assert.match(current.pathname, /current-image-oriented\/file$/);
  assert.equal(current.searchParams.get("processingGeneration"), "7");
  assert.equal(current.searchParams.has("evidenceRepresentationId"), false);

  const frozen = buildImageStreamApiUrl("http://api:8000", "workspace/id", "asset/id", {
    mode: "frozen",
    processingGeneration: "3",
    evidenceRepresentationId: "caption/id",
  });
  assert.match(frozen.pathname, /image-oriented\/file$/);
  assert.equal(frozen.searchParams.get("processingGeneration"), "3");
  assert.equal(frozen.searchParams.get("evidenceRepresentationId"), "caption/id");
});

test("image stream BFF preserves drift errors and safe image headers", async () => {
  const drift = await proxyImageStreamResponse(new Response(
    JSON.stringify({ detail: "Current image representation changed." }),
    { status: 409, headers: { "content-type": "application/json" } },
  ));
  assert.equal(drift.status, 409);
  assert.deepEqual(await drift.json(), { detail: "Current image representation changed." });

  const success = await proxyImageStreamResponse(new Response("png", {
    status: 200,
    headers: {
      "cache-control": "private, max-age=3600",
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
      "x-private-upstream": "must-not-leak",
    },
  }));
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("content-type"), "image/png");
  assert.equal(success.headers.get("cache-control"), "private, max-age=3600");
  assert.equal(success.headers.get("x-content-type-options"), "nosniff");
  assert.equal(success.headers.has("x-private-upstream"), false);
});
