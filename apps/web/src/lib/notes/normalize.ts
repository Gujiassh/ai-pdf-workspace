import type { Document, Note, Tag } from "@/lib/workspace-context";

import type { NoteDto, NoteSourceDto, TagDto } from "./types";

export function toUiTag(tag: TagDto): Tag {
  return {
    id: tag.id,
    workspaceId: tag.workspaceId,
    name: tag.name,
    color: tag.color ?? "#71717a",
  };
}

export function toUiNote(note: NoteDto, tagsById: Map<string, Tag>): Note {
  const source = note.sources.find(
    (item: NoteSourceDto) => item.documentId && item.pageNumber !== null,
  );
  return {
    id: note.id,
    workspaceId: note.workspaceId,
    title: note.title?.trim() || "Untitled note",
    content: note.bodyMd,
    source:
      source?.documentId && source.pageNumber !== null
        ? {
            messageCitationId: source.messageCitationId ?? undefined,
            documentId: source.documentId,
            documentName: source.documentTitle ?? "Document",
            pageNumber: source.pageNumber,
            snippet: source.excerpt ?? "",
          }
        : undefined,
    tags: note.tagIds
      .map((tagId) => tagsById.get(tagId)?.name)
      .filter((name): name is string => Boolean(name)),
    createdAt: note.createdAt,
  };
}

export function applyDocumentTags(documents: Document[], tags: TagDto[]): Document[] {
  const tagNamesByDocumentId = new Map<string, string[]>();
  for (const tag of tags) {
    for (const documentId of tag.documentIds ?? []) {
      const names = tagNamesByDocumentId.get(documentId) ?? [];
      names.push(tag.name);
      tagNamesByDocumentId.set(documentId, names);
    }
  }
  return documents.map((document) => ({
    ...document,
    tags: tagNamesByDocumentId.get(document.id) ?? [],
  }));
}
