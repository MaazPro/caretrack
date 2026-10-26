import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { HttpError } from '../utils/http.js';
import type { Role } from '../models/User.js';

declare global {
  namespace Express {
    interface Request { auth?: { id: string; role: Role } }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = /^Bearer (.+)$/i.exec(req.header('authorization') || '')?.[1];
  if (!token) return next(new HttpError(401, 'Authentication required'));
  try {
    const payload = jwt.verify(token, getEnv().JWT_SECRET);
    if (typeof payload === 'string' || !payload.sub || (payload.role !== 'CUSTOMER' && payload.role !== 'ADMIN')) throw new Error('Invalid token');
    req.auth = { id: payload.sub, role: payload.role };
    next();
  } catch { next(new HttpError(401, 'Invalid or expired session')); }
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) =>
    req.auth?.role === role ? next() : next(new HttpError(403, 'Access denied'));
}
