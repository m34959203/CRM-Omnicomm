"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="mt-3 w-full rounded border border-chrome-line px-3 py-1.5 text-xs text-chrome-text transition hover:border-accent hover:text-accent"
    >
      {label}
    </button>
  );
}
