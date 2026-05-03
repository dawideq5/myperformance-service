import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ChatwootWidget } from "@/components/ChatwootWidget";

export const metadata: Metadata = {
  title: "Panel Sprzedawcy — MyPerformance",
  description: "Panel Sprzedawcy platformy MyPerformance",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <Providers>
          {children}
          {/* Wave22 / F14 — floating Chatwoot widget. Sam komponent
              gateuje mount po useSession() === "authenticated", więc
              /login + /forbidden zostają czyste. */}
          <ChatwootWidget />
        </Providers>
      </body>
    </html>
  );
}
