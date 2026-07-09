import type { WorkspaceSummaryDto } from "./types";

const DEFAULT_PROMPT_ZH =
  "你是一个智能文档助手。请结合上下文帮助深入剖析并解答文档相关的所有疑问。";
const DEFAULT_PROMPT_EN =
  "You are an AI research assistant. Please read context documents and help answer all questions with details.";

export type WorkspaceLocale = "zh" | "en";

export type WorkspaceUiRecord = WorkspaceSummaryDto & {
  systemPrompt: string;
};

export function getDefaultWorkspacePrompt(locale: WorkspaceLocale): string {
  return locale === "en" ? DEFAULT_PROMPT_EN : DEFAULT_PROMPT_ZH;
}

export function normalizeWorkspaceSummary(
  workspace: WorkspaceSummaryDto,
  locale: WorkspaceLocale,
  promptOverride?: string,
): WorkspaceUiRecord {
  return {
    ...workspace,
    systemPrompt: promptOverride ?? getDefaultWorkspacePrompt(locale),
  };
}

export function pickAccessibleWorkspaceId(
  workspaces: Array<{ id: string }>,
  currentWorkspaceId: string | null | undefined,
): string {
  if (currentWorkspaceId && workspaces.some((workspace) => workspace.id === currentWorkspaceId)) {
    return currentWorkspaceId;
  }
  return workspaces[0]?.id ?? "";
}
