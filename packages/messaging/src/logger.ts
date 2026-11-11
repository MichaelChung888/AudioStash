// The subset of pino's API this package uses, so it does not depend on pino.
type LogFn = (obj: object, msg?: string) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}
