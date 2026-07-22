/**
 * Structured JSON logging (Technical Build Spec §6 Observability). One
 * line of JSON per event to stdout/stderr — trivially ingestible by any
 * log aggregator, no dependency needed for that. Hand-rolled to match the
 * rest of this codebase's "no dependency for a ~20-line concern" style.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const VALID_LEVELS = new Set<LogLevel>(['debug', 'info', 'warn', 'error']);

function minLevel(env: NodeJS.ProcessEnv): LogLevel {
  const raw = (env.LOG_LEVEL ?? 'info').toLowerCase();
  return VALID_LEVELS.has(raw as LogLevel) ? (raw as LogLevel) : 'info';
}

function emit(level: LogLevel, event: string, fields: LogFields, env: NodeJS.ProcessEnv): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel(env)]) {
    return;
  }
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (event: string, fields: LogFields = {}, env: NodeJS.ProcessEnv = process.env) => emit('debug', event, fields, env),
  info: (event: string, fields: LogFields = {}, env: NodeJS.ProcessEnv = process.env) => emit('info', event, fields, env),
  warn: (event: string, fields: LogFields = {}, env: NodeJS.ProcessEnv = process.env) => emit('warn', event, fields, env),
  error: (event: string, fields: LogFields = {}, env: NodeJS.ProcessEnv = process.env) => emit('error', event, fields, env),
};
