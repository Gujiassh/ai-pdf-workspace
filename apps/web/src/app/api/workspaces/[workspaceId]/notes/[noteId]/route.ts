import { proxyNotesRequest } from "@/lib/notes/server-route";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  const { workspaceId, noteId } = await context.params;
  return proxyNotesRequest(
    request,
    `/v1/workspaces/${workspaceId}/notes/${noteId}`,
    "PATCH",
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  const { workspaceId, noteId } = await context.params;
  return proxyNotesRequest(
    request,
    `/v1/workspaces/${workspaceId}/notes/${noteId}`,
    "DELETE",
  );
}
