"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { useEffect } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { CommandPalette } from "@/components/CommandPalette";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if (session?.error === "RefreshTokenExpired") {
      signOut({ redirect: false }).then(() => {
        window.location.href = "/api/auth/logout";
      });
    }
  }, [session, status]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      basePath="/api/auth"
      refetchInterval={5 * 60}
      refetchOnWindowFocus={true}
    >
      <ToastProvider>
        <SessionGuard>{children}</SessionGuard>
        <CommandPalette />
      </ToastProvider>
    </SessionProvider>
  );
}
