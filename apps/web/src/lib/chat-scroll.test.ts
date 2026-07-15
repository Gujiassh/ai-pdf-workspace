import assert from "node:assert/strict";
import test from "node:test";

import { isNearChatBottom } from "./chat-scroll";

test("chat scroll treats the viewport at or near the bottom as following output", () => {
  assert.equal(isNearChatBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 }), true);
  assert.equal(isNearChatBottom({ scrollHeight: 1000, scrollTop: 552, clientHeight: 400 }), true);
});

test("chat scroll stops following after the user moves away from the bottom", () => {
  assert.equal(isNearChatBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }), false);
});
