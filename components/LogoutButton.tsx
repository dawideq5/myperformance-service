"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { getPublicKeycloakIssuer } from "@/lib/keycloak-config";

interface LogoutButtonProps {
  idToken: string;
}

export function LogoutButton({ idToken }: LogoutButtonProps) {
  const handleLogout = async () => {
    // 1. Clear NextAuth session
    await signOut({ redirect: false });

    // 2. Redirect to Keycloak logout endpoint
    const issuer = getPublicKeycloakIssuer();
    const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "";
    const postLogoutUri = `${window.location.origin}/login`;

    // URL format for Keycloak logout (OIDC)
    const logoutUrl = `${issuer}/protocol/openid-connect/logout?id_token_hint=${idToken}&post_logout_redirect_uri=${encodeURIComponent(postLogoutUri)}&client_id=${clientId}`;

    window.location.href = logoutUrl;
  };

  return (
    <button
      onClick={handleLogout}
      className="group flex items-center gap-3 px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-all duration-300 rounded-xl hover:bg-white/5 active:scale-95"
    >
      <div className="p-2 rounded-lg bg-gray-800/50 group-hover:bg-red-500/10 transition-colors">
        <LogOut className="w-4 h-4 group-hover:text-red-400 transition-colors" />
      </div>
      <span>Wyloguj</span>
    </button>
  );
}
