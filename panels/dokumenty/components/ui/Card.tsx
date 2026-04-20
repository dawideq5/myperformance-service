import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Padding = "none" | "sm" | "md" | "lg";

const PADDING: Record<Padding, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  children?: ReactNode;
}

export function Card({ padding = "md", className, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-2xl border border-slate-700/60 bg-slate-800/60 backdrop-blur-sm shadow-sm",
        PADDING[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
