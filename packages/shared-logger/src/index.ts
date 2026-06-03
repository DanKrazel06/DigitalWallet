import pino, { type Logger, type LoggerOptions } from 'pino'

export type { Logger }

export interface CreateLoggerOptions {
  service: string
  level?: pino.LevelWithSilent
  pretty?: boolean
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const { service, level = process.env.LOG_LEVEL ?? 'info', pretty = process.env.NODE_ENV !== 'production' } = options

  const baseConfig: LoggerOptions = {
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['password', 'token', 'authorization', '*.password', '*.token', 'req.headers.authorization'],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  }

  if (pretty) {
    return pino({
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    })
  }

  return pino(baseConfig)
}
