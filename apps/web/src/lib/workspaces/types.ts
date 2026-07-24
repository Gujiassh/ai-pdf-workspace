export type WorkspaceSummaryDto = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  retrievalTopK: number;
  chunkSize: number;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: string;
  generationProvider: string;
  generationModel: string;
  role: string;
  assetCount: number;
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


export type WorkspaceSettingsResponseDto = {
  workspace: WorkspaceSummaryDto;
};
