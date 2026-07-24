import { proxyNotesRequest } from "@/lib/notes/server-route";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const { workspaceId, assetId } = await context.params;
  return proxyNotesRequest(
    request,
    `/v1/workspaces/${workspaceId}/assets/${assetId}/tags`,
    "POST",
  );
}
