"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { AuthUser } from "@/lib/auth/types";
import {
  createNote as createNoteApi,
  createTag as createTagApi,
  deleteNote as deleteNoteApi,
  deleteTag as deleteTagApi,
  listNotes,
  listTags,
  setDocumentTags,
  setNoteTags,
  updateNote as updateNoteApi,
} from "@/lib/notes/client";
import { toUiNote, toUiTag } from "@/lib/notes/normalize";
import type { TagDto } from "@/lib/notes/types";
import type { Document, Note, NoteSource, Tag, Workspace } from "./workspace-context";

export function getNextTagIds(currentTagIds: string[], toggledTagId: string): string[] {
  return currentTagIds.includes(toggledTagId)
    ? currentTagIds.filter((tagId) => tagId !== toggledTagId)
    : [...currentTagIds, toggledTagId];
}

export function updateDocumentTagRelations(
  relations: TagDto[],
  workspaceId: string,
  documentId: string,
  nextTagIds: string[],
): TagDto[] {
  return relations.map((relation) => ({
    ...relation,
    documentIds:
      relation.workspaceId !== workspaceId
        ? relation.documentIds
        : nextTagIds.includes(relation.id)
          ? [...new Set([...(relation.documentIds ?? []).filter((id) => id !== documentId), documentId])]
          : (relation.documentIds ?? []).filter((id) => id !== documentId),
  }));
}

export function updateNoteTagRelations(
  relations: TagDto[],
  workspaceId: string,
  noteId: string,
  nextTagIds: string[],
): TagDto[] {
  return relations.map((relation) => ({
    ...relation,
    noteIds:
      relation.workspaceId !== workspaceId
        ? relation.noteIds
        : nextTagIds.includes(relation.id)
          ? [...new Set([...(relation.noteIds ?? []).filter((id) => id !== noteId), noteId])]
          : (relation.noteIds ?? []).filter((id) => id !== noteId),
  }));
}

type UseNotesTagsOptions = {
  user: AuthUser | null;
  isAuthHydrating: boolean;
  currentWorkspaceId: string;
  currentWorkspaceIdRef: MutableRefObject<string>;
  tagRelationsRef: MutableRefObject<TagDto[]>;
  documentsRef: MutableRefObject<Document[]>;
  setSelectedTagIds: Dispatch<SetStateAction<string[]>>;
  applyDocumentTags: (workspaceId: string, relations: TagDto[]) => void;
  updateDocumentTags: (documentId: string, tagNames: string[]) => void;
  removeDocumentTagName: (workspaceId: string, tagName: string) => void;
  updateWorkspace: (workspaceId: string, updater: (workspace: Workspace) => Workspace) => void;
};

