"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WorkspacesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-sm text-zinc-500 font-medium transition-colors duration-200">
      Redirecting to portal...
    </div>
  );
}
