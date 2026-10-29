export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFn = (message: string, fields?: Record<string, unknown>) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

export interface LoggerOptions {
  /** Strings (tokens) that must never appear in the output. */
  secrets?: readonly string[];
  write?: (line: string, level: LogLevel) => void;
  now?: () => Date;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

/** One JSON object per line; stderr for warn/error so a process manager can split them into separate logs. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const secrets = (options.secrets ?? []).filter((secret) => secret.length >= 8);
  const write =
    options.write ??
    ((line: string, level: LogLevel) => {
      if (level === 'warn' || level === 'error') console.error(line);
      else console.log(line);
    });
  const now = options.now ?? (() => new Date());

  const redact = (text: string): string => {
    let result = text;
    for (const secret of secrets) result = result.split(secret).join('[redacted]');
    return result;
  };

  const log = (level: LogLevel, message: string, fields: Record<string, unknown> = {}): void => {
    const entry = { time: now().toISOString(), level, message, ...fields };
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({ time: entry.time, level, message, note: 'unserializable fields' });
    }
    write(redact(line), level);
  };

  return {
    debug: (message, fields) => {
      log('debug', message, fields);
    },
    info: (message, fields) => {
      log('info', message, fields);
    },
    warn: (message, fields) => {
      log('warn', message, fields);
    },
    error: (message, fields) => {
      log('error', message, fields);
    },
  };
}
