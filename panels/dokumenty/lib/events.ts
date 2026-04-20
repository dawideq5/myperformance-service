import { randomUUID } from "node:crypto";

export type EventPayload = {
  type:
    | "submission.created"
    | "submission.completed"
    | "submission.declined"
    | "submission.expired"
    | "submitter.opened"
    | "submitter.signed"
    | "template.created"
    | "template.updated"
    | "state.refresh";
  submissionId?: number;
  submitterId?: number;
  templateId?: number;
  at: string;
  data?: unknown;
};

type Listener = (event: EventPayload) => void;

declare global {
  var __MYP_DOKUMENTY_EVENTS__: {
    listeners: Map<string, Listener>;
    recent: EventPayload[];
  } | undefined;
}

function bus() {
  if (!globalThis.__MYP_DOKUMENTY_EVENTS__) {
    globalThis.__MYP_DOKUMENTY_EVENTS__ = { listeners: new Map(), recent: [] };
  }
  return globalThis.__MYP_DOKUMENTY_EVENTS__;
}

export function subscribe(listener: Listener): { id: string; unsubscribe: () => void } {
  const id = randomUUID();
  bus().listeners.set(id, listener);
  return {
    id,
    unsubscribe: () => bus().listeners.delete(id),
  };
}

export function broadcast(event: EventPayload) {
  const b = bus();
  b.recent.push(event);
  if (b.recent.length > 50) b.recent.shift();
  for (const l of b.listeners.values()) {
    try {
      l(event);
    } catch {}
  }
}

export function getRecent(): EventPayload[] {
  return [...bus().recent];
}

export function listenerCount(): number {
  return bus().listeners.size;
}
