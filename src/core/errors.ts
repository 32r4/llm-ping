import type { AppErrorType } from "./types";

export class AppError extends Error {
  readonly type: AppErrorType;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(type: AppErrorType, message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
  }
}
