import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export const asyncRoute = (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next); };

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ message: 'Invalid JSON body' }); return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ message: 'Request body is too large' }); return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ message: 'Invalid request', details: error.flatten().fieldErrors }); return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Receipt must be 5 MB or smaller' : 'Invalid receipt upload' }); return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message, ...(error.details ? { details: error.details } : {}) }); return;
  }
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    res.status(409).json({ message: 'A record with these details already exists' }); return;
  }
  console.error('Request failed', error);
  res.status(500).json({ message: 'Something went wrong' });
}
