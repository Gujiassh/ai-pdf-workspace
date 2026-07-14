import { proxyNotesRequest } from "@/lib/notes/server-route";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  const { workspaceId, noteId } = await context.params;
  return proxyNotesRequest(
    request,
    `/v1/workspaces/${workspaceId}/notes/${noteId}/tags`,
    "POST",
  );
}
