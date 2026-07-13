export type JobStatusDto = {
  id: string;
  workspaceId: string;
  documentId: string;
  jobType: string;
  status: string;
  attemptCount: number;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type DocumentSummaryDto = {
  id: string;
  workspaceId: string;
  title: string;
  sourceFilename: string;
  mimeType: string;
  byteSize: number;
  pageCount: number | null;
  status: string;
  currentIndexVersion: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentListResponseDto = {
  items: DocumentSummaryDto[];
  nextCursor: string | null;
};

export type DocumentPageContentDto = {
  pageNumber: number;
  text: string;
  charCount: number;
};

export type DocumentDetailResponseDto = {
  document: DocumentSummaryDto;
  pages: DocumentPageContentDto[];
};

export type UploadDescriptorDto = {
  method: string;
  objectKey: string;
  headers: Record<string, string>;
  url?: string;
};

export type CreateUploadSessionResponseDto = {
  document: DocumentSummaryDto;
  upload: UploadDescriptorDto;
};

export type FinalizeUploadResponseDto = {
  document: DocumentSummaryDto;
  job: JobStatusDto;
};
