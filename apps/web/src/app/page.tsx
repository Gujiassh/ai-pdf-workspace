"use client";

import Image from "next/image";

import { useAuth } from "@/lib/auth/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useTranslation } from "@/lib/i18n-context";
import { useWorkspace } from "@/lib/workspace-context";
import { WorkspaceList } from "@/components/workspace-list";
import { AuthCard } from "@/components/auth-card";
import { Globe, LogOut, Moon, Sun } from "lucide-react";

export default function Home() {
  const { user, logout, isHydrating: isAuthHydrating } = useAuth();
  const { isHydrating: isWorkspaceHydrating } = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useTranslation();

  if (isAuthHydrating || (user && isWorkspaceHydrating)) {
    return (
      <main className="flex min-h-screen w-screen items-center justify-center bg-zinc-50 text-sm font-medium text-zinc-500 transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-400">
        {t("workspace.loading")}
      </main>
    );
  }

  if (!user) {
    return (
      <main className="relative flex min-h-screen w-screen flex-col items-center justify-center bg-zinc-50 px-6 transition-colors duration-200 dark:bg-zinc-950">
        <div className="absolute right-6 top-6 flex items-center gap-3">
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            <Globe className="h-3.5 w-3.5" />
            {locale === "zh" ? "English" : "中文"}
          </button>

          <button
            onClick={toggleTheme}
            className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </button>
        </div>

        <AuthCard />
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-zinc-50 px-8 py-12 text-zinc-950 transition-colors duration-200 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
            {t("dashboard.title")}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3.5">
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition active:scale-95 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:text-white"
            title={t("sidebar.themeTooltip")}
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-600 transition active:scale-95 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            <Globe className="h-3.5 w-3.5" />
            {locale === "zh" ? "English" : "中文"}
          </button>

          <div className="flex items-center gap-2.5 border-l border-zinc-200 pl-2.5 dark:border-zinc-800">
            <Image
              src={user.avatarUrl}
              alt={user.name}
              width={34}
              height={34}
              unoptimized
              className="h-8.5 w-8.5 rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-700"
            />
            <div className="hidden text-left text-xs font-bold md:block">
              <div className="max-w-[80px] truncate text-zinc-900 dark:text-white">{user.name}</div>
              <div className="max-w-[80px] truncate text-[10px] text-zinc-400 dark:text-zinc-500">{user.email}</div>
            </div>
            <button
              onClick={logout}
              className="rounded-xl p-2 text-zinc-400 transition active:scale-95 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/20"
              title={t("sidebar.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <section className="mt-12">
        <WorkspaceList />
      </section>
    </main>
  );
}
