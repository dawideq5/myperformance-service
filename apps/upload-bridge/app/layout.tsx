import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Upload zdjęć — myperformance.pl",
  description: "Mobilny upload zdjęć do zlecenia serwisowego",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Dark theme — kolor z dashboard --bg-header żeby status bar mobilny
  // nie błyskał kontrastem przy scrollu.
  themeColor: "#0f0f16",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" className="dark">
      <body>{children}</body>
    </html>
  );
}
