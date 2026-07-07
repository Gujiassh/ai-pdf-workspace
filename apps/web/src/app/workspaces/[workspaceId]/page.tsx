"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type WorkspaceSummary = {
  id: string;
  name: string;
  description: string | null;
  role: string;
  documentCount: number;
  noteCount: number;
  threadCount: number;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceDetailResponse = {
  workspace: WorkspaceSummary;
};

export default function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { workspaceId: id } = await params;
        if (cancelled) return;
        setWorkspaceId(id);

        const response = await fetch(`/api/workspaces/${id}`, { cache: "no-store" });
        const payload = (await response.json()) as
          | WorkspaceDetailResponse
          | { error?: { message?: string } };

        if (!response.ok) {
          const message =
            "error" in payload && payload.error?.message
              ? payload.error.message
              : "Failed to load workspace detail.";
          throw new Error(message);
        }

        if (!cancelled && "workspace" in payload) {
          setWorkspace(payload.workspace);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load workspace detail.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-12">
      <Link href="/workspaces" className="text-sm text-zinc-500 hover:text-zinc-950">
        返回工作区列表
      </Link>

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">正在加载工作区详情...</p>
      ) : error ? (
        <p className="mt-8 text-sm text-red-600">{error}</p>
      ) : workspace ? (
        <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
                Workspace
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">
                {workspace.name}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-600">
                {workspace.description ?? "暂无描述"}
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-4 py-2 text-sm text-zinc-600">
              {workspace.role}
            </span>
          </div>

          <dl className="mt-8 grid gap-4 border-t border-zinc-200 pt-6 md:grid-cols-4">
            <div>
              <dt className="text-sm text-zinc-500">工作区 ID</dt>
              <dd className="mt-1 break-all text-sm font-medium text-zinc-950">
                {workspaceId}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">文档数</dt>
              <dd className="mt-1 text-2xl font-semibold text-zinc-950">
                {workspace.documentCount}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">笔记数</dt>
              <dd className="mt-1 text-2xl font-semibold text-zinc-950">
                {workspace.noteCount}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">线程数</dt>
              <dd className="mt-1 text-2xl font-semibold text-zinc-950">
                {workspace.threadCount}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </main>
  );
}
