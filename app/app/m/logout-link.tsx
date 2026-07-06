"use client";

import { useRouter } from "next/navigation";

export function LogoutLink({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
      className="min-h-11 px-2 underline-offset-2 hover:text-chrome-text hover:underline"
    >
      {label}
    </button>
  );
}
