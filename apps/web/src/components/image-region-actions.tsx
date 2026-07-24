"use client";

import { useState } from "react";
import { Loader2, MessageSquareText, NotebookPen } from "lucide-react";

import type { ImageRegionEvidenceTargetRequest } from "@/lib/evidence/types";
import type { TranslationKey } from "@/lib/i18n-context";

type ImageRegionActionsProps = {
  target: ImageRegionEvidenceTargetRequest;
  assetTitle: string;
  canAsk: boolean;
  askQuestion: (question: string, target: ImageRegionEvidenceTargetRequest) => Promise<boolean>;
  createNote: (
    title: string,
    content: string,
    target: ImageRegionEvidenceTargetRequest,
  ) => Promise<void>;
  t: (key: TranslationKey) => string;
};

export function ImageRegionActions({
  target,
  assetTitle,
  canAsk,
  askQuestion,
  createNote,
  t,
}: ImageRegionActionsProps) {
  const [pendingAction, setPendingAction] = useState<"ask" | "note" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = pendingAction !== null;

  const handleAsk = async () => {
    if (!canAsk || disabled) {
      return;
    }
    setPendingAction("ask");
    setError(null);
    try {
      const accepted = await askQuestion(
        t("image.regionQuestionTemplate").replace("{asset}", assetTitle),
        target,
      );
      if (!accepted) {
        setError(t("image.regionActionFailed"));
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("image.regionActionFailed"));
    } finally {
      setPendingAction(null);
    }
  };

  const handleNote = async () => {
    if (disabled) {
      return;
    }
    setPendingAction("note");
    setError(null);
    try {
      await createNote(
        t("image.regionNoteTitleTemplate").replace("{asset}", assetTitle),
        t("image.regionNoteContentTemplate").replace("{asset}", assetTitle),
        target,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("image.regionActionFailed"));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div
      data-image-region-actions
      className="absolute inset-x-3 bottom-3 z-40 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-col items-center gap-1.5"
    >
      <div className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          data-image-region-ask
          disabled={!canAsk || disabled}
          onClick={() => void handleAsk()}
          title={canAsk ? t("viewer.selectionAsk") : t("image.regionThreadRequired")}
          aria-label={canAsk ? t("viewer.selectionAsk") : t("image.regionThreadRequired")}
          className="flex min-h-11 items-center gap-1.5 rounded px-3 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-8 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          {pendingAction === "ask" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquareText className="h-3.5 w-3.5" />
          )}
          <span>{t("viewer.selectionAsk")}</span>
        </button>
        <span className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
        <button
          type="button"
          data-image-region-note
          disabled={disabled}
          onClick={() => void handleNote()}
          title={t("viewer.selectionNote")}
          aria-label={t("viewer.selectionNote")}
          className="flex min-h-11 items-center gap-1.5 rounded px-3 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-8 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          {pendingAction === "note" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <NotebookPen className="h-3.5 w-3.5" />
          )}
          <span>{t("viewer.selectionNote")}</span>
        </button>
      </div>
      {error ? (
        <p role="alert" className="max-w-sm rounded bg-rose-700 px-2 py-1 text-center text-[10px] font-medium text-white shadow">
          {error}
        </p>
      ) : null}
    </div>
  );
}
