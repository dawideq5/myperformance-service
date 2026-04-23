/**
 * Pure, client-safe API error types. No Node-only imports — this module is
 * imported by shared RBAC helpers (`lib/admin-auth.ts`) that run in both the
 * React client bundle and the server runtime.
 *
 * Server-only helpers (`handleApiError`, `requireSession`) live in
 * `lib/api-utils.ts` and depend on the structured logger + Node runtime.
 */

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

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number,
    public details?: string,
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
