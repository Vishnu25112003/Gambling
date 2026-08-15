/**
 * Deliberately tiny structured logger — no dependency, JSON-ish lines that are
 * greppable in dev and parseable if piped somewhere later.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

function emit(level: Level, scope: string, msg: string, meta?: unknown): void {
  const time = new Date().toISOString();
  const head = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET} ${time} [${scope}]`;
  if (meta === undefined) {
    // eslint-disable-next-line no-console
    console.log(`${head} ${msg}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`${head} ${msg}`, meta);
  }
}

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, meta) => emit('debug', scope, m, meta),
    info: (m, meta) => emit('info', scope, m, meta),
    warn: (m, meta) => emit('warn', scope, m, meta),
    error: (m, meta) => emit('error', scope, m, meta),
  };
}

export const logger = createLogger('app');
