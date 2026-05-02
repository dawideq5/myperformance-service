import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ChatwootWidget } from "@/components/ChatwootWidget";
import { UnifiedTopBar } from "@/components/UnifiedTopBar";

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
              wykrywa pathname → nazwa widoku (statycznie, bez animacji)
              oraz session → menu narzędzi z helpera admin-auth. */}
          <UnifiedTopBar />
          {children}
          <ChatwootWidget />
        </Providers>
      </body>
    </html>
  );
}
