import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getEnv } from './config/env.js';
import { authRouter } from './routes/auth.js';
import { adminRouter, claimsRouter } from './routes/claims.js';
import { errorHandler, HttpError } from './utils/http.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: getEnv().CLIENT_URL.split(',').map(value => value.trim()) }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }), authRouter);
  app.use('/api/claims', claimsRouter);
  app.use('/api/admin', adminRouter);
  app.use((_req, _res, next) => next(new HttpError(404, 'Route not found')));
  app.use(errorHandler);
  return app;
}
