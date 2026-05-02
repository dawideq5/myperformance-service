import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ChatwootWidget } from "@/components/ChatwootWidget";
import { UnifiedTopBar } from "@/components/UnifiedTopBar";
import { PageGlowOverlay } from "@/components/PageGlowOverlay";

export const metadata: Metadata = {
  title: "MyPerformance Dashboard",
  description: "Dashboard aplikacji MyPerformance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className="dark" style={{ colorScheme: "dark" }}>
      <body>
        <Providers>
          {/* Uniwersalny TopBar widoczny na każdej stronie. Komponent sam
              wykrywa pathname → animowana nazwa widoku, oraz session →
              menu narzędzi z helpera admin-auth. */}
          <UnifiedTopBar />
          {/* Border-glow flow przy każdej zmianie ścieżki (1.2s). */}
          <PageGlowOverlay />
          {children}
          <ChatwootWidget />
        </Providers>
      </body>
    </html>
  );
}
