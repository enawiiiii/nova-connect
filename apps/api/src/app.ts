import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isLocalDevelopment } from './config/env.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFound } from './utils/errors.js';

export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", 'https://accounts.google.com'],
      frameSrc: ["'self'", 'https://accounts.google.com'],
      connectSrc: ["'self'", 'https://accounts.google.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'blob:'],
      workerSrc: ["'self'", 'blob:'],
    },
  },
}));
app.use(cors({ origin: isLocalDevelopment ? true : env.CLIENT_URL.split(',').map((value) => value.trim()), credentials: true }));
app.use('/api/v1/auth', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 180, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  service: 'nova-connect-api',
  release: 'persistent-session-v1',
  timestamp: new Date().toISOString(),
}));
app.use('/api/v1', apiRouter);
if (env.NODE_ENV === 'production') {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const webDirectory = path.resolve(moduleDirectory, '../../web/dist');
  app.use(express.static(webDirectory, {
    index: false,
    immutable: true,
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-store');
    },
  }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && req.accepts('html')) {
      res.setHeader('Cache-Control', 'no-store');
      return res.sendFile(path.join(webDirectory, 'index.html'));
    }
    next();
  });
}
app.use(notFound);
app.use(errorHandler);
