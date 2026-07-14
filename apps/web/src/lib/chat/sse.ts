import type {
  ChatStreamCitationsDto,
  ChatStreamDeltaDto,
  ChatStreamDoneDto,
  ChatStreamMetaDto,
  CitationDto,
} from "./types";

export type ParsedSseEvent = {
  name: string;
  data: unknown;
};

export type ChatStreamHandlers = {
  onMeta?: (payload: ChatStreamMetaDto) => void;
  onDelta?: (payload: ChatStreamDeltaDto) => void;
  onCitations?: (payload: ChatStreamCitationsDto) => void;
  onDone?: (payload: ChatStreamDoneDto) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isCitation(value: unknown): value is CitationDto {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.messageId) &&
    typeof value.citationIndex === "number" &&
    (value.documentId === null || isString(value.documentId)) &&
    isString(value.documentTitle) &&
    typeof value.pageNumber === "number" &&
    (value.chunkId === null || isString(value.chunkId)) &&
    isString(value.excerpt)
  );
}

function parseEventBlock(block: string): ParsedSseEvent | null {
  let name = "message";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    if (field === "event") {
      name = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join("\n");
  try {
    return { name, data: JSON.parse(rawData) as unknown };
  } catch {
    return { name, data: rawData };
  }
}

export function parseSseEvents(input: string): {
  events: ParsedSseEvent[];
  remainder: string;
} {
  const events: ParsedSseEvent[] = [];
  let remainder = input;

  while (true) {
    const separator = /\r?\n\r?\n/.exec(remainder);
    if (!separator || separator.index === undefined) {
      break;
    }

    const block = remainder.slice(0, separator.index);
    remainder = remainder.slice(separator.index + separator[0].length);
    const event = parseEventBlock(block);
    if (event) {
      events.push(event);
    }
  }

  return { events, remainder };
}

function dispatchEvent(event: ParsedSseEvent, handlers: ChatStreamHandlers): void {
  if (event.name === "meta" && isRecord(event.data)) {
    if (isString(event.data.threadId) && isString(event.data.userMessageId) && isString(event.data.assistantMessageId)) {
      handlers.onMeta?.(event.data as unknown as ChatStreamMetaDto);
    }
    return;
  }

  if (event.name === "delta" && isRecord(event.data) && isString(event.data.text)) {
    handlers.onDelta?.(event.data as unknown as ChatStreamDeltaDto);
    return;
  }

  if (event.name === "citations" && isRecord(event.data) && Array.isArray(event.data.items)) {
    const items = event.data.items.filter(isCitation);
    handlers.onCitations?.({ items });
    return;
  }

  if (event.name === "done" && isRecord(event.data)) {
    if (isString(event.data.threadId) && isString(event.data.assistantMessageId)) {
      handlers.onDone?.(event.data as unknown as ChatStreamDoneDto);
    }
  }
}

export async function consumeChatStream(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<void> {
  if (!response.body) {
    throw new Error("Chat stream did not return a response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
    } else if (done) {
      buffer += decoder.decode();
    }

    const parsed = parseSseEvents(buffer);
    buffer = parsed.remainder;
    for (const event of parsed.events) {
      dispatchEvent(event, handlers);
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    const final = parseSseEvents(`${buffer}\n\n`);
    for (const event of final.events) {
      dispatchEvent(event, handlers);
    }
  }
}
