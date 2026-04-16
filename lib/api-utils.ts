import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "CONFLICT";

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: string;
  };
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export function createErrorResponse(
  code: ApiErrorCode,
  message: string,
  details?: string,
  status: number = 500
): NextResponse {
  const body: ApiErrorResponse = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };

  return NextResponse.json(body, { status });
}

export function createSuccessResponse<T>(data: T): NextResponse {
  const body: ApiSuccessResponse<T> = {
    data,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(body);
}

export function handleApiError(error: unknown): NextResponse {
  console.error("[API Error]", error);

  if (error instanceof ApiError) {
    return createErrorResponse(error.code, error.message, error.details, error.status);
  }

  if (error instanceof Error) {
    return createErrorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      process.env.NODE_ENV === "development" ? error.message : undefined,
      500
    );
  }

  return createErrorResponse("INTERNAL_ERROR", "An unexpected error occurred", undefined, 500);
}

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number,
    public details?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  static unauthorized(message = "Unauthorized"): ApiError {
    return new ApiError("UNAUTHORIZED", message, 401);
  }

  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError("FORBIDDEN", message, 403);
  }

  static badRequest(message: string, details?: string): ApiError {
    return new ApiError("BAD_REQUEST", message, 400, details);
  }

  static notFound(message = "Not found"): ApiError {
    return new ApiError("NOT_FOUND", message, 404);
  }

  static conflict(message: string, details?: string): ApiError {
    return new ApiError("CONFLICT", message, 409, details);
  }

  static serviceUnavailable(message = "Service temporarily unavailable"): ApiError {
    return new ApiError("SERVICE_UNAVAILABLE", message, 503);
  }
}

export function validateRequestBody<T extends Record<string, unknown>>(
  body: unknown,
  requiredFields: (keyof T)[]
): body is T {
  if (!body || typeof body !== "object") {
    return false;
  }

  const obj = body as Record<string, unknown>;

  for (const field of requiredFields) {
    if (obj[field as string] === undefined || obj[field as string] === null) {
      return false;
    }
  }

  return true;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
