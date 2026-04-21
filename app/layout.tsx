import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
    <html lang="pl" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
