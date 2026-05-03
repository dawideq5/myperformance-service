"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface State {
  error: Error | null;
  info: string | null;
}

/** Łapie błędy renderingu Three.js / GLTFLoader / Draco. Zamiast białego
 * ekranu pokazuje czytelny komunikat + console.error pełnego stack trace
 * + przycisk reload. Bez tego user widzi tylko spinner wiecznie. */
export class PhoneSceneErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("[PhoneSceneErrorBoundary]", error);
    console.error("componentStack:", errorInfo.componentStack);
    this.setState({ info: errorInfo.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md p-6 text-white">
        <div className="max-w-md w-full rounded-2xl border border-red-500/40 bg-red-500/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <h3 className="font-semibold">Nie udało się załadować modelu 3D</h3>
          </div>
          <p className="text-sm text-white/80 break-all">
            {this.state.error.message ?? String(this.state.error)}
          </p>
          {this.state.info && (
            <details className="text-[10px] text-white/50">
              <summary className="cursor-pointer">Szczegóły techniczne</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
                {this.state.info}
              </pre>
            </details>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Odśwież stronę
          </button>
        </div>
      </div>
    );
  }
}
