"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ExternalLink, LogOut } from "lucide-react";
import { Button } from "@/components/ui";

const DASHBOARD_URL = process.env.NEXT_PUBLIC_DASHBOARD_URL || "https://myperformance.pl";

export function AppHeader({
  userLabel,
  userSubLabel,
  roles,
}: {
  userLabel?: string;
  userSubLabel?: string;
  roles?: string[];
}) {
  return (
    <header className="flex items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-800/80">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/"
          className="flex items-center gap-2 text-slate-100 font-semibold"
        >
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center shadow">
            <span className="text-white text-lg font-bold">▲</span>
          </span>
          <span>
            <span className="block leading-tight">Obieg dokumentów</span>
            <span className="block text-[11px] font-normal text-slate-400">
              dokumenty.myperformance.pl
            </span>
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:block text-right min-w-0">
          <div className="text-sm text-slate-200 truncate max-w-[220px]">
            {userLabel ?? userSubLabel}
          </div>
          {roles && roles.length > 0 ? (
            <div className="text-[10px] text-slate-500 truncate max-w-[220px]">
              {roles.join(", ")}
            </div>
          ) : null}
        </div>
        <a
          href={DASHBOARD_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
          Dashboard
        </a>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<LogOut className="w-4 h-4" aria-hidden />}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Wyloguj
        </Button>
      </div>
    </header>
  );
}
