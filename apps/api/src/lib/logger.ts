import pino from 'pino';

// Development: readable coloured lines. Production: one JSON object per line, which
// log tools can search and filter by field.
export function createLogger(options: { level: string; pretty: boolean }) {
  return pino({
    level: options.level,
    base: { service: 'api' },
    transport: options.pretty ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' } } : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
