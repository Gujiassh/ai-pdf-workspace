"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { AuthUser } from "@/lib/auth/types";
import type {
  CreateUploadSessionResponseDto,
  DocumentListResponseDto,
  DocumentSummaryDto,
  FinalizeUploadResponseDto,
} from "@/lib/documents/types";
import { applyDocumentTags } from "@/lib/notes/normalize";
import type { TagDto } from "@/lib/notes/types";
import type { WorkspaceLocale } from "@/lib/workspaces/normalize";
import type { Document } from "./workspace-context";
import { getWorkspaceErrorMessage, readResponseJsonSafely } from "./use-workspaces";

export type DocumentErrorPayload = {
  detail?: string;
  error?: {
    message?: string;
  };
};

export function formatDocumentSize(byteSize: number): string {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
}

export function normalizeDocumentStatus(status: string): Document["status"] {
  if (["pending_upload", "uploaded", "parsing", "chunking", "chunked", "embedding", "ready", "failed", "deleting", "deleted"].includes(status)) {
    return status as Document["status"];
  }
  return "failed";
}

export function getDocumentProgress(status: Document["status"]): number {
  switch (status) {
    case "pending_upload":
      return 10;
    case "uploaded":
      return 25;
    case "parsing":
      return 50;
    case "chunking":
      return 75;
    case "chunked":
      return 100;
    case "embedding":
      return 90;
    case "ready":
      return 100;
    case "failed":
      return 100;
    case "deleting":
      return 100;
    case "deleted":
      return 100;
  }
}

export function toUiDocument(document: DocumentSummaryDto): Document {
  const status = normalizeDocumentStatus(document.status);
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    name: document.sourceFilename,
    size: formatDocumentSize(document.byteSize),
    pagesCount: document.pageCount ?? 0,
    status,
    progress: getDocumentProgress(status),
    errorMsg: document.lastErrorMessage ?? undefined,
    tags: [],
    createdAt: document.createdAt,
  };
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameDocumentSnapshot(left: Document, right: Document): boolean {
  return (
    left.id === right.id
    && left.workspaceId === right.workspaceId
    && left.name === right.name
    && left.size === right.size
    && left.pagesCount === right.pagesCount
    && left.status === right.status
    && left.progress === right.progress
    && left.errorMsg === right.errorMsg
    && left.createdAt === right.createdAt
    && sameStringArray(left.tags, right.tags)
  );
}

export function replaceDocumentsForWorkspace(
  workspaceId: string,
  workspaceDocuments: Document[],
  baseDocuments: Document[],
): Document[] {
  const previousById = new Map(
    baseDocuments
      .filter((document) => document.workspaceId === workspaceId)
      .map((document) => [document.id, document]),
  );
  const stableWorkspaceDocuments = workspaceDocuments.map((document) => {
    const previous = previousById.get(document.id);
    return previous && sameDocumentSnapshot(previous, document) ? previous : document;
  });
  const nextDocuments = [
    ...baseDocuments.filter((document) => document.workspaceId !== workspaceId),
    ...stableWorkspaceDocuments,
  ];

  return nextDocuments.length === baseDocuments.length
    && nextDocuments.every((document, index) => document === baseDocuments[index])
    ? baseDocuments
    : nextDocuments;
}

export function applyTagRelationsToDocuments(
  workspaceId: string,
  documents: Document[],
  tagRelations: TagDto[],
): Document[] {
  const workspaceDocuments = documents.filter((document) => document.workspaceId === workspaceId);
  return replaceDocumentsForWorkspace(
    workspaceId,
    applyDocumentTags(workspaceDocuments, tagRelations),
    documents,
  );
}

type UseDocumentsOptions = {
  locale: WorkspaceLocale;
  user: AuthUser | null;
  isAuthHydrating: boolean;
  currentWorkspaceId: string;
  tagRelationsRef: MutableRefObject<TagDto[]>;
  documentsRef: MutableRefObject<Document[]>;
  syncDocumentViewState: (workspaceId: string, documents: Document[]) => void;
  closeDocument: (id: string) => void;
  updateWorkspace: (workspaceId: string, updater: (workspace: import("./workspace-context").Workspace) => import("./workspace-context").Workspace) => void;
};

