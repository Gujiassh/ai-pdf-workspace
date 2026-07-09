"use client";

import React from "react";

import type { TranslationKey } from "@/lib/i18n-context";
import { MessageSquareHeart, BookmarkPlus } from "lucide-react";

interface SelectionPopoverProps {
  show: boolean;
  text: string | null;
  pos: { x: number; y: number };
  onAskAI: () => void;
  onCaptureNote: () => void;
  t: (key: TranslationKey) => string;
}

export function SelectionPopover({
  show,
  text,
  pos,
  onAskAI,
  onCaptureNote,
  t,
}: SelectionPopoverProps) {
  if (!show || !text) return null;

  return (
    <div
      className="absolute z-30 flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={onAskAI}
        className="flex items-center gap-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 py-1 text-[10px] font-bold text-white transition active:scale-95 cursor-pointer"
      >
        <MessageSquareHeart className="h-3 w-3 text-cyan-400 shrink-0" />
        {t("viewer.selectionAsk")}
      </button>
      <button
        onClick={onCaptureNote}
        className="flex items-center gap-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-2.5 py-1 text-[10px] font-bold text-white transition active:scale-95 cursor-pointer"
      >
        <BookmarkPlus className="h-3 w-3 text-indigo-400 shrink-0" />
        {t("viewer.selectionNote")}
      </button>
    </div>
  );
}
