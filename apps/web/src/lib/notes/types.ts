import type {
  EvidenceLocator,
  EvidenceTargetRequest,
  SourceVersions,
} from "@/lib/evidence/types";

export type NoteSourceDto = {
  id: string;
  messageCitationId: string | null;
  assetId: string;
  assetKind: string;
  assetTitle: string;
  sourceAvailable: boolean;
  excerpt: string;
  locator: EvidenceLocator;
  sourceVersions: SourceVersions;
  createdAt: string;
};

export type NoteDto = {
  id: string;
  workspaceId: string;
  title: string | null;
  bodyMd: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  sources: NoteSourceDto[];
  tagIds: string[];
};

export type NoteListResponseDto = { items: NoteDto[]; nextCursor: string | null };
export type CreateNoteRequestDto = {
  title?: string | null;
  bodyMd: string;
  sourceCitationIds?: string[];
  evidenceTargets?: EvidenceTargetRequest[];
};
export type CreateNoteResponseDto = { note: NoteDto; sources: NoteSourceDto[] };
export type UpdateNoteRequestDto = { title?: string | null; bodyMd?: string; isPinned?: boolean };

export type TagDto = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: string;
  assetIds?: string[];
  noteIds?: string[];
};

export type TagListResponseDto = { items: TagDto[]; nextCursor: string | null };
export type CreateTagRequestDto = { name: string; slug?: string; color?: string | null };
export type CreateTagResponseDto = { tag: TagDto };
export type TagBindingsRequestDto = { tagIds: string[] };
