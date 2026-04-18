"use client";

import { Suspense } from "react";
import { AccountProvider } from "./AccountProvider";
import { AccountShell } from "./AccountShell";

function AccountFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)]" aria-busy="true" />
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountFallback />}>
      <AccountProvider>
        <AccountShell />
      </AccountProvider>
    </Suspense>
  );
}
