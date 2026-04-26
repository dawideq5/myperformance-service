import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MyPerformance Dashboard",
  description: "Dashboard aplikacji MyPerformance",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme czytany z cookie po stronie serwera — eliminuje FOUC i daje
  // spójny look na login/loading/dashboard, niezależnie od urządzenia.
  // Per-device persistence: ThemeToggle zapisuje cookie `mp_theme` które
  // tu jest podstawowym source-of-truth.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("mp_theme")?.value;
  const theme = themeCookie === "light" ? "light" : "dark";

  return (
    <html lang="pl" className={theme} style={{ colorScheme: theme }}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
