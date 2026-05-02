"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface State {
  error: Error | null;
  info: string | null;
  /** Wave 21 Faza 1G — wykryto WebGL context lost. Wtedy zamiast crash
   * ekranu pokazujemy soft fallback z opcją retry (re-mount Canvas). */
  contextLost: boolean;
  /** Inkrementowany na retry — używany jako React key dla re-mount. */
  retryKey: number;
}

/** Łapie błędy renderingu Three.js / GLTFLoader / Draco. Zamiast białego
 * ekranu pokazuje czytelny komunikat + console.error pełnego stack trace
 * + przycisk reload. Bez tego user widzi tylko spinner wiecznie.
 *
 * Wave 21 Faza 1G — dodatkowo nasłuchuje WebGL context lost na canvasie
 * w drzewie children. Gdy GPU zabiera kontekst (browser pressure, tab
 * suspend), prezentujemy fallback "Odśwież widok 3D" zamiast crashu —
 * usery ratują zlecenie bez utraty stanu reszty UI. */
export class PhoneSceneErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = {
    error: null,
    info: null,
    contextLost: false,
    retryKey: 0,
  };
  private rootRef = { current: null as HTMLDivElement | null };
  private listenersAttached = false;
  private boundLost: ((e: Event) => void) | null = null;
  private boundRestored: (() => void) | null = null;
  private observer: MutationObserver | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, info: null };
  }

  componentDidMount(): void {
    this.attachWebglListeners();
  }

  componentDidUpdate(): void {
    if (!this.listenersAttached) this.attachWebglListeners();
  }

  componentWillUnmount(): void {
    this.detachWebglListeners();
  }

  /** Próbuje znaleźć canvas w drzewie i podpiąć listenery context lost.
   * Canvas może pojawić się asynchronicznie (Suspense + dynamic import),
   * więc używamy MutationObserver żeby zaczekać na element. */
  private attachWebglListeners(): void {
    const root = this.rootRef.current;
    if (!root) return;
    const tryAttach = () => {
      const canvas = root.querySelector("canvas");
      if (!canvas) return false;
      this.boundLost = (e: Event) => {
        e.preventDefault();
        console.warn("[PhoneSceneErrorBoundary] WebGL context lost");
        this.setState({ contextLost: true });
      };
      this.boundRestored = () => {
        console.info("[PhoneSceneErrorBoundary] WebGL context restored");
        // restored może się stać samo z siebie — wtedy nie potrzebujemy
        // re-mount. Ale gdy fallback jest widoczny, niech user kliknie
        // Retry (lepsze UX niż automatic flicker).
      };
      canvas.addEventListener(
        "webglcontextlost",
        this.boundLost as EventListener,
      );
      canvas.addEventListener(
        "webglcontextrestored",
        this.boundRestored as EventListener,
      );
      this.listenersAttached = true;
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      return true;
    };
    if (tryAttach()) return;
    // Jeszcze nie ma canvasa — observer.
    this.observer = new MutationObserver(() => {
      if (tryAttach()) {
        // attached — pozostaw observer.disconnect w tryAttach.
      }
    });
    this.observer.observe(root, { childList: true, subtree: true });
  }

  private detachWebglListeners(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (!this.listenersAttached || !this.rootRef.current) return;
    const canvas = this.rootRef.current.querySelector("canvas");
    if (canvas) {
      if (this.boundLost) {
        canvas.removeEventListener(
          "webglcontextlost",
          this.boundLost as EventListener,
        );
      }
      if (this.boundRestored) {
        canvas.removeEventListener(
          "webglcontextrestored",
          this.boundRestored as EventListener,
        );
      }
    }
    this.listenersAttached = false;
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("[PhoneSceneErrorBoundary]", error);
    console.error("componentStack:", errorInfo.componentStack);
    this.setState({ info: errorInfo.componentStack });
  }

  private retry = () => {
    this.detachWebglListeners();
    this.setState((prev) => ({
      contextLost: false,
      error: null,
      info: null,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    // Hard error (componentDidCatch) — pełny error screen.
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md p-6 text-white">
          <div className="max-w-md w-full rounded-2xl border border-red-500/40 bg-red-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <h3 className="font-semibold">
                Nie udało się załadować modelu 3D
              </h3>
            </div>
            <p className="text-sm text-white/80 break-all">
              {this.state.error.message ?? String(this.state.error)}
            </p>
            {this.state.info && (
              <details className="text-[10px] text-white/50">
                <summary className="cursor-pointer">
                  Szczegóły techniczne
                </summary>
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
    // Soft context lost — fallback z opcją retry (re-mount Canvas).
    return (
      <div
        ref={(el) => {
          this.rootRef.current = el;
        }}
        className="contents"
      >
        {this.state.contextLost ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md p-6 text-white z-10">
            <div className="max-w-md w-full rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold">
                  Widok 3D został zwolniony przez przeglądarkę
                </h3>
              </div>
              <p className="text-sm text-white/80">
                GPU oddało kontekst WebGL (np. inna karta zabrała zasoby).
                Kliknij aby przywrócić scenę — Twoje dane są bezpieczne.
              </p>
              <button
                type="button"
                onClick={this.retry}
                className="w-full px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Przywróć widok 3D
              </button>
            </div>
          </div>
        ) : null}
        <div key={this.state.retryKey} className="contents">
          {this.props.children}
        </div>
      </div>
    );
  }
}
