"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useEffect } from "react";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if ((session as any)?.error === "RefreshTokenExpired") {
      const keycloakUrl =
        process.env.NEXT_PUBLIC_KEYCLOAK_URL || "https://auth.myperformance.pl";
      const idToken = (session as any)?.idToken;
      const redirectUri = encodeURIComponent(window.location.origin + "/login");
      const logoutUrl = idToken
        ? `${keycloakUrl}/realms/MyPerformance/protocol/openid-connect/logout?id_token_hint=${idToken}&post_logout_redirect_uri=${redirectUri}`
        : undefined;

      signOut({ redirect: false }).then(() => {
        window.location.href = logoutUrl || "/login";
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
      <ThemeProvider>
        <SessionGuard>{children}</SessionGuard>
      </ThemeProvider>
    </SessionProvider>
  );
}
