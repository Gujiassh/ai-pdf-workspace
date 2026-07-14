import { proxyNotesRequest } from "@/lib/notes/server-route";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  return proxyNotesRequest(request, `/v1/workspaces/${workspaceId}/tags`, "GET");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  return proxyNotesRequest(request, `/v1/workspaces/${workspaceId}/tags`, "POST");
}
