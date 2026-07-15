export type ThreadSummaryDto = {
  id: string;
  workspaceId: string;
  title: string | null;
  lastMessageAt: string;
  createdAt: string;
};

export type ThreadListResponseDto = {
  items: ThreadSummaryDto[];
  nextCursor: string | null;
};

export type CreateThreadResponseDto = {
  thread: ThreadSummaryDto;
};

export type CitationDto = {
  id: string;
  messageId: string;
  citationIndex: number;
  documentId: string | null;
  documentTitle: string;
  pageNumber: number;
  chunkId: string | null;
  excerpt: string;
};

export type MessageDto = {
  id: string;
  workspaceId: string;
  threadId: string;
  parentMessageId?: string | null;
  role: string;
  content: string;
  status: string;
  modelProvider: string | null;
  modelName: string | null;
  createdAt: string;
  citations: CitationDto[];
};

export type ThreadMessagesResponseDto = {
  thread: ThreadSummaryDto;
  messages: MessageDto[];
};

export type ChatStreamRequestDto = {
  threadId: string;
  question: string;
  selectionText?: string;
  parentMessageId?: string | null;
  editMessageId?: string;
};

export type ChatStreamMetaDto = {
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
};

export type ChatStreamDeltaDto = {
  text: string;
};

export type ChatStreamCitationsDto = {
  items: CitationDto[];
};

export type ChatStreamDoneDto = {
  threadId: string;
  assistantMessageId: string;
};

export type ChatStreamErrorDto = {
  code: string;
  message: string;
};

export type Citation = {
  id: string;
  citationIndex: number;
  documentId: string;
  documentName: string;
  pageNumber: number;
  snippet: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  createdAt: string;
  parentMessageId?: string | null;
  status?: string;
};

export type ChatThread = {
  id: string;
  workspaceId: string;
  title: string;
  messages: Message[];
  createdAt: string;
};
