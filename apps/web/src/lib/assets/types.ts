export type JobStatusDto = {
  id: string;
  workspaceId: string;
  assetId: string;
  jobType: string;
  status: string;
  attemptCount: number;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type AssetSummaryDto = {
  id: string;
  workspaceId: string;
  kind: string;
  title: string;
  sourceFilename: string;
  mimeType: string;
  byteSize: number;
  status: string;
  currentProcessingGeneration: number;
  currentIndexVersion: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetListResponseDto = {
  items: AssetSummaryDto[];
  nextCursor: string | null;
};

export type OcrTextBlockDto = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfPageContentDto = {
  pageNumber: number;
  text: string;
  charCount: number;
  ocrBlocks: OcrTextBlockDto[];
};

export type PdfAssetDetailDto = {
  kind: "pdf";
  pageCount: number;
  pages: PdfPageContentDto[];
};

export type ImageAssetDetailDto = {
  kind: "image";
  widthPixels: number;
  heightPixels: number;
  orientationApplied: boolean;
};

export type AssetDetailResponseDto = {
  asset: AssetSummaryDto;
  detail: PdfAssetDetailDto | ImageAssetDetailDto;
};

export type UploadDescriptorDto = {
  method: string;
  objectKey: string;
  headers: Record<string, string>;
  url?: string;
};

export type CreateUploadSessionResponseDto = {
  asset: AssetSummaryDto;
  upload: UploadDescriptorDto;
};

export type FinalizeUploadResponseDto = {
  asset: AssetSummaryDto;
  job: JobStatusDto;
};