export function useDocuments({
  locale,
  user,
  isAuthHydrating,
  currentWorkspaceId,
  tagRelationsRef,
  documentsRef,
  syncDocumentViewState,
  closeDocument,
  updateWorkspace,
}: UseDocumentsOptions) {
  const [documents, setDocumentsState] = useState<Document[]>([]);

  const setDocuments: Dispatch<SetStateAction<Document[]>> = useCallback(
    (update) => {
      setDocumentsState((previous) => {
        const nextDocuments = typeof update === "function" ? update(previous) : update;
        documentsRef.current = nextDocuments;
        return nextDocuments;
      });
    },
    [documentsRef],
  );

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents, documentsRef]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDocuments() {
      if (isAuthHydrating) {
        return;
      }
      if (!user) {
        setDocuments([]);
        tagRelationsRef.current = [];
        return;
      }
      if (!currentWorkspaceId) {
        return;
      }

      const workspaceId = currentWorkspaceId;
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/documents`, { cache: "no-store" });
        const payload = await readResponseJsonSafely<DocumentListResponseDto & DocumentErrorPayload>(response);
        if (!response.ok) {
          throw new Error(
            getWorkspaceErrorMessage(
              payload,
              locale === "en" ? "Failed to load documents." : "加载文档列表失败。",
            ),
          );
        }

        const workspaceDocuments = applyDocumentTags(
          (payload?.items ?? []).map(toUiDocument),
          tagRelationsRef.current,
        );
        if (!cancelled) {
          const nextDocuments = replaceDocumentsForWorkspace(workspaceId, workspaceDocuments, documentsRef.current);
          setDocuments(nextDocuments);
          syncDocumentViewState(workspaceId, nextDocuments);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
        }
      }
    }

    void hydrateDocuments();

    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId, isAuthHydrating, locale, setDocuments, syncDocumentViewState, tagRelationsRef, user, documentsRef]);

  useEffect(() => {
    if (isAuthHydrating || !user || !currentWorkspaceId) {
      return;
    }

    const hasProcessingDocument = documents.some(
      (document) => document.workspaceId === currentWorkspaceId && !["chunked", "ready", "failed", "deleted"].includes(document.status),
    );
    if (!hasProcessingDocument) {
      return;
    }

    const refreshDocuments = async () => {
      try {
        const response = await fetch(`/api/workspaces/${currentWorkspaceId}/documents`, { cache: "no-store" });
        const payload = await readResponseJsonSafely<DocumentListResponseDto & DocumentErrorPayload>(response);
        if (!response.ok || !payload) {
          return;
        }
        const workspaceDocuments = applyDocumentTags(
          payload.items.map(toUiDocument),
          tagRelationsRef.current,
        );
        const nextDocuments = replaceDocumentsForWorkspace(currentWorkspaceId, workspaceDocuments, documentsRef.current);
        setDocuments(nextDocuments);
      } catch (error) {
        console.error(error);
      }
    };

    const timer = window.setInterval(() => {
      void refreshDocuments();
    }, 1_500);

    return () => {
      window.clearInterval(timer);
    };
  }, [currentWorkspaceId, documents, documentsRef, isAuthHydrating, setDocuments, tagRelationsRef, user]);

  const uploadDocument = useCallback(
    async (file: File) => {
      const workspaceId = currentWorkspaceId;
      if (!workspaceId) {
        return;
      }

      const uploadSessionResponse = await fetch(`/api/workspaces/${workspaceId}/documents/upload-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFilename: file.name,
          mimeType: file.type || "application/pdf",
          byteSize: file.size,
          title: file.name.replace(/\.pdf$/i, ""),
        }),
      });

      const uploadSessionPayload = await readResponseJsonSafely<CreateUploadSessionResponseDto & DocumentErrorPayload>(uploadSessionResponse);
      if (!uploadSessionResponse.ok || !uploadSessionPayload?.document || !uploadSessionPayload?.upload.url) {
        throw new Error(
          getWorkspaceErrorMessage(
            uploadSessionPayload,
            locale === "en" ? "Failed to create upload session." : "创建上传会话失败。",
          ),
        );
      }

      const pendingDocument = toUiDocument(uploadSessionPayload.document);
      setDocuments((previous) => [
        pendingDocument,
        ...previous.filter((document) => document.id !== pendingDocument.id),
      ]);
      updateWorkspace(workspaceId, (workspace) => ({
        ...workspace,
        documentCount: workspace.documentCount + 1,
      }));

      const uploadResponse = await fetch(uploadSessionPayload.upload.url, {
        method: uploadSessionPayload.upload.method,
        headers: uploadSessionPayload.upload.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        const uploadPayload = await readResponseJsonSafely<DocumentErrorPayload>(uploadResponse);
        throw new Error(
          getWorkspaceErrorMessage(
            uploadPayload,
            locale === "en" ? "Failed to upload file." : "上传文件失败。",
          ),
        );
      }

      const finalizeResponse = await fetch(`/api/workspaces/${workspaceId}/documents/${pendingDocument.id}/finalize-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectKey: uploadSessionPayload.upload.objectKey }),
      });
      const finalizePayload = await readResponseJsonSafely<FinalizeUploadResponseDto & DocumentErrorPayload>(finalizeResponse);
      if (!finalizeResponse.ok || !finalizePayload?.document) {
        throw new Error(
          getWorkspaceErrorMessage(
            finalizePayload,
            locale === "en" ? "Failed to finalize upload." : "确认上传失败。",
          ),
        );
      }

      const uploadedDocument = toUiDocument(finalizePayload.document);
      setDocuments((previous) => [
        uploadedDocument,
        ...previous.filter((document) => document.id !== uploadedDocument.id),
      ]);
    },
    [currentWorkspaceId, locale, setDocuments, updateWorkspace],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      const workspaceId = currentWorkspaceId;
      if (!workspaceId) {
        return;
      }

      const response = await fetch(`/api/workspaces/${workspaceId}/documents/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await readResponseJsonSafely<DocumentErrorPayload>(response);
        throw new Error(
          getWorkspaceErrorMessage(
            payload,
            locale === "en" ? "Failed to delete document." : "删除文档失败。",
          ),
        );
      }

      setDocuments(documentsRef.current.filter((document) => document.id !== id));
      closeDocument(id);
      updateWorkspace(workspaceId, (workspace) => ({
        ...workspace,
        documentCount: Math.max(0, workspace.documentCount - 1),
      }));
    },
    [closeDocument, currentWorkspaceId, documentsRef, locale, setDocuments, updateWorkspace],
  );

  const removeWorkspace = useCallback(
    (workspaceId: string) => {
      setDocuments(documentsRef.current.filter((document) => document.workspaceId !== workspaceId));
    },
    [documentsRef, setDocuments],
  );

  const applyTagRelations = useCallback(
    (workspaceId: string, tagRelations: TagDto[]) => {
      setDocuments((previous) => applyTagRelationsToDocuments(workspaceId, previous, tagRelations));
    },
    [setDocuments],
  );

  const updateDocumentTags = useCallback(
    (documentId: string, tagNames: string[]) => {
      setDocuments((previous) => previous.map((document) =>
        document.id === documentId ? { ...document, tags: tagNames } : document,
      ));
    },
    [setDocuments],
  );

  const removeTagName = useCallback(
    (workspaceId: string, tagName: string) => {
      setDocuments((previous) => previous.map((document) => ({
        ...document,
        tags: document.workspaceId === workspaceId
          ? document.tags.filter((name) => name !== tagName)
          : document.tags,
      })));
    },
    [setDocuments],
  );

  return {
    documents,
    documentsRef,
    uploadDocument,
    deleteDocument,
    removeWorkspace,
    applyTagRelations,
    updateDocumentTags,
    removeTagName,
  };
}
