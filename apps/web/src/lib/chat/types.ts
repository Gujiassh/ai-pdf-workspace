import type {
  EvidenceLocator,
  EvidenceTargetRequest,
  SourceVersions,
} from "@/lib/evidence/types";

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
  assetId: string;
  assetKind: string;
  assetTitle: string;
  sourceAvailable: boolean;
  excerpt: string;
  locator: EvidenceLocator;
  sourceVersions: SourceVersions;
};

export type InputEvidenceDto = {
  id: string;
  messageId: string;
  targetOrder: number;
  assetId: string;
  assetKind: string;
  assetTitle: string;
  sourceAvailable: boolean;
  excerpt: string;
  locator: EvidenceLocator;
  sourceVersions: SourceVersions;
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
  inputEvidence: InputEvidenceDto[];
};

export type ThreadMessagesResponseDto = {
  thread: ThreadSummaryDto;
  messages: MessageDto[];
};

export type ChatStreamRequestDto = {
  threadId: string;
  question: string;
  assetScope: AssetScope;
  selectionText?: string;
  evidenceTargets?: EvidenceTargetRequest[];
  parentMessageId?: string | null;
  editMessageId?: string;
};

export type AssetScope =
  | { mode: "all_ready" }
  | { mode: "selected"; assetIds: string[] };

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
  assetId: string;
  assetKind: string;
  assetTitle: string;
  sourceAvailable: boolean;
  excerpt: string;
  locator: EvidenceLocator;
  sourceVersions: SourceVersions;
};

export type InputEvidence = {
  id: string;
  messageId: string;
  targetOrder: number;
  assetId: string;
  assetKind: string;
  assetTitle: string;
  sourceAvailable: boolean;
  excerpt: string;
  locator: EvidenceLocator;
  sourceVersions: SourceVersions;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  inputEvidence?: InputEvidence[];
  pendingInputEvidenceCount?: number;
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
