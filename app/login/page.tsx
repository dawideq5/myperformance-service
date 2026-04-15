"use client";

import { signIn } from "next-auth/react";
import { AlertCircle, ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const handleLogin = async () => {
    await signIn("keycloak", { callbackUrl: "/dashboard" });
  };

  return (
    <div className="w-full max-w-[400px] px-6">
      <div className="flex flex-col items-center text-center">
        {/* Minimal Identity */}
        <div className="mb-12">
          <h1 className="text-3xl font-black tracking-tighter mb-2">MyPerformance</h1>
          <div className="h-1 w-8 bg-indigo-600 mx-auto rounded-full" />
        </div>

        {/* Login Card */}
        <div className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[2.5rem] p-10 shadow-xl shadow-black/5">
          <h2 className="text-xl font-bold mb-2">Witaj z powrotem</h2>
          <p className="text-sm text-[var(--text-muted)] font-medium mb-8">Zaloguj się bezpiecznie przez Keycloak</p>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-xs font-bold text-red-500">Błąd autoryzacji</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 group shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
          >
            <span>Kontynuuj</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <p className="mt-12 text-[10px] uppercase tracking-[0.2em] font-black text-[var(--text-muted)] opacity-50 font-sans">
          Identity Management
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] flex items-center justify-center transition-colors duration-500">
      <Suspense fallback={<div className="font-bold text-xs tracking-widest opacity-20 uppercase animate-pulse">Inicjalizacja...</div>}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
