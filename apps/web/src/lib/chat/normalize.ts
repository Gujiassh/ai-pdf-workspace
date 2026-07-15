import type {
  ChatThread,
  Citation,
  CitationDto,
  Message,
  MessageDto,
  ThreadSummaryDto,
} from "./types";

export function toUiCitation(citation: CitationDto): Citation {
  return {
    id: citation.id,
    citationIndex: citation.citationIndex,
    documentId: citation.documentId ?? "",
    documentName: citation.documentTitle,
    pageNumber: citation.pageNumber,
    snippet: citation.excerpt,
  };
}

export function toUiMessage(message: MessageDto): Message {
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    citations: message.citations.map(toUiCitation),
    createdAt: message.createdAt,
    ...(message.parentMessageId ? { parentMessageId: message.parentMessageId } : {}),
    ...(message.status && message.status !== "completed" ? { status: message.status } : {}),
  };
}

export function toUiThread(
  thread: ThreadSummaryDto,
  emptyTitle: string,
  messages: Message[] = [],
): ChatThread {
  return {
    id: thread.id,
    workspaceId: thread.workspaceId,
    title: thread.title?.trim() || emptyTitle,
    messages,
    createdAt: thread.createdAt,
  };
}

export function toUiThreadWithMessages(
  thread: ThreadSummaryDto,
  emptyTitle: string,
  messages: MessageDto[],
): ChatThread {
  return toUiThread(thread, emptyTitle, messages.map(toUiMessage));
}

export function mergeUiThreads(
  previous: ChatThread[],
  next: ChatThread[],
  workspaceId: string,
): ChatThread[] {
  const previousById = new Map(
    previous
      .filter((thread) => thread.workspaceId === workspaceId)
      .map((thread) => [thread.id, thread]),
  );
  return [
    ...previous.filter((thread) => thread.workspaceId !== workspaceId),
    ...next.map((thread) => {
      const previousThread = previousById.get(thread.id);
      return previousThread && thread.messages.length === 0
        ? { ...thread, messages: previousThread.messages }
        : thread;
    }),
  ];
}
