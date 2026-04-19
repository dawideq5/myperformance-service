"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  LogOut,
  Settings,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { Button, PageHeader } from "@/components/ui";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { canAccessAdminPanel } from "@/lib/admin-auth";

export interface AppHeaderProps {
  userLabel?: string;
  userSubLabel?: string;
  showAccountLink?: boolean;
}

export function AppHeader({
  userLabel,
  userSubLabel,
  showAccountLink = true,
}: AppHeaderProps) {
  const { fullLogout } = useAuthRedirect();
  const { data: session } = useSession();

  const showUsers = canAccessAdminPanel(session);

  return (
    <PageHeader
      left={
        <Link
          href="/dashboard"
          className="font-bold text-lg tracking-tight text-[var(--text-main)] select-none"
          aria-label="MyPerformance — pulpit"
        >
          MyPerformance
        </Link>
      }
      right={
        <>
          {(userLabel || userSubLabel) && (
            <div className="hidden sm:flex items-center gap-3 pr-1 border-r border-[var(--border-subtle)] pr-4">
              <div className="w-9 h-9 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
              </div>
              <div className="text-right leading-tight">
                {userLabel && (
                  <p className="text-sm font-medium text-[var(--text-main)]">
                    {userLabel}
                  </p>
                )}
                {userSubLabel && (
                  <p className="text-xs text-[var(--text-muted)]">{userSubLabel}</p>
                )}
              </div>
            </div>
          )}
          {showUsers && (
            <Link
              href="/admin/users"
              aria-label="Panel administratora — użytkownicy"
              title="Zarządzanie użytkownikami"
              className="p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
            >
              <Shield className="w-5 h-5" aria-hidden="true" />
            </Link>
          )}
          {showAccountLink && (
            <Link
              href="/account"
              aria-label="Zarządzaj kontem"
              className="p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] transition-colors"
            >
              <Settings className="w-5 h-5" aria-hidden="true" />
            </Link>
          )}
          <Button
            variant="ghost"
            size="md"
            leftIcon={<LogOut className="w-4 h-4" aria-hidden="true" />}
            onClick={() => void fullLogout()}
          >
            <span className="hidden sm:inline">Wyloguj</span>
          </Button>
        </>
      }
    />
  );
}
