export type WorkspaceSummaryDto = {
  id: string;
  name: string;
  description: string | null;
  role: string;
  documentCount: number;
  noteCount: number;
  threadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceListResponseDto = {
  items: WorkspaceSummaryDto[];
  nextCursor: string | null;
};

export type WorkspaceDetailResponseDto = {
  workspace: WorkspaceSummaryDto;
};

export type CreateWorkspaceResponseDto = {
  workspace: WorkspaceSummaryDto;
};
