import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { UnifiedTopBar } from "@/components/UnifiedTopBar";

export const metadata: Metadata = {
  title: "Panel Serwisanta — MyPerformance",
  description: "Panel Serwisanta platformy MyPerformance",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <Providers>
          {/* TopBar globalny — logo (link do dashboardu), search, bell, user. */}
          <UnifiedTopBar title="Panel serwisanta" />
          {children}
        </Providers>
      </body>
    </html>
  );
}
