import Link from "next/link";
import { WorkspaceList } from "@/components/workspace-list";
import { Sparkles, FileText, BookOpen, Layers } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-16 md:px-8">
      {/* Premium Hero section */}
      <header className="relative max-w-3xl animate-in fade-in duration-300">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
          <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>纯前端交互演练版已就绪</span>
        </div>
        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
          AI PDF Workspace
        </h1>
        <p className="mt-4 text-base leading-7 text-zinc-500">
          基于多工作区构建的知识库工作台。每个工作区拥有隔离的文档库、提示词、会话历史与笔记系统。
        </p>
      </header>

      {/* Feature quick showcase (capped at 2 layers of hierarchy) */}
      <section className="mt-12 grid gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-50 text-zinc-700">
            <Layers className="h-4.5 w-4.5" />
          </div>
          <h3 className="mt-3 text-xs font-bold text-zinc-800">工作区强隔离</h3>
          <p className="mt-1.5 text-[11px] leading-5 text-zinc-400">
            各个 Workspace 上下文互不干扰，确保数据安全与逻辑隔离。
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-50 text-zinc-700">
            <FileText className="h-4.5 w-4.5" />
          </div>
          <h3 className="mt-3 text-xs font-bold text-zinc-800">可信引文回跳</h3>
          <p className="mt-1.5 text-[11px] leading-5 text-zinc-400">
            回答深度集成 Citation 机制，点击引文标记 PDF 原文自动定位跳页。
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-50 text-zinc-700">
            <BookOpen className="h-4.5 w-4.5" />
          </div>
          <h3 className="mt-3 text-xs font-bold text-zinc-800">一键沉淀笔记</h3>
          <p className="mt-1.5 text-[11px] leading-5 text-zinc-400">
            在问答卡片中，两步点击即可将源片段及其元数据一键打包为系统笔记。
          </p>
        </div>
      </section>

      {/* Embedded Workspaces Management Portal */}
      <section className="mt-16 border-t border-zinc-200 pt-10">
        <WorkspaceList />
      </section>

      {/* Footer footer info */}
      <footer className="mt-20 border-t border-zinc-150 pt-6 flex justify-between items-center text-[10px] text-zinc-400 font-semibold">
        <span>© 2026 AI PDF Workspace • 纯前端 Mock 演示工程</span>
        <span>Developer Mode</span>
      </footer>
    </main>
  );
}
