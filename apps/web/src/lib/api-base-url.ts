const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

export function getApiBaseUrl(): string {
  return process.env.AI_PDF_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}
