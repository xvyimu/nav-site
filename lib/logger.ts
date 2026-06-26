/**
 * 结构化日志工具
 *
 * 替代 API 路由中的 console.error/console.log，
 * 提供分级日志和结构化输出，便于 Sentry 和日志聚合工具消费。
 */

type LogLevel = "error" | "warn" | "info" | "debug";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const MIN_LEVEL: LogLevel =
  process.env.NODE_ENV === "production" ? "info" : "debug";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === "production") {
    // 生产环境输出 JSON 格式，便于日志聚合
    return JSON.stringify(entry);
  }
  // 开发环境输出可读格式
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
  const err = entry.error ? `\n  ${entry.error.name}: ${entry.error.message}` : "";
  return `[${entry.level.toUpperCase()}] ${entry.message}${ctx}${err}`;
}

function log(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error
): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  const formatted = formatEntry(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "debug":
      console.debug(formatted);
      break;
  }
}

export const logger = {
  error(message: string, context?: LogContext, error?: Error): void {
    log("error", message, context, error);
  },

  warn(message: string, context?: LogContext): void {
    log("warn", message, context);
  },

  info(message: string, context?: LogContext): void {
    log("info", message, context);
  },

  debug(message: string, context?: LogContext): void {
    log("debug", message, context);
  },
};
