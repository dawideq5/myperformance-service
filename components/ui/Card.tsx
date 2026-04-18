import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Padding = "none" | "sm" | "md" | "lg";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
  interactive?: boolean;
}

const paddingStyles: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = "md", interactive = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl",
        paddingStyles[padding],
        interactive && "transition-colors hover:border-[var(--accent)]/30",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});

interface CardHeaderProps {
  icon?: ReactNode;
  iconBgClassName?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({
  icon,
  iconBgClassName,
  title,
  description,
  action,
  className,
}: CardHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-4 flex-1 min-w-0">
        {icon && (
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
              iconBgClassName ?? "bg-[var(--accent)]/10",
            )}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-main)] leading-tight">
            {title}
          </h2>
          {description && (
            <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
