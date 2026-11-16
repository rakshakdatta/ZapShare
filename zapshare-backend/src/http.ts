import { STATUS_CODES } from 'node:http';
import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new HttpError(400, `${name} must be a non-empty string.`);
  }
  return value;
}

export function nonnegativeInteger(
  value: unknown,
  name: string,
  maximum: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new HttpError(
      400,
      `${name} must be an integer between 0 and ${maximum}.`,
    );
  }
  return value;
}

export function allowsWebOrigin(
  origin: string | undefined,
  host: string | undefined,
  permittedOrigin?: string,
): boolean {
  if (!origin) return true;
  if (permittedOrigin) return origin === permittedOrigin;
  if (!host) return false;

  try {
    const site = new URL(origin);
    const backend = new URL(`http://${host}`);
    return (
      ['http:', 'https:'].includes(site.protocol) &&
      site.hostname === backend.hostname &&
      site.port === '3005'
    );
  } catch {
    return false;
  }
}

export const handleHttpError: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let statusCode = 500;
  let message = 'Internal server error';
  if (error instanceof HttpError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (
    error instanceof Error &&
    'status' in error &&
    error.status === 400
  ) {
    statusCode = 400;
    message = 'Invalid request.';
  } else if (
    error instanceof Error &&
    'status' in error &&
    error.status === 413
  ) {
    statusCode = 413;
    message = 'Request body is too large.';
  } else {
    console.error(
      'HTTP request failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }

  response
    .status(statusCode)
    .json({ statusCode, message, error: STATUS_CODES[statusCode] });
};
