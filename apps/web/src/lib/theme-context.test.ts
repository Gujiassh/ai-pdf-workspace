import assert from "node:assert/strict";
import test from "node:test";

import {
  getInitialTheme,
  resolveTheme,
  syncTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "./theme-context";

function createStorage(initialValue: string | null = null) {
  let value = initialValue;
  const writes: Array<{ key: string; value: string }> = [];

  return {
    getItem(key: string) {
      assert.equal(key, THEME_STORAGE_KEY);
      return value;
    },
    setItem(key: string, nextValue: string) {
      writes.push({ key, value: nextValue });
      value = nextValue;
    },
    get writes() {
      return writes;
    },
  };
}

function createDocumentElement(initiallyDark = false) {
  const tokens = new Set(initiallyDark ? ["dark"] : []);

  return {
    classList: {
      contains(token: string) {
        return tokens.has(token);
      },
      toggle(token: string, force?: boolean) {
        const nextValue = force ?? !tokens.has(token);
        if (nextValue) {
          tokens.add(token);
        } else {
          tokens.delete(token);
        }
        return nextValue;
      },
    },
  };
}

test("resolveTheme accepts only persisted light and dark values", () => {
  assert.equal(resolveTheme("light"), "light");
  assert.equal(resolveTheme("dark"), "dark");
  assert.equal(resolveTheme("system"), "dark");
  assert.equal(resolveTheme(null), "dark");
  assert.equal(resolveTheme(undefined), "dark");
});

test("getInitialTheme restores a valid persisted theme", () => {
  assert.equal(getInitialTheme({ storage: createStorage("light") }), "light");
  assert.equal(getInitialTheme({ storage: createStorage("dark") }), "dark");
});

test("getInitialTheme falls back to dark for invalid or unavailable storage", () => {
  assert.equal(getInitialTheme({ storage: createStorage("invalid") }), "dark");
  assert.equal(getInitialTheme({ storage: null }), "dark");
  assert.equal(
    getInitialTheme({
      storage: {
        getItem() {
          throw new Error("storage unavailable");
        },
        setItem() {
          throw new Error("storage unavailable");
        },
      },
    }),
    "dark",
  );
});

test("syncTheme updates the document root class and persists both themes", () => {
  const documentElement = createDocumentElement(true);
  const storage = createStorage();

  syncTheme("light", { documentElement, storage });
  assert.equal(documentElement.classList.contains("dark"), false);
  assert.deepEqual(storage.writes, [{ key: THEME_STORAGE_KEY, value: "light" }]);

  syncTheme("dark", { documentElement, storage });
  assert.equal(documentElement.classList.contains("dark"), true);
  assert.deepEqual(storage.writes, [
    { key: THEME_STORAGE_KEY, value: "light" },
    { key: THEME_STORAGE_KEY, value: "dark" },
  ]);
});

test("theme helpers are safe without browser globals", () => {
  assert.equal(getInitialTheme({ storage: null }), "dark");
  assert.doesNotThrow(() => syncTheme("light", { documentElement: null, storage: null }));

  const themes: Theme[] = ["light", "dark"];
  assert.deepEqual(themes.map(resolveTheme), themes);
});
