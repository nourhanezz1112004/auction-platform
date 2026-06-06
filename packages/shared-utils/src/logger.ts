import winston from 'winston';

const isDev = process.env.NODE_ENV !== 'production';

export interface Logger {
  info(objOrMsg: string | object, message?: string, ...meta: any[]): void;
  error(objOrMsg: string | object, message?: string, ...meta: any[]): void;
  warn(objOrMsg: string | object, message?: string, ...meta: any[]): void;
  debug(objOrMsg: string | object, message?: string, ...meta: any[]): void;
  http(objOrMsg: string | object, message?: string, ...meta: any[]): void;
}

// ─── Format ───────────────────────────────────────────────────────────────────

const devFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    // Remove internal winston fields so meta is clean
    const { splat: _s, ...rest } = meta as any;
    const metaStr = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
  }),
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const winstonLogger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: isDev ? devFormat : prodFormat,
  transports: [new winston.transports.Console()],
});

// ─── Pino-style adapter ───────────────────────────────────────────────────────
// Supports both:
//   logger.info('plain message')
//   logger.info({ key: 'value' }, 'message with context')   ← pino / bunyan style

function adapt(
  level: 'info' | 'error' | 'warn' | 'debug' | 'http',
  objOrMsg: string | object,
  message?: string,
  ...rest: any[]
): void {
  if (typeof objOrMsg === 'string') {
    // Plain string call: logger.info('message')
    winstonLogger[level](objOrMsg, ...rest);
  } else {
    // Object-first call: logger.info({ key }, 'message')
    const msg = message ?? '';
    winstonLogger[level](msg, { ...(objOrMsg as object) });
  }
}

export const logger: Logger = {
  info:  (o, m, ...r) => adapt('info',  o, m, ...r),
  error: (o, m, ...r) => adapt('error', o, m, ...r),
  warn:  (o, m, ...r) => adapt('warn',  o, m, ...r),
  debug: (o, m, ...r) => adapt('debug', o, m, ...r),
  http:  (o, m, ...r) => adapt('http',  o, m, ...r),
};
