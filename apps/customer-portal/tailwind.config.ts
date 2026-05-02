import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-main": "var(--bg-main)",
        "bg-subtle": "var(--bg-subtle)",
        "bg-card": "var(--bg-card)",
        "bg-muted": "var(--bg-muted)",
        "bg-surface": "var(--bg-surface)",
        border: "var(--border)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-main": "var(--text-main)",
        "text-muted": "var(--text-muted)",
        "text-light": "var(--text-light)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",
        "accent-fg": "var(--accent-fg)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        display: [
          "var(--font-geist)",
          "Geist",
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-geist-mono)",
          "Geist Mono",
          "JetBrains Mono",
          "ui-monospace",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
