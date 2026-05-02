"use client";

import {
  TONE_BADGE_CLASS,
  getStatusMeta,
} from "@/lib/serwisant/status-meta";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<"sm" | "md", string> = {
  sm: "text-[11px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
};

export function StatusBadge({
  status,
  size = "sm",
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const meta = getStatusMeta(status);
  const classes = [
    "inline-flex items-center font-medium rounded-full border whitespace-nowrap",
    SIZE_CLASS[size],
    TONE_BADGE_CLASS[meta.tone],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      title={meta.description}
      aria-label={meta.label}
    >
      {showIcon ? meta.icon : null}
      <span>{meta.label}</span>
    </span>
  );
}
