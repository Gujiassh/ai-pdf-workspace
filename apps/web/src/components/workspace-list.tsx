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

type WorkspaceListResponse = {
  items: WorkspaceSummary[];
  nextCursor: string | null;
};

export function WorkspaceList() {
  const [items, setItems] = useState<WorkspaceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/workspaces", { cache: "no-store" });
        const payload = (await response.json()) as
          | WorkspaceListResponse
          | { error?: { message?: string } };

        if (!response.ok) {
          const message =
            "error" in payload && payload.error?.message
              ? payload.error.message
              : "Failed to load workspaces.";
          throw new Error(message);
        }

        if (!cancelled && "items" in payload) {
          setItems(payload.items);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load workspaces.",
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
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500">正在加载工作区...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">当前还没有工作区。</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((workspace) => (
        <Link
          key={workspace.id}
          href={`/workspaces/${workspace.id}`}
          className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">
              {workspace.name}
            </h2>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
              {workspace.role}
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            {workspace.description ?? "暂无描述"}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm text-zinc-600">
            <div>
              <dt>文档</dt>
              <dd className="text-base font-medium text-zinc-950">
                {workspace.documentCount}
              </dd>
            </div>
            <div>
              <dt>笔记</dt>
              <dd className="text-base font-medium text-zinc-950">
                {workspace.noteCount}
              </dd>
            </div>
            <div>
              <dt>线程</dt>
              <dd className="text-base font-medium text-zinc-950">
                {workspace.threadCount}
              </dd>
            </div>
          </dl>
        </Link>
      ))}
    </div>
  );
}
