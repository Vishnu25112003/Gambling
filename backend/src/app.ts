import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { corsOrigins, isProd } from './config/env.js';
import { buildApiRouter } from './routes/index.js';
import { AppError } from './lib/errors.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('http');

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
