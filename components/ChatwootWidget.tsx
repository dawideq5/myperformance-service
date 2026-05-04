"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Chatwoot website widget z HMAC user verification. Dostępny dla KAŻDEGO
 * zalogowanego usera (nie tylko z rolą chatwoot_*) — to jest kanał
 * kontaktu z wewnętrznymi działami MyPerformance.
 *
 * Flow:
 *   1. Po zalogowaniu fetch /api/account/chatwoot-identity (HMAC + name).
 *   2. Wstawiamy <script> z Chatwoot SDK do <head>.
 *   3. window.chatwootSDK.run(...) inicjalizuje widget.
 *   4. window.$chatwoot.setUser(identifier, {email, name, identifier_hash}).
 */
export function ChatwootWidget() {
  const { status } = useSession();
  const pathname = usePathname();
  const initialized = useRef(false);

  // Wave 24 — `/chatwoot-app/*` to iframe Dashboard App ładowany z poziomu
  // Chatwoota; mountowanie tam SDK powodowało duplikat dymka czatu.
  const suppressed = pathname?.startsWith("/chatwoot-app") ?? false;

  useEffect(() => {
    if (suppressed) return;
    if (status !== "authenticated" || initialized.current) return;
    initialized.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/account/chatwoot-identity", {
          credentials: "same-origin",
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          data?: {
            identifier?: string;
            identifier_hash?: string | null;
            email?: string;
            name?: string;
            websiteToken?: string | null;
            baseUrl?: string;
          };
        };
        const data = json?.data;
        if (!data?.websiteToken || !data.baseUrl) {
          // Brak websiteToken w env → widget nie startuje, log w devtools.
          console.info("[ChatwootWidget] websiteToken not configured");
          return;
        }

        const w = window as unknown as {
          chatwootSDK?: {
            run: (config: { websiteToken: string; baseUrl: string }) => void;
          };
          $chatwoot?: {
            setUser: (
              identifier: string,
              user: {
                email?: string;
                name?: string;
                identifier_hash?: string;
              },
            ) => void;
          };
          chatwootSettings?: Record<string, unknown>;
        };

        // Wstaw <script> tylko raz.
        if (!document.querySelector("script[data-chatwoot-sdk]")) {
          w.chatwootSettings = {
            position: "right",
            type: "standard",
            launcherTitle: "Wsparcie MyPerformance",
          };
          const s = document.createElement("script");
          s.src = `${data.baseUrl}/packs/js/sdk.js`;
          s.defer = true;
          s.async = true;
          s.dataset.chatwootSdk = "true";
          s.onload = () => {
            if (cancelled || !w.chatwootSDK) return;
            w.chatwootSDK.run({
              websiteToken: data.websiteToken!,
              baseUrl: data.baseUrl!,
            });

            // setUser dopiero po `chatwoot:ready` event — wcześniej $chatwoot
            // może być undefined. Listener jednorazowy.
            window.addEventListener(
              "chatwoot:ready",
              () => {
                if (!w.$chatwoot || !data.identifier || !data.identifier_hash)
                  return;
                w.$chatwoot.setUser(data.identifier, {
                  email: data.email,
                  name: data.name,
                  identifier_hash: data.identifier_hash,
                });
              },
              { once: true },
            );
          };
          document.head.appendChild(s);
        }
      } catch (err) {
        console.warn("[ChatwootWidget] init failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, suppressed]);

  return null;
}
