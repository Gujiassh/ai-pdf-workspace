"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { useTranslation } from "@/lib/i18n-context";

import { getAuthErrorMessage, normalizeAuthUser } from "./normalize";
import type { AuthApiUser, AuthErrorPayload, AuthUser } from "./types";

type SessionPayload = {
  user?: AuthUser | null;
};

type AuthRoutePayload = AuthErrorPayload & {
  user?: AuthApiUser;
};

type AuthContextType = {
  user: AuthUser | null;
  isHydrating: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function readJsonSafely<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useTranslation();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  const refreshSession = useCallback(async () => {
    setIsHydrating(true);
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const payload = await readJsonSafely<SessionPayload>(response);
      setUser(payload?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsHydrating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = await readJsonSafely<SessionPayload>(response);
        if (!cancelled) {
          setUser(payload?.user ?? null);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsHydrating(false);
        }
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = await readJsonSafely<AuthRoutePayload>(response);
      if (!response.ok || !payload?.user) {
        throw new Error(
          getAuthErrorMessage(
            payload,
            locale === "en" ? "Login failed." : "登录失败，请重试。",
          ),
        );
      }

      setUser(normalizeAuthUser(payload.user));
    },
    [locale],
  );

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name.trim() || email.split("@")[0], password }),
      });

      const payload = await readJsonSafely<AuthRoutePayload>(response);
      if (!response.ok) {
        throw new Error(
          getAuthErrorMessage(
            payload,
            locale === "en" ? "Registration failed." : "注册失败，请重试。",
          ),
        );
      }
    },
    [locale],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isHydrating,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
