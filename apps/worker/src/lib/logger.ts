import pino from 'pino';

export function createLogger(options: { level: string; pretty: boolean }) {
  return pino({
    level: options.level,
    base: { service: 'worker' },
    transport: options.pretty ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' } } : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
