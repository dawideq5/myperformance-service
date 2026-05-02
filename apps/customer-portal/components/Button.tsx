import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]",
  secondary:
    "bg-white text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--bg-muted)]",
  ghost: "text-[var(--text)] hover:bg-[var(--bg-muted)]",
};

const sizes: Record<Size, string> = {
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className = "",
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
        {...rest}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          />
        ) : null}
        {children}
      </button>
    );
  },
);
