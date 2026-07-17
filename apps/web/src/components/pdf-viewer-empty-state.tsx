"use client";

import { FileText } from "lucide-react";

import { useTranslation } from "@/lib/i18n-context";

type PdfViewerEmptyStateProps = {
  workspaceName?: string;
  documentsCount: number;
};

export function PdfViewerEmptyState({ workspaceName, documentsCount }: PdfViewerEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full items-center justify-center bg-zinc-100 px-6 text-center dark:bg-zinc-950">
      <div className="max-w-xs">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          <FileText className="h-4.5 w-4.5" />
        </span>
        <h2 className="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("viewer.noDocTitle")}</h2>
        <p className="mt-1 text-[11px] leading-5 text-zinc-500 dark:text-zinc-500">
          {documentsCount > 0 ? t("viewer.noDocDesc") : workspaceName}
        </p>
      </div>
    </div>
  );
}
