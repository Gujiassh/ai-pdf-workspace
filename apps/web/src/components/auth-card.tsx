"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Mail, Sparkles } from "lucide-react";

import { useTranslation } from "@/lib/i18n-context";
import { useWorkspace } from "@/lib/mock-context";

type AuthMode = "login" | "register";

export function AuthCard() {
  const { login, register } = useWorkspace();
  const { t } = useTranslation();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setSuccess(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim() || loading) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await login(email.trim(), password);
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : t("login.errorUnknown"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim() || !confirmPassword.trim() || loading) {
      return;
    }

    if (password !== confirmPassword) {
      setError(t("login.errorPasswordMismatch"));
      setSuccess(null);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await register(email.trim(), nickname.trim(), password);
      setSuccess(t("login.registerSuccess"));
      setMode("login");
      setEmail(email.trim());
      setNickname("");
      setPassword("");
      setConfirmPassword("");
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : t("login.errorUnknown"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
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

      <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800/70">
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
            mode === "login"
              ? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-950 dark:text-white"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {t("login.loginTab")}
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
            mode === "register"
              ? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-950 dark:text-white"
              : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {t("login.registerTab")}
        </button>
      </div>

      <form
        onSubmit={mode === "login" ? handleLogin : handleRegister}
        className="mt-6 space-y-4 relative"
      >
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            {t("login.emailLabel")}
          </label>
          <div className="relative mt-1.5 flex items-center">
            <Mail className="absolute left-3.5 h-4 w-4 text-zinc-400 shrink-0" />
            <input
              type="email"
              required
              placeholder={t("login.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-3 pl-11 pr-4 text-xs outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-700 dark:focus:bg-zinc-950 text-zinc-800 dark:text-zinc-100 transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            {t("login.passwordLabel")}
          </label>
          <input
            type="password"
            required
            placeholder={t("login.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-3 px-4 text-xs outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-700 dark:focus:bg-zinc-950 text-zinc-800 dark:text-zinc-100 transition"
          />
        </div>

        {mode === "register" ? (
          <>
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                {t("login.usernameLabel")}
              </label>
              <input
                type="text"
                placeholder={t("login.usernamePlaceholder")}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-3 px-4 text-xs outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-700 dark:focus:bg-zinc-950 text-zinc-800 dark:text-zinc-100 transition"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                {t("login.confirmPasswordLabel")}
              </label>
              <input
                type="password"
                required
                placeholder={t("login.confirmPasswordPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-3 px-4 text-xs outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-700 dark:focus:bg-zinc-950 text-zinc-800 dark:text-zinc-100 transition"
              />
            </div>
          </>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || !email.trim() || !password.trim()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 dark:bg-white py-3 text-xs font-bold text-white dark:text-zinc-950 shadow-md hover:bg-zinc-800 dark:hover:bg-zinc-100 transition disabled:opacity-40 active:scale-98"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>
                {mode === "login"
                  ? t("login.buttonLoading")
                  : t("login.registerButtonLoading")}
              </span>
            </>
          ) : (
            <>
              <span>
                {mode === "login"
                  ? t("login.button")
                  : t("login.registerButton")}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </>
          )}
        </button>
      </form>

    </div>
  );
}
