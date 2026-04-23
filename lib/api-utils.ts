import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import {
  ApiError,
  type ApiErrorCode,
  type ApiErrorResponse,
  type ApiSuccessResponse,
} from "@/lib/api-errors";

export {
  ApiError,
  type ApiErrorCode,
  type ApiErrorResponse,
  type ApiSuccessResponse,
};

export function createErrorResponse(
  code: ApiErrorCode,
  message: string,
  details?: string,
  status: number = 500,
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
  if (error instanceof ApiError) {
    log.info("api.error", {
      code: error.code,
      status: error.status,
      message: error.message,
      details: error.details,
    });
    return createErrorResponse(error.code, error.message, error.details, error.status);
  }

  log.error("api.unhandled_error", { err: error });

  if (error instanceof Error) {
    return createErrorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      process.env.NODE_ENV === "development" ? error.message : undefined,
      500,
    );
  }

  return createErrorResponse("INTERNAL_ERROR", "An unexpected error occurred", undefined, 500);
}

export function validateRequestBody<T extends Record<string, unknown>>(
  body: unknown,
  requiredFields: (keyof T)[],
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
  timeoutMs: number = 10000,
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

/**
 * Throws ApiError.unauthorized() if session is missing or has no accessToken.
 * Use at the top of every API route handler instead of repeating the check inline.
 */
export function requireSession(
  session: Session | null | undefined,
): asserts session is Session & { accessToken: string } {
  if (!session || !session.accessToken) {
    throw ApiError.unauthorized();
  }
}
