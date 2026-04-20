import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "error";

const TONE: Record<Tone, { cls: string; icon: ReactNode }> = {
  info: {
    cls: "bg-sky-500/10 text-sky-200 border-sky-500/30",
    icon: <Info className="w-4 h-4 flex-shrink-0" aria-hidden />,
  },
  success: {
    cls: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
    icon: <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden />,
  },
  warning: {
    cls: "bg-amber-500/10 text-amber-200 border-amber-500/40",
    icon: <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />,
  },
  error: {
    cls: "bg-red-500/10 text-red-200 border-red-500/40",
    icon: <XCircle className="w-4 h-4 flex-shrink-0" aria-hidden />,
  },
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
        t.cls,
        className,
      )}
      role="status"
    >
      {t.icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
