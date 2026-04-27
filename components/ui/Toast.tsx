"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs: number;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  /** Niski poziom — kontrola durationMs. */
  push: (t: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<
  ToastTone,
  { icon: ReactNode; bar: string; iconBg: string }
> = {
  success: {
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    bar: "bg-emerald-500",
    iconBg: "bg-emerald-500/10",
  },
  error: {
    icon: <AlertCircle className="w-5 h-5 text-red-400" />,
    bar: "bg-red-500",
    iconBg: "bg-red-500/10",
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    bar: "bg-amber-500",
    iconBg: "bg-amber-500/10",
  },
  info: {
    icon: <Info className="w-5 h-5 text-blue-400" />,
    bar: "bg-blue-500",
    iconBg: "bg-blue-500/10",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { ...t, id }]);
      window.setTimeout(() => remove(id), t.durationMs);
    },
    [remove],
  );

  const api: ToastApi = {
    push,
    success: (title, description) =>
      push({ tone: "success", title, description, durationMs: 4000 }),
    error: (title, description) =>
      push({ tone: "error", title, description, durationMs: 6000 }),
    warning: (title, description) =>
      push({ tone: "warning", title, description, durationMs: 5000 }),
    info: (title, description) =>
      push({ tone: "info", title, description, durationMs: 4000 }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed top-4 right-4 z-[2100] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        role="region"
        aria-label="Powiadomienia"
      >
        {toasts.map((t) => {
          const s = TONE_STYLE[t.tone];
          return (
            <div
              key={t.id}
              className="pointer-events-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl overflow-hidden animate-fade-in"
              role={t.tone === "error" ? "alert" : "status"}
            >
              <div className={`h-0.5 w-full ${s.bar}`} />
              <div className="flex items-start gap-3 p-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${s.iconBg}`}
                >
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{t.title}</div>
                  {t.description && (
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {t.description}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="p-1 -m-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  aria-label="Zamknij powiadomienie"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback — nie crashujemy buildu jeśli ktoś zapomni provider
    return {
      push: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
    };
  }
  return ctx;
}
