import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-[var(--text-muted)] animate-pulse">
        <Loader2 className="w-12 h-12 animate-spin text-[var(--text-main)]" />
        <p className="text-sm font-semibold tracking-widest uppercase">
          Ładowanie...
        </p>
      </div>
    </div>
  );
}
