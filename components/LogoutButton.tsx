"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const handleLogout = async () => {
    // 1. Clear NextAuth session
    await signOut({ redirect: false });

    // 2. Redirect through the server-side logout endpoint
    window.location.href = "/api/auth/logout";
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
