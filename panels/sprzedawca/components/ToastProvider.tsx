"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Loader2, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info" | "progress";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Krótki tytuł nad message (opcjonalny). */
  title?: string;
  /** True = nie auto-dismiss (do procesów wieloetapowych). */
  sticky?: boolean;
  /** Akcja w postaci buttona (np. "Otwórz podpis"). */
  action?: { label: string; onClick: () => void };
  /** Liczba 0-100 dla progress bar (kind="progress"). */
  progress?: number;
}

interface ToastContextValue {
  push: (toast: Omit<Toast, "id">) => number;
  update: (id: number, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Tryb fallback — kiedy provider nie jest dostępny (np. testy),
    // toast staje się no-op + console.log żeby nic nie pękło.
    return {
      push: (t) => {
        // eslint-disable-next-line no-console
        console.log("[toast:fallback]", t.kind, t.title, t.message);
        return 0;
      },
      update: () => undefined,
      dismiss: () => undefined,
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: number) => {
    setToasts((p) => p.filter((t) => t.id !== id));
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, kind: ToastKind, sticky?: boolean) => {
      if (sticky) return;
      const ms = kind === "error" ? 7000 : kind === "success" ? 5000 : 4500;
      const old = timersRef.current.get(id);
      if (old) clearTimeout(old);
      timersRef.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  const push = useCallback(
    (toast: Omit<Toast, "id">): number => {
      const id = ++idRef.current;
      setToasts((p) => [...p, { ...toast, id }]);
      scheduleDismiss(id, toast.kind, toast.sticky);
      return id;
    },
    [scheduleDismiss],
  );

  const update = useCallback(
    (id: number, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((p) =>
        p.map((t) => {
          if (t.id !== id) return t;
          const next = { ...t, ...patch };
          // Auto-dismiss timer reset gdy zmienia się kind/sticky.
          if (patch.kind !== undefined || patch.sticky !== undefined) {
            scheduleDismiss(id, next.kind, next.sticky);
          }
          return next;
        }),
      );
    },
    [scheduleDismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ push, update, dismiss }),
    [push, update, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[2200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ToastItem = memo(function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const Icon = ICONS[toast.kind];
  return (
    <div
      className="pointer-events-auto rounded-xl border shadow-2xl px-4 py-3 text-sm flex items-start gap-2 animate-fade-in"
      style={{
        background:
          toast.kind === "success"
            ? "rgba(34,197,94,0.95)"
            : toast.kind === "error"
              ? "rgba(239,68,68,0.95)"
              : toast.kind === "progress"
                ? "rgba(30,41,59,0.95)"
                : "rgba(30,41,59,0.95)",
        borderColor:
          toast.kind === "success"
            ? "#22c55e"
            : toast.kind === "error"
              ? "#ef4444"
              : "#334155",
        color: "#fff",
        backdropFilter: "blur(12px)",
      }}
    >
      <Icon
        className={`w-4 h-4 flex-shrink-0 mt-0.5 ${toast.kind === "progress" ? "animate-spin" : ""}`}
      />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="font-semibold mb-0.5">{toast.title}</p>
        )}
        <p className="leading-snug">{toast.message}</p>
        {typeof toast.progress === "number" && (
          <div className="mt-2 h-1 w-full bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-[width] duration-300"
              style={{ width: `${Math.max(0, Math.min(100, toast.progress))}%` }}
            />
          </div>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="mt-2 text-xs font-semibold underline opacity-90 hover:opacity-100"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      {!toast.sticky && (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="opacity-70 hover:opacity-100"
          aria-label="Zamknij"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  progress: Loader2,
} as const;
