"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginInner() {
  const params = useSearchParams();
  const error = params.get("error");
  return (
    <main
      className="min-h-screen flex items-center justify-center p-8"
      style={{ background: "var(--bg-main)" }}
    >
      <section
        className="max-w-md w-full rounded-2xl p-10 text-center border"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div
          className="w-14 h-14 rounded-xl mx-auto flex items-center justify-center text-white font-bold text-2xl mb-6"
          style={{ background: "linear-gradient(135deg, #6366f1, #14b8a6)" }}
        >
          MP
        </div>
        <h1
          className="text-xl font-bold mb-2"
          style={{ color: "var(--text-main)" }}
        >
          Panel Kierowcy
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Aby kontynuować, zaloguj się przez MyPerformance SSO.
        </p>
        {error ? (
          <p
            className="mb-4 rounded-md text-sm p-3"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
            }}
          >
            Logowanie nieudane. Spróbuj ponownie.
          </p>
        ) : null}
        <button
          onClick={() => signIn("keycloak", { callbackUrl: "/" })}
          className="w-full text-white font-semibold py-2.5 rounded-xl transition"
          style={{
            background: "linear-gradient(135deg, #6366f1, #14b8a6)",
            boxShadow: "0 10px 20px rgba(99, 102, 241, 0.3)",
          }}
        >
          Zaloguj się przez MyPerformance
        </button>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
