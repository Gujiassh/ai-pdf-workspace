import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
          AI PDF Workspace
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-zinc-950">
          文本 PDF 工作台骨架已经启动
        </h1>
        <p className="mt-4 text-lg leading-8 text-zinc-600">
          当前阶段先打通 Workspace 边界和最小 API/BFF 链路，再继续接文档上传、任务状态和检索问答主链。
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/workspaces"
            className="rounded-full bg-zinc-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            查看工作区
          </Link>
          <a
            href="http://127.0.0.1:8000/health"
            className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-500"
            target="_blank"
            rel="noreferrer"
          >
            API 健康检查
          </a>
        </div>
      </div>
    </main>
  );
}
