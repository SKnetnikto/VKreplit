import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Логгер для приложения.
 *
 * Уровни логирования (от младшего к старшему):
 * - trace: полная трассировка (не используется)
 * - debug: детальная отладка (параметры запросов, SQL, детали VK API)
 * - info: обычные события (новые сообщения, команды, ошибки VK)
 * - warn: предупреждения (нет токена, битая сессия)
 * - error: ошибки (не удалось подключиться к БД, ошибка Puppeteer)
 * - fatal: фатальные ошибки (сервер не может запуститься)
 *
 * Для включения debug логов установите: LOG_LEVEL=debug
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
    ],
    // Redact but still log the presence of values
    censor: "**redacted**",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
  // Add timestamps in ISO format for easier parsing
  timestamp: pino.stdTimeFunctions.isoTime,
});
