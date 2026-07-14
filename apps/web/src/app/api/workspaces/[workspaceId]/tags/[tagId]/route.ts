import { proxyNotesRequest } from "@/lib/notes/server-route";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string; tagId: string }> },
) {
  const { workspaceId, tagId } = await context.params;
  return proxyNotesRequest(
    request,
    `/v1/workspaces/${workspaceId}/tags/${tagId}`,
    "PATCH",
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceId: string; tagId: string }> },
) {
  const { workspaceId, tagId } = await context.params;
  return proxyNotesRequest(
    request,
    `/v1/workspaces/${workspaceId}/tags/${tagId}`,
    "DELETE",
  );
}
