import assert from "node:assert/strict";
import test from "node:test";

import { getNoteCardClassName } from "./notes-panel";

test("editing note cards use a stable high-contrast surface without card hover colors", () => {
  const className = getNoteCardClassName(true);

  assert.match(className, /bg-white/);
  assert.match(className, /dark:bg-zinc-900/);
  assert.doesNotMatch(className, /hover:bg-/);
});

test("read-only note cards define hover surfaces for both themes", () => {
  const className = getNoteCardClassName(false);

  assert.match(className, /hover:bg-zinc-50\/70/);
  assert.match(className, /dark:hover:bg-zinc-900\/50/);
});
