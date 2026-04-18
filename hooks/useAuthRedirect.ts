"use client";

import { useCallback, useEffect } from "react";
import { signOut } from "next-auth/react";
import { setUnauthorizedHandler } from "@/lib/api-client";

/**
 * Centralized logout flows for the frontend:
 *   - `softLogout`  → clears the NextAuth session and returns to /login.
 *   - `fullLogout`  → hits Keycloak RP-Initiated Logout via /api/auth/logout.
 *
 * Also installs a global 401 handler (via setUnauthorizedHandler) so api-client
 * triggers softLogout automatically on the first unauthorized response.
 */
export function useAuthRedirect(): {
  softLogout: () => Promise<void>;
  fullLogout: () => Promise<void>;
} {
  const softLogout = useCallback(async () => {
    await signOut({ callbackUrl: "/login", redirect: true });
  }, []);

  const fullLogout = useCallback(async () => {
    await signOut({ redirect: false });
    window.location.href = "/api/auth/logout";
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void softLogout();
    });
    return () => setUnauthorizedHandler(null);
  }, [softLogout]);

  return { softLogout, fullLogout };
}
