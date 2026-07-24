import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./image-region-actions.tsx", import.meta.url), "utf8");

test("image region actions preserve selection on failure and expose bounded feedback", () => {
  assert.match(source, /const \[pendingAction, setPendingAction\]/);
  assert.match(source, /const \[error, setError\]/);
  assert.match(source, /data-image-region-ask/);
  assert.match(source, /data-image-region-note/);
  assert.match(source, /role="alert"/);
  assert.doesNotMatch(source, /setSelection/);
});
