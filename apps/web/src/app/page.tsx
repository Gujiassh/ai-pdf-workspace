"use client";

import React, { useState } from "react";
import { useWorkspace } from "@/lib/mock-context";
import { useTheme } from "@/lib/theme-context";
import { useTranslation } from "@/lib/i18n-context";
import { WorkspaceList } from "@/components/workspace-list";
import { 
  Sparkles, FileText, BookOpen, Layers, Mail, 
  Sun, Moon, Globe, LogOut, Loader2, ArrowRight
} from "lucide-react";

export default function Home() {
  const { user, login, logout } = useWorkspace();
  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useTranslation();

  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    await login(email.trim(), nickname.trim());
    setLoading(false);
  };

  // 1. MOCK LOGIN SCREEN (If user is not authenticated)
  if (!user) {
    return (
      <main className="relative flex min-h-screen w-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950 transition-colors duration-200">
        
        {/* Top Floating Language and Theme controls */}
        <div className="absolute right-6 top-6 flex items-center gap-3">
          {/* Language Toggle */}
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
          >
            <Globe className="h-3.5 w-3.5" />
            {locale === "zh" ? "English" : "中文"}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900/60 backdrop-blur-md relative overflow-hidden transition-all duration-200">
          <div className="absolute top-0 right-0 h-40 w-40 bg-indigo-500/5 blur-3xl rounded-full" />
          
          <header className="text-center relative">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-md">
              <Sparkles className="h-5.5 w-5.5 text-amber-500 shrink-0" />
            </div>
            <h1 className="mt-4 text-xl font-black text-zinc-900 dark:text-white tracking-tight">
              {t("login.title")}
            </h1>
            <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {t("login.subtitle")}
            </p>
          </header>

          <form onSubmit={handleLogin} className="mt-8 space-y-4 relative">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">电子邮箱</label>
              <div className="relative mt-1.5 flex items-center">
                <Mail className="absolute left-3.5 h-4 w-4 text-zinc-400 shrink-0" />
                <input
                  type="email"
                  required
                  placeholder={t("login.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-3 pl-11 pr-4 text-xs outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-700 text-zinc-800 dark:text-zinc-100 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">昵称</label>
              <input
                type="text"
                placeholder={t("login.usernamePlaceholder")}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-3 px-4 text-xs outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-700 text-zinc-800 dark:text-zinc-100 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 dark:bg-white py-3 text-xs font-bold text-white dark:text-zinc-950 shadow-md hover:bg-zinc-800 dark:hover:bg-zinc-100 transition disabled:opacity-40 active:scale-98"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{t("login.buttonLoading")}</span>
                </>
              ) : (
                <>
                  <span>{t("login.button")}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </>
              )}
            </button>
          </form>

          <footer className="mt-8 text-center text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold border-t border-zinc-100 dark:border-zinc-800/80 pt-4 leading-relaxed">
            {t("login.guestNotice")}
          </footer>
        </div>
      </main>
    );
  }

  // 2. WORKSPACES PORTAL VIEW (If logged in)
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-12 md:px-8 bg-background dark:bg-zinc-950 transition-colors duration-200">
      
      {/* Header with profile and switcher */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 dark:border-zinc-800 pb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
            {t("dashboard.title")}
          </h1>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {t("dashboard.subtitle")}
          </p>
        </div>

        {/* Header Controls and user profile */}
        <div className="flex flex-wrap items-center gap-3.5">
          {/* Theme switcher */}
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-850 dark:bg-zinc-900 hover:text-zinc-950 dark:hover:text-white transition active:scale-95"
            title="主题切换"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          {/* i18n switcher */}
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-600 dark:border-zinc-850 dark:bg-zinc-900 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition active:scale-95"
          >
            <Globe className="h-3.5 w-3.5" />
            {locale === "zh" ? "English" : "中文"}
          </button>

          {/* User profile details */}
          <div className="flex items-center gap-2.5 pl-2.5 border-l border-zinc-200 dark:border-zinc-800">
            <img 
              src={user.avatarUrl} 
              alt={user.name} 
              className="h-8.5 w-8.5 rounded-xl bg-zinc-100 border border-zinc-250 dark:border-zinc-700" 
            />
            <div className="hidden md:block text-left text-xs font-bold">
              <div className="text-zinc-900 dark:text-white truncate max-w-[80px]">{user.name}</div>
              <div className="text-zinc-400 dark:text-zinc-500 text-[10px] truncate max-w-[80px]">{user.email}</div>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-xl text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition active:scale-95"
              title={t("sidebar.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>



      {/* Dynamic Workspace management list */}
      <section className="mt-12">
        <WorkspaceList />
      </section>

      {/* Footer copyright */}
      <footer className="mt-16 border-t border-zinc-200 dark:border-zinc-800 pt-6 flex justify-between items-center text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold">
        <span>© 2026 AI PDF Workspace • 纯前端 Mock 演示工程</span>
        <span>Developer Mode</span>
      </footer>
    </main>
  );
}
