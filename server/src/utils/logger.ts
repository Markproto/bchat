/**
 * Lightweight structured logger for bchat.
 * Wraps console with consistent prefixes and JSON-friendly output.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function format(level: LogLevel, tag: string, message: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = `${ts} [${level.toUpperCase()}] [${tag}] ${message}`;
  return meta ? `${base} ${JSON.stringify(meta)}` : base;
}

export const logger = {
  info(tag: string, message: string, meta?: Record<string, unknown>) {
    console.log(format('info', tag, message, meta));
  },

  warn(tag: string, message: string, meta?: Record<string, unknown>) {
    console.warn(format('warn', tag, message, meta));
  },

  error(tag: string, message: string, meta?: Record<string, unknown>) {
    console.error(format('error', tag, message, meta));
  },

  debug(tag: string, message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(format('debug', tag, message, meta));
    }
  },
};
