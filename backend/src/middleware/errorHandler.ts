import { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { message: err.message, details: err.details ?? undefined },
    });
    return;
  }
  console.error('[api] unhandled error:', err);
  res.status(500).json({ error: { message: 'Internal server error' } });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Not found' } });
}
