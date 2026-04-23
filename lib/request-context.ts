/**
 * Request-scoped context using AsyncLocalStorage.
 *
 * Propagates a `requestId` (X-Request-Id) through the async call tree so that
 * logs emitted from deep library code can be correlated back to the originating
 * HTTP request. Populated by middleware for every /api/* request; available to
 * `log.*` via `getRequestId()`.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T,
): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function newRequestId(): string {
  return randomUUID();
}

/**
 * Wraps an async route handler with a request-scoped context seeded from the
 * `x-request-id` header set by middleware. Ensures log lines emitted anywhere
 * in the handler's call tree include the correlation id.
 *
 *   export async function GET(req: Request) {
 *     return withRequestContext(req, async () => {
 *       // ... your logic
 *     });
 *   }
 */
export function withRequestContext<T>(
  req: Request,
  fn: () => Promise<T>,
): Promise<T> {
  const fromHeader = req.headers.get("x-request-id")?.trim();
  const requestId =
    fromHeader && /^[a-zA-Z0-9-]{8,128}$/.test(fromHeader)
      ? fromHeader
      : newRequestId();
  return storage.run({ requestId }, fn);
}
