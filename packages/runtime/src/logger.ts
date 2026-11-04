import { type LoggerOptions, pino } from "pino";
import pretty from "pino-pretty";

const isDev = process.env.NODE_ENV !== "production";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const loggerOptions: LoggerOptions = {
  level: LOG_LEVEL,
};

const logger = isDev
  ? pino(
      loggerOptions,
      pretty({
        colorize: true,
        singleLine: true,
        sync: true,
      })
    )
  : pino(loggerOptions);

export default logger;
