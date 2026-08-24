import express from 'express';
import cors from 'cors';
import { corsOrigins, isProd } from './config/env.js';
import { buildApiRouter } from './routes/index.js';
import { AppError } from './lib/errors.js';
import { UPLOAD_ROOT, UPLOAD_URL_PREFIX } from './profile/avatarStore.js';
import { createLogger } from './lib/logger.js';
const log = createLogger('http');
export function createApp() {
    const app = express();
    app.set('trust proxy', 1);
    app.use(cors({ origin: corsOrigins, credentials: true }));
    app.use(express.json({ limit: '100kb' }));
    app.use((req, _res, next) => {
        if (req.path !== '/api/health')
            log.debug(`${req.method} ${req.path}`);
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
    app.use(UPLOAD_URL_PREFIX, express.static(UPLOAD_ROOT, {
        maxAge: '1y',
        immutable: true,
        index: false,
        dotfiles: 'deny',
    }));
    app.use((_req, res) => {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    });
    // Express 5 routes rejected promises here automatically.
    app.use((err, _req, res, _next) => {
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
                ...(isProd ? {} : { detail: err?.message }),
            },
        });
    });
    return app;
}
//# sourceMappingURL=app.js.map