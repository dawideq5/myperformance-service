import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  header?: ReactNode;
  children: ReactNode;
  maxWidth?: "md" | "lg" | "xl" | "2xl";
  className?: string;
}

const widthStyles = {
  md: "max-w-3xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  "2xl": "max-w-7xl",
};

export function PageShell({
  header,
  children,
  maxWidth = "xl",
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] font-sans animate-fade-in",
        className,
      )}
    >
      {header}
      <main className={cn("mx-auto px-6 py-8", widthStyles[maxWidth])}>
        {children}
      </main>
    </div>
  );
}

interface PageHeaderProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  maxWidth?: "md" | "lg" | "xl" | "2xl";
}

export function PageHeader({
  left,
  right,
  maxWidth = "xl",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "border-b border-[var(--border-subtle)] bg-[var(--bg-header)]/80 backdrop-blur-md",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto px-6 h-16 flex items-center justify-between gap-4",
          widthStyles[maxWidth],
        )}
      >
        <div className="flex items-center gap-4 min-w-0">{left}</div>
        {right && <div className="flex items-center gap-3 flex-shrink-0">{right}</div>}
      </div>
    </header>
  );
}
