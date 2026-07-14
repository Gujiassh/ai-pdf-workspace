import type {
  CreateNoteRequestDto,
  CreateNoteResponseDto,
  CreateTagRequestDto,
  CreateTagResponseDto,
  NoteListResponseDto,
  NoteDto,
  TagBindingsRequestDto,
  TagListResponseDto,
} from "./types";

export class NotesApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "NotesApiError";
    this.status = status;
  }
}

type ErrorPayload = {
  detail?: string;
  error?: { message?: string };
};

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
  const value = payload as ErrorPayload;
  return value.error?.message ?? value.detail ?? fallback;
}

async function expectJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new NotesApiError(getErrorMessage(payload, fallback), response.status);
  }
  if (payload === undefined) {
    throw new NotesApiError(fallback, response.status);
  }
  return payload as T;
}

function workspacePath(workspaceId: string): string {
  return encodeURIComponent(workspaceId);
}

export async function listNotes(workspaceId: string): Promise<NoteListResponseDto> {
  const response = await fetch(`/api/workspaces/${workspacePath(workspaceId)}/notes`, {
    cache: "no-store",
  });
  return expectJson<NoteListResponseDto>(response, "Failed to load notes.");
}

export async function createNote(
  workspaceId: string,
  payload: CreateNoteRequestDto,
): Promise<CreateNoteResponseDto> {
  const response = await fetch(`/api/workspaces/${workspacePath(workspaceId)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return expectJson<CreateNoteResponseDto>(response, "Failed to create note.");
}

export async function updateNote(
  workspaceId: string,
  noteId: string,
  payload: { title?: string | null; bodyMd?: string; isPinned?: boolean },
): Promise<{ note: NoteDto }> {
  const response = await fetch(
    `/api/workspaces/${workspacePath(workspaceId)}/notes/${encodeURIComponent(noteId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return expectJson<{ note: NoteDto }>(response, "Failed to update note.");
}

export async function deleteNote(workspaceId: string, noteId: string): Promise<void> {
  const response = await fetch(
    `/api/workspaces/${workspacePath(workspaceId)}/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const payload = await readPayload(response);
    throw new NotesApiError(getErrorMessage(payload, "Failed to delete note."), response.status);
  }
}

export async function updateTag(
  workspaceId: string,
  tagId: string,
  payload: { name?: string; slug?: string; color?: string | null },
): Promise<CreateTagResponseDto> {
  const response = await fetch(
    `/api/workspaces/${workspacePath(workspaceId)}/tags/${encodeURIComponent(tagId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return expectJson<CreateTagResponseDto>(response, "Failed to update tag.");
}

export async function deleteTag(workspaceId: string, tagId: string): Promise<void> {
  const response = await fetch(
    `/api/workspaces/${workspacePath(workspaceId)}/tags/${encodeURIComponent(tagId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const payload = await readPayload(response);
    throw new NotesApiError(getErrorMessage(payload, "Failed to delete tag."), response.status);
  }
}

export async function listTags(workspaceId: string): Promise<TagListResponseDto> {
  const response = await fetch(`/api/workspaces/${workspacePath(workspaceId)}/tags`, {
    cache: "no-store",
  });
  return expectJson<TagListResponseDto>(response, "Failed to load tags.");
}

export async function createTag(
  workspaceId: string,
  payload: CreateTagRequestDto,
): Promise<CreateTagResponseDto> {
  const response = await fetch(`/api/workspaces/${workspacePath(workspaceId)}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return expectJson<CreateTagResponseDto>(response, "Failed to create tag.");
}

async function replaceBindings(
  path: string,
  payload: TagBindingsRequestDto,
  fallback: string,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await readPayload(response);
    throw new NotesApiError(getErrorMessage(errorPayload, fallback), response.status);
  }
}

export function setDocumentTags(
  workspaceId: string,
  documentId: string,
  tagIds: string[],
): Promise<void> {
  return replaceBindings(
    `/api/workspaces/${workspacePath(workspaceId)}/documents/${encodeURIComponent(documentId)}/tags`,
    { tagIds },
    "Failed to update document tags.",
  );
}

export function setNoteTags(workspaceId: string, noteId: string, tagIds: string[]): Promise<void> {
  return replaceBindings(
    `/api/workspaces/${workspacePath(workspaceId)}/notes/${encodeURIComponent(noteId)}/tags`,
    { tagIds },
    "Failed to update note tags.",
  );
}
