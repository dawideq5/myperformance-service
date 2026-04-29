"use client";

import { useEffect, useState } from "react";
import { SignaturePadDialog } from "./SignaturePadDialog";
import { useToast } from "./ToastProvider";

/** Onboarding podpisu pracownika — sprawdza czy user ma zapisany podpis
 * w mp_user_signatures. Jeśli nie, pokazuje modal SignaturePadDialog
 * z wymuszonym save. Bez zapisanego podpisu sprzedawca nie może
 * wysłać żadnego potwierdzenia elektronicznego. */
export function SignatureSetup({
  userLabel,
  userEmail,
}: {
  userLabel: string;
  userEmail: string;
}) {
  const toast = useToast();
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/relay/me/signature");
        if (!r.ok) {
          setNeedsSetup(true);
          return;
        }
        const j = await r.json();
        setNeedsSetup(!j.signature?.pngDataUrl);
      } catch {
        setNeedsSetup(true);
      }
    })();
  }, []);

  if (!needsSetup) return null;

  return (
    <SignaturePadDialog
      title="Skonfiguruj swój podpis"
      subtitle="Twój podpis będzie automatycznie umieszczany na potwierdzeniach odbioru. Skonfiguruj raz — używamy go we wszystkich Twoich dokumentach."
      signerName={userLabel}
      defaultName={userLabel}
      onCancel={() => {
        toast.push({
          kind: "info",
          message: "Bez podpisu nie możesz wysyłać potwierdzeń elektronicznych.",
        });
        setNeedsSetup(false);
      }}
      onConfirm={async (pngDataUrl) => {
        try {
          const r = await fetch("/api/relay/me/signature", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pngDataUrl,
              signedName: userLabel,
            }),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j?.error ?? `HTTP ${r.status}`);
          }
          toast.push({
            kind: "success",
            title: "Podpis zapisany",
            message: "Będzie automatycznie używany w potwierdzeniach.",
          });
          setNeedsSetup(false);
        } catch (e) {
          toast.push({
            kind: "error",
            message: e instanceof Error ? e.message : "Błąd zapisu podpisu",
          });
        }
        void userEmail;
      }}
    />
  );
}
