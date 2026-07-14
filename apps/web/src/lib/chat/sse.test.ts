import assert from "node:assert/strict";
import test from "node:test";

import { consumeChatStream, parseSseEvents } from "./sse";

test("SSE parser retains incomplete frames across chunks", () => {
  const first = parseSseEvents('event: delta\ndata: {"text":"first"');
  assert.deepEqual(first.events, []);

  const second = parseSseEvents(`${first.remainder}}\n\nevent: unknown\ndata: {"ignored":true}\n\n`);
  assert.deepEqual(second.events, [
    { name: "delta", data: { text: "first" } },
    { name: "unknown", data: { ignored: true } },
  ]);
  assert.equal(second.remainder, "");
});

test("chat stream dispatch ignores unknown events and handles split response chunks", async () => {
  const chunks = [
    'event: meta\ndata: {"threadId":"thread_1","userMessageId":"user_1",',
    '"assistantMessageId":"assistant_1"}\n\nevent: mystery\ndata: {"value":1}\n\n',
    'event: delta\ndata: {"text":"Hello"}\n\nevent: delta\ndata: {"text":" world"}\n\n',
    'event: citations\ndata: {"items":[]}\n\nevent: done\ndata: {"threadId":"thread_1","assistantMessageId":"assistant_1"}\n\n',
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  const events: string[] = [];
  await consumeChatStream(new Response(stream), {
    onMeta: (payload) => events.push(`meta:${payload.assistantMessageId}`),
    onDelta: (payload) => events.push(`delta:${payload.text}`),
    onCitations: () => events.push("citations"),
    onDone: (payload) => events.push(`done:${payload.threadId}`),
  });

  assert.deepEqual(events, [
    "meta:assistant_1",
    "delta:Hello",
    "delta: world",
    "citations",
    "done:thread_1",
  ]);
});
