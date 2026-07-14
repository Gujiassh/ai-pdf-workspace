import { proxyNotesRequest } from "@/lib/notes/server-route";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; documentId: string }> },
) {
  const { workspaceId, documentId } = await context.params;
  return proxyNotesRequest(
    request,
    `/v1/workspaces/${workspaceId}/documents/${documentId}/tags`,
    "POST",
  );
}
