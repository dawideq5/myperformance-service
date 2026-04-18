import { AlertCircle, CheckCircle2, Info, AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AlertTone = "info" | "success" | "warning" | "error";

interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: LucideIcon | false;
  className?: string;
}

const toneStyles: Record<
  AlertTone,
  { box: string; text: string; icon: LucideIcon }
> = {
  info: {
    box: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    text: "text-blue-400",
    icon: Info,
  },
  success: {
    box: "bg-green-500/10 border-green-500/20 text-green-500",
    text: "text-green-500",
    icon: CheckCircle2,
  },
  warning: {
    box: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
    text: "text-yellow-500",
    icon: AlertTriangle,
  },
  error: {
    box: "bg-red-500/10 border-red-500/20 text-red-500",
    text: "text-red-500",
    icon: AlertCircle,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  icon,
  className,
}: AlertProps) {
  const style = toneStyles[tone];
  const Icon = icon === false ? null : (icon ?? style.icon);
  const roleValue = tone === "error" ? "alert" : "status";

  return (
    <div
      role={roleValue}
      className={cn(
        "flex items-start gap-3 p-4 border rounded-xl text-sm",
        style.box,
        className,
      )}
    >
      {Icon && (
        <Icon
          className={cn("w-5 h-5 flex-shrink-0 mt-0.5", style.text)}
          aria-hidden="true"
        />
      )}
      <div className="flex-1 min-w-0">
        {title && (
          <p className={cn("font-medium mb-1", style.text)}>{title}</p>
        )}
        {children && (
          <div className="text-[var(--text-muted)] leading-relaxed">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
