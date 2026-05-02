import type { Metadata, Viewport } from "next";
import { Inter, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";

// Wave 21 Faza 1F: Geist (display) + Inter (body) + Geist Mono — załadowane
// przez next/font/google z subset latin-ext (polskie znaki). Zmienne CSS
// pinnujemy do tailwind fontFamily (--font-inter, --font-geist, --font-mono).
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-geist",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Serwis telefonów by Caseownia",
    template: "%s · Serwis telefonów by Caseownia",
  },
  description:
    "Sprawdź status naprawy telefonu online. Bez konta, bez logowania — wystarczy email i 6-cyfrowy kod.",
  applicationName: "Serwis telefonów by Caseownia",
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
    <html
      lang="pl"
      className={`${inter.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen flex flex-col bg-bg-main text-text-main">
        <AppHeader />
        <main className="flex-1">{children}</main>
        <AppFooter />
      </body>
    </html>
  );
}
