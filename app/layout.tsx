import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ChatwootWidget } from "@/components/ChatwootWidget";

export const metadata: Metadata = {
  title: "MyPerformance Dashboard",
  description: "Dashboard aplikacji MyPerformance",
};

// Inline bootstrap — czytamy preferencję motywu z localStorage / system i
// ustawiamy data-theme PRZED pierwszym paintem żeby uniknąć FOUC.
// .no-theme-transition zapobiega crossfadeowi na inicjalnym renderze;
// usuwamy ją po jednym frame.
const THEME_BOOTSTRAP = `
(function () {
  try {
    var stored = localStorage.getItem('mp-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    var html = document.documentElement;
    html.classList.add('no-theme-transition');
    html.classList.remove('light', 'dark');
    html.classList.add(theme);
    html.setAttribute('data-theme', theme);
    html.style.colorScheme = theme;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        html.classList.remove('no-theme-transition');
      });
    });
  } catch (_) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <Providers>
          {children}
          <ChatwootWidget />
        </Providers>
      </body>
    </html>
  );
}
