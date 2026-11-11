import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { env } from './env.js';
import { requireAuth } from './auth/session.js';
import authRouter from './routes/auth.js';
import reportsRouter from './routes/reports.js';
import { HttpError } from './lib/http.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          // pdf.js renders pages in a worker.
          workerSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }),
  );

  // Whether the server and its database are up — the root URL and
  // /api/health both answer with this. 503 when the database is not
  // connected, so a monitor sees the real state, not just a live process.
  const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const health = (req, res) => {
    const database = DB_STATES[mongoose.connection.readyState] ?? 'unknown';
    const ok = database === 'connected';
    res.status(ok ? 200 : 503).json({
      ok,
      service: 'medithink',
      message: ok ? 'MediThink server is working well.' : `MediThink server is running, but the database is ${database}.`,
      database,
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
  };
  app.get('/api/health', health);
  app.use('/api/auth', authRouter);
  app.use('/api/reports', requireAuth, reportsRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Production: the built client, from the same origin as the API.
  const indexHtml = path.join(env.CLIENT_DIST, 'index.html');
  if (env.isProd && fs.existsSync(indexHtml)) {
    app.use(express.static(env.CLIENT_DIST, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(indexHtml));
  } else {
    // Development (the client runs on Vite): the root URL says the API is up.
    app.get('/', health);
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
    console.error('[server]', err);
    return res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
  });

  return app;
}
