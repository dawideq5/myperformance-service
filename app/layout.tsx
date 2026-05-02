import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ChatwootWidget } from "@/components/ChatwootWidget";

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
          {children}
          <ChatwootWidget />
        </Providers>
      </body>
    </html>
  );
}
