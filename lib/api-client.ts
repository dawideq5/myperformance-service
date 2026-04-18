/**
 * Typed fetch client for internal /api/* routes.
 *
 * Handles:
 *   - JSON parsing (always returns parsed body or throws ApiRequestError)
 *   - Envelope normalization ({ data, meta } vs bare payloads)
 *   - 401 → optional logout callback so UI can trigger a redirect once and not repeat per-call
 *
 * Not meant for external APIs.
 */

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiCallOptions<TBody = unknown> {
  method?: ApiMethod;
  body?: TBody;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly payload: unknown;

  constructor(
    message: string,
    options: { status: number; code?: string; details?: unknown; payload?: unknown },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.payload = options.payload;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function apiRequest<TResponse = unknown, TBody = unknown>(
  path: string,
  options: ApiCallOptions<TBody> = {},
): Promise<TResponse> {
  const { method = "GET", body, signal, headers } = options;

  const init: RequestInit = {
    method,
    cache: "no-store",
    credentials: "same-origin",
    signal,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  const response = await fetch(path, init);

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (response.ok) {
    return unwrapEnvelope<TResponse>(payload);
  }

  if (response.status === 401) {
    unauthorizedHandler?.();
  }

  const errorEnvelope =
    payload && typeof payload === "object"
      ? (payload as {
          error?: { code?: string; message?: string; details?: unknown } | string;
          message?: string;
        })
      : null;

  const errorInfo =
    errorEnvelope?.error && typeof errorEnvelope.error === "object"
      ? errorEnvelope.error
      : { code: undefined, message: undefined, details: undefined };

  const message =
    errorInfo.message ||
    (typeof errorEnvelope?.error === "string" ? errorEnvelope.error : undefined) ||
    errorEnvelope?.message ||
    response.statusText ||
    "Request failed";

  throw new ApiRequestError(message, {
    status: response.status,
    code: errorInfo.code,
    details: errorInfo.details,
    payload,
  });
}

export const api = {
  get: <T>(path: string, init?: Omit<ApiCallOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...init, method: "GET" }),
  post: <T, B = unknown>(path: string, body?: B, init?: Omit<ApiCallOptions<B>, "method" | "body">) =>
    apiRequest<T, B>(path, { ...init, method: "POST", body }),
  put: <T, B = unknown>(path: string, body?: B, init?: Omit<ApiCallOptions<B>, "method" | "body">) =>
    apiRequest<T, B>(path, { ...init, method: "PUT", body }),
  patch: <T, B = unknown>(path: string, body?: B, init?: Omit<ApiCallOptions<B>, "method" | "body">) =>
    apiRequest<T, B>(path, { ...init, method: "PATCH", body }),
  delete: <T = void>(path: string, init?: Omit<ApiCallOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...init, method: "DELETE" }),
};
