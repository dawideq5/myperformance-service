import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeStyles = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-10 h-10",
};

export function Spinner({ size = "md", className, label = "Ładowanie" }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin text-[var(--text-muted)]", sizeStyles[size], className)}
      role="status"
      aria-label={label}
    />
  );
}
