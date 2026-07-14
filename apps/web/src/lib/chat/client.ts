import type {
  ChatStreamRequestDto,
  CreateThreadResponseDto,
  ThreadListResponseDto,
  ThreadMessagesResponseDto,
} from "./types";

export type ChatApiErrorPayload = {
  detail?: string;
  error?: {
    message?: string;
  };
};

export class ChatApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
  }
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const value = payload as ChatApiErrorPayload;
  return value.error?.message ?? value.detail ?? fallback;
}

async function expectJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new ChatApiError(getErrorMessage(payload, fallback), response.status);
  }
  if (payload === undefined) {
    throw new ChatApiError(fallback, response.status);
  }
  return payload as T;
}

function workspacePath(workspaceId: string): string {
  return encodeURIComponent(workspaceId);
}

export async function listThreads(workspaceId: string): Promise<ThreadListResponseDto> {
  const response = await fetch(`/api/workspaces/${workspacePath(workspaceId)}/threads`, {
    cache: "no-store",
  });
  return expectJson<ThreadListResponseDto>(response, "Failed to load chat threads.");
}

export async function createThread(
  workspaceId: string,
  title?: string,
): Promise<CreateThreadResponseDto> {
  const response = await fetch(`/api/workspaces/${workspacePath(workspaceId)}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(title ? { title } : {}),
  });
  return expectJson<CreateThreadResponseDto>(response, "Failed to create chat thread.");
}

export async function getThreadMessages(
  workspaceId: string,
  threadId: string,
): Promise<ThreadMessagesResponseDto> {
  const response = await fetch(
    `/api/workspaces/${workspacePath(workspaceId)}/threads/${encodeURIComponent(threadId)}/messages`,
    { cache: "no-store" },
  );
  return expectJson<ThreadMessagesResponseDto>(response, "Failed to load chat messages.");
}

export async function startChatStream(
  workspaceId: string,
  payload: ChatStreamRequestDto,
): Promise<Response> {
  const response = await fetch(`/api/workspaces/${workspacePath(workspaceId)}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await readPayload(response);
    throw new ChatApiError(getErrorMessage(errorPayload, "Failed to send chat message."), response.status);
  }

  return response;
}


export async function deleteThread(workspaceId: string, threadId: string): Promise<void> {
  const response = await fetch(
    `/api/workspaces/${workspacePath(workspaceId)}/threads/${encodeURIComponent(threadId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const payload = await readPayload(response);
    throw new ChatApiError(getErrorMessage(payload, "Failed to archive chat thread."), response.status);
  }
}
