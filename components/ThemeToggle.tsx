"use client";

import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <label className="switch">
      <input
        type="checkbox"
        className="input"
        checked={theme === "dark"}
        onChange={toggleTheme}
        aria-label="Toggle theme"
      />
      <span className="slider">
        <span className="sun">
          <Sun />
        </span>
        <span className="moon">
          <Moon />
        </span>
      </span>
    </label>
  );
}
