import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";

export const metadata: Metadata = {
  title: {
    default: "Serwis telefonów — Caseownia",
    template: "%s · Serwis telefonów — Caseownia",
  },
  description:
    "Sprawdź status naprawy telefonu online. Bez konta, bez logowania — wystarczy email i 6-cyfrowy kod.",
  applicationName: "Caseownia — Serwis",
  formatDetection: { email: false, address: false, telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body className="min-h-screen flex flex-col">
        <AppHeader />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </body>
    </html>
  );
}
