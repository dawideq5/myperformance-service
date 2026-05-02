import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-subtle": "var(--bg-subtle)",
        "bg-muted": "var(--bg-muted)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-light": "var(--text-light)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-fg": "var(--accent-fg)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: [
          "Geist",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        mono: ["Geist Mono", "JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
