import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corsOrigins, env, isProd } from './config/env.js';
import { buildApiRouter } from './routes/index.js';
import { AppError } from './lib/errors.js';
import { UPLOAD_ROOT, UPLOAD_URL_PREFIX } from './profile/avatarStore.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('http');
const FRONTEND_INDEX = 'index.html';

/**
 * Find the Vite build without assuming the process' current working directory.
 *
 * The normal layout has frontend/dist next to backend/, but the relative depth
 * changes between `tsx src/app.ts` and the compiled `dist/src/app.js` entry
 * point. An explicit FRONTEND_DIST is supported for deployments that copy the
 * build somewhere else; otherwise try both source and compiled locations plus
 * the two common npm workspace working directories.
 */
function resolveFrontendDist(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const configured = env.FRONTEND_DIST?.trim();
  const candidates = configured
    ? [resolve(configured)]
    : [
        resolve(process.cwd(), 'frontend/dist'),
        resolve(process.cwd(), '../frontend/dist'),
        resolve(here, '../../frontend/dist'),
        resolve(here, '../../../frontend/dist'),
      ];

  return candidates.find((dir) => existsSync(resolve(dir, FRONTEND_INDEX))) ?? null;
}

/** Backend-owned paths must continue to return their own 404s, not index.html. */
function isBackendPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === UPLOAD_URL_PREFIX ||
    pathname.startsWith(`${UPLOAD_URL_PREFIX}/`) ||
    pathname === '/socket.io' ||
    pathname.startsWith('/socket.io/')
  );
}

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.use((req, _res, next) => {
    if (req.path !== '/api/health') log.debug(`${req.method} ${req.path}`);
    next();
  });

  app.use('/api', buildApiRouter());

  /**
   * Doc 11 — uploaded profile images.
   *
   * Mounted before the 404 handler, and cached hard: an avatar's path is stable
   * (`<userId>.webp`), so the URL stored on the user carries a `?v=` counter that
   * changes on every replace. That makes a year-long immutable cache correct
   * rather than a stale-image bug — and cheap, since the browser never re-requests
   * an unchanged avatar.
   *
   * `fallthrough` is left ON deliberately. With it off, express.static hands a
   * missing file to the error handler as a plain Error carrying `status: 404` —
   * which is not an AppError, so it would surface as a 500. Falling through
   * reaches the 404 handler below instead and returns a real 404. The JSON body is
   * meaningless to an <img>, but the STATUS is what the browser and the Avatar
   * component's onError fallback actually read.
   */
  app.use(
    UPLOAD_URL_PREFIX,
    express.static(UPLOAD_ROOT, {
      maxAge: '1y',
      immutable: true,
      index: false,
      dotfiles: 'deny',
    }),
  );

  /**
   * Production/same-origin frontend.
   *
   * Vite still owns the hot-reload server in development (`:5173`), but a
   * built `frontend/dist` is served here as well so one backend URL can serve
   * both the SPA and `/api`. The fallback is deliberately limited to GET/HEAD
   * and excludes API/upload/socket paths: a missing backend route must remain
   * JSON 404, never a successful HTML response that looks like an app route.
   */
  const frontendDist = resolveFrontendDist();
  if (frontendDist) {
    log.info(`frontend mounted from ${frontendDist}`);

    app.use(
      express.static(frontendDist, {
        index: false,
        maxAge: isProd ? '1h' : 0,
        dotfiles: 'deny',
      }),
    );

    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || isBackendPath(req.path)) {
        next();
        return;
      }

      res.sendFile(resolve(frontendDist, FRONTEND_INDEX), (err) => {
        if (err) next(err);
      });
    });
  } else {
    log.warn('frontend build not found — API only; run npm run build:frontend');
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  // Express 5 routes rejected promises here automatically.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({
        error: { code: err.code, message: err.message, details: err.details ?? undefined },
      });
      return;
    }

    log.error('unhandled error', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        // Never leak stack traces or driver messages to a client in production.
        ...(isProd ? {} : { detail: (err as Error)?.message }),
      },
    });
  });

  return app;
}