export function useNotesTags({
  user,
  isAuthHydrating,
  currentWorkspaceId,
  currentWorkspaceIdRef,
  tagRelationsRef,
  documentsRef,
  setSelectedTagIds,
  applyDocumentTags,
  updateDocumentTags,
  removeDocumentTagName,
  updateWorkspace,
}: UseNotesTagsOptions) {
  const [notes, setNotesState] = useState<Note[]>([]);
  const [tags, setTagsState] = useState<Tag[]>([]);
  const notesRef = useRef(notes);
  const tagsRef = useRef(tags);

  const setNotes: Dispatch<SetStateAction<Note[]>> = useCallback(
    (update) => {
      setNotesState((previous) => {
        const nextNotes = typeof update === "function" ? update(previous) : update;
        notesRef.current = nextNotes;
        return nextNotes;
      });
    },
    [],
  );

  const setTags: Dispatch<SetStateAction<Tag[]>> = useCallback(
    (update) => {
      setTagsState((previous) => {
        const nextTags = typeof update === "function" ? update(previous) : update;
        tagsRef.current = nextTags;
        return nextTags;
      });
    },
    [],
  );

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateNotesAndTags() {
      if (isAuthHydrating) {
        return;
      }
      if (!user) {
        setNotes([]);
        setTags([]);
        tagRelationsRef.current = [];
        return;
      }
      if (!currentWorkspaceId) {
        return;
      }

      const workspaceId = currentWorkspaceId;
      try {
        const [notesPayload, tagsPayload] = await Promise.all([
          listNotes(workspaceId),
          listTags(workspaceId),
        ]);
        if (cancelled) {
          return;
        }

        const workspaceTags = tagsPayload.items.map(toUiTag);
        const tagsById = new Map(workspaceTags.map((tag) => [tag.id, tag]));
        const workspaceNotes = notesPayload.items.map((note) => toUiNote(note, tagsById));
        tagRelationsRef.current = [
          ...tagRelationsRef.current.filter((tag) => tag.workspaceId !== workspaceId),
          ...tagsPayload.items,
        ];
        setTags((previous) => [
          ...previous.filter((tag) => tag.workspaceId !== workspaceId),
          ...workspaceTags,
        ]);
        setNotes((previous) => [
          ...previous.filter((note) => note.workspaceId !== workspaceId),
          ...workspaceNotes,
        ]);
        applyDocumentTags(workspaceId, tagRelationsRef.current);
        updateWorkspace(workspaceId, (workspace) => ({
          ...workspace,
          noteCount: workspaceNotes.length,
        }));
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    }

    void hydrateNotesAndTags();

    return () => {
      cancelled = true;
    };
  }, [applyDocumentTags, currentWorkspaceId, isAuthHydrating, setNotes, setTags, updateWorkspace, user, tagRelationsRef]);

  const removeWorkspace = useCallback(
    (workspaceId: string) => {
      setNotes((previous) => previous.filter((note) => note.workspaceId !== workspaceId));
      setTags((previous) => previous.filter((tag) => tag.workspaceId !== workspaceId));
      tagRelationsRef.current = tagRelationsRef.current.filter((tag) => tag.workspaceId !== workspaceId);
    },
    [setNotes, setTags, tagRelationsRef],
  );

  const createNote = useCallback(
    async (title: string, content: string, source?: NoteSource) => {
      const workspaceId = currentWorkspaceId;
      if (!workspaceId) {
        return;
      }

      const payload = await createNoteApi(workspaceId, {
        title: title.trim() || null,
        bodyMd: content,
        sourceCitationIds: source?.messageCitationId ? [source.messageCitationId] : [],
      });
      const tagsById = new Map(tagsRef.current.map((tag) => [tag.id, tag]));
      const newNote = toUiNote(payload.note, tagsById);
      setNotes((previous) => [newNote, ...previous.filter((note) => note.id !== newNote.id)]);
      updateWorkspace(workspaceId, (workspace) => ({
        ...workspace,
        noteCount: workspace.noteCount + 1,
      }));
    },
    [currentWorkspaceId, setNotes, updateWorkspace],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      const workspaceId = currentWorkspaceId;
      if (!workspaceId || !notesRef.current.some((note) => note.id === id && note.workspaceId === workspaceId)) {
        return;
      }

      await deleteNoteApi(workspaceId, id);
      setNotes((previous) => previous.filter((note) => note.id !== id));
      updateWorkspace(workspaceId, (workspace) => ({
        ...workspace,
        noteCount: Math.max(0, workspace.noteCount - 1),
      }));
    },
    [currentWorkspaceId, setNotes, updateWorkspace],
  );

  const updateNote = useCallback(
    async (id: string, title: string, content: string) => {
      const workspaceId = currentWorkspaceId;
      if (!workspaceId || !notesRef.current.some((note) => note.id === id && note.workspaceId === workspaceId)) {
        return;
      }

      const payload = await updateNoteApi(workspaceId, id, {
        title: title.trim() || null,
        bodyMd: content,
      });
      const tagsById = new Map(tagsRef.current.map((tag) => [tag.id, tag]));
      const updatedNote = toUiNote(payload.note, tagsById);
      setNotes((previous) => previous.map((note) => note.id === id ? updatedNote : note));
    },
    [currentWorkspaceId, setNotes],
  );

  const addTag = useCallback(
    async (name: string) => {
      const workspaceId = currentWorkspaceId;
      if (!workspaceId) {
        return;
      }
      const trimmedName = name.trim();
      const normalizedName = trimmedName.toLowerCase();
      if (!normalizedName || tagsRef.current.some((tag) => tag.workspaceId === workspaceId && tag.name.toLowerCase() === normalizedName)) {
        return;
      }

      const colors = ["#818cf8", "#22d3ee", "#34d399", "#fbbf24", "#f87171", "#c084fc", "#f472b6"];
      const payload = await createTagApi(workspaceId, {
        name: trimmedName,
        slug: normalizedName.replace(/\s+/g, "-"),
        color: colors[tagsRef.current.length % colors.length],
      });
      const newTag = toUiTag(payload.tag);
      tagRelationsRef.current = [
        ...tagRelationsRef.current.filter((tag) => tag.id !== newTag.id),
        { ...payload.tag, documentIds: [], noteIds: [] },
      ];
      setTags((previous) => [...previous.filter((tag) => tag.id !== newTag.id), newTag]);
    },
    [currentWorkspaceId, setTags, tagRelationsRef],
  );

  const deleteTag = useCallback(
    async (id: string) => {
      const workspaceId = currentWorkspaceId;
      const deletedTag = tagsRef.current.find((tag) => tag.id === id && tag.workspaceId === workspaceId);
      if (!workspaceId || !deletedTag) {
        return;
      }

      await deleteTagApi(workspaceId, id);
      tagRelationsRef.current = tagRelationsRef.current.filter((tag) => tag.id !== id);
      setTags((previous) => previous.filter((tag) => tag.id !== id));
      setSelectedTagIds((previous) => previous.filter((tagId) => tagId !== id));
      removeDocumentTagName(workspaceId, deletedTag.name);
      setNotes((previous) => previous.map((note) => ({
        ...note,
        tags: note.workspaceId === workspaceId
          ? note.tags.filter((tagName) => tagName !== deletedTag.name)
          : note.tags,
      })));
    },
    [currentWorkspaceId, removeDocumentTagName, setNotes, setSelectedTagIds, setTags, tagRelationsRef],
  );

  const toggleDocumentTag = useCallback(
    async (documentId: string, tagName: string) => {
      const workspaceId = currentWorkspaceIdRef.current;
      const document = documentsRef.current.find((item) => item.id === documentId && item.workspaceId === workspaceId);
      const tag = tagsRef.current.find((item) => item.workspaceId === workspaceId && item.name === tagName);
      if (!workspaceId || !document || !tag) {
        return;
      }

      const currentTagIds = tagsRef.current
        .filter((item) => item.workspaceId === workspaceId && document.tags.includes(item.name))
        .map((item) => item.id);
      const nextTagIds = getNextTagIds(currentTagIds, tag.id);
      await setDocumentTags(workspaceId, documentId, nextTagIds);
      tagRelationsRef.current = updateDocumentTagRelations(
        tagRelationsRef.current,
        workspaceId,
        documentId,
        nextTagIds,
      );
      applyDocumentTags(workspaceId, tagRelationsRef.current);
      updateDocumentTags(
        documentId,
        nextTagIds
          .map((tagId) => tagsRef.current.find((candidate) => candidate.id === tagId)?.name)
          .filter((name): name is string => Boolean(name)),
      );
    },
    [applyDocumentTags, currentWorkspaceIdRef, documentsRef, updateDocumentTags, tagRelationsRef],
  );

  const toggleNoteTag = useCallback(
    async (noteId: string, tagName: string) => {
      const workspaceId = currentWorkspaceIdRef.current;
      const note = notesRef.current.find((item) => item.id === noteId && item.workspaceId === workspaceId);
      const tag = tagsRef.current.find((item) => item.workspaceId === workspaceId && item.name === tagName);
      if (!workspaceId || !note || !tag) {
        return;
      }

      const currentTagIds = tagsRef.current
        .filter((item) => item.workspaceId === workspaceId && note.tags.includes(item.name))
        .map((item) => item.id);
      const nextTagIds = getNextTagIds(currentTagIds, tag.id);
      await setNoteTags(workspaceId, noteId, nextTagIds);
      tagRelationsRef.current = updateNoteTagRelations(
        tagRelationsRef.current,
        workspaceId,
        noteId,
        nextTagIds,
      );
      setNotes((previous) => previous.map((item) =>
        item.id === noteId
          ? {
              ...item,
              tags: nextTagIds
                .map((tagId) => tagsRef.current.find((candidate) => candidate.id === tagId)?.name)
                .filter((name): name is string => Boolean(name)),
            }
          : item,
      ));
    },
    [currentWorkspaceIdRef, notesRef, setNotes, tagRelationsRef, tagsRef],
  );

  return {
    notes,
    tags,
    removeWorkspace,
    createNote,
    updateNote,
    deleteNote,
    addTag,
    deleteTag,
    toggleDocumentTag,
    toggleNoteTag,
    tagRelationsRef,
  };
}
