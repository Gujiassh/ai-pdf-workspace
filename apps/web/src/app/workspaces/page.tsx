import { WorkspaceList } from "@/components/workspace-list";

export default function WorkspacesPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-12">
      <div className="max-w-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
          AI PDF Workspace
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
          工作区列表
        </h1>
        <p className="mt-3 text-base leading-7 text-zinc-600">
          当前先用 API 占位数据打通 Workspace 边界。下一步会在这里接入登录态、真实数据库和工作区权限。
        </p>
      </div>
      <section className="mt-10">
        <WorkspaceList />
      </section>
    </main>
  );
}
