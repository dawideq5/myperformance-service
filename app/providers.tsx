"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { getPublicKeycloakIssuer } from "@/lib/keycloak-config";
import { getPublicLogoutRedirectUrl } from "@/lib/app-url";
import { useEffect } from "react";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    if ((session as any)?.error === "RefreshTokenExpired") {
      const keycloakUrl = getPublicKeycloakIssuer();
      const redirectUri = encodeURIComponent(getPublicLogoutRedirectUrl());
      const logoutUrl = `${keycloakUrl}/protocol/openid-connect/logout?post_logout_redirect_uri=${redirectUri}`;

      signOut({ redirect: false }).then(() => {
        window.location.href = logoutUrl;
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
