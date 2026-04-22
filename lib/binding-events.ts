import { EventEmitter } from "node:events";
import type {
  DeviceFingerprintComponents,
  FingerprintDiff,
} from "@/lib/device-fingerprint";

export type BindingEventKind = "created" | "seen" | "denied" | "reset";

export interface BindingEvent {
  kind: BindingEventKind;
  serialNumber: string;
  at: string;
  ip?: string;
  userAgent?: string;
  components?: DeviceFingerprintComponents;
  diff?: FingerprintDiff[];
  actor?: string;
}

type BindingListener = (event: BindingEvent) => void;

declare global {
  // Keep the bus on globalThis so Next.js dev HMR doesn't fragment listeners.
  // eslint-disable-next-line no-var
  var __certBindingBus: EventEmitter | undefined;
}

function getBus(): EventEmitter {
  if (!globalThis.__certBindingBus) {
    const bus = new EventEmitter();
    bus.setMaxListeners(64);
    globalThis.__certBindingBus = bus;
  }
  return globalThis.__certBindingBus;
}

export function emitBindingEvent(event: BindingEvent): void {
  getBus().emit("event", event);
}

export function subscribeBindingEvents(listener: BindingListener): () => void {
  const bus = getBus();
  bus.on("event", listener);
  return () => bus.off("event", listener);
}
