import { Logger as TSLogger } from "tslog";

export const LOG_LEVEL_INFO = "INFO";
export const LOG_LEVEL_DEBUG = "DEBUG";
export const LOG_LEVEL_WARN = "WARN";
export const LOG_LEVEL_ERROR = "ERROR";
export const LOG_LEVEL_DEFAULT = LOG_LEVEL_INFO;

export type LogLevel =
  | typeof LOG_LEVEL_INFO
  | typeof LOG_LEVEL_DEBUG
  | typeof LOG_LEVEL_WARN
  | typeof LOG_LEVEL_ERROR;

interface Loggable {
  info(message: string, data?: object): void;
  debug(message: string, data?: object): void;
  warn(message: string, data?: object): void;
  error(message: string, data?: object): void;
  setLogLevel(level: LogLevel): void;
}

class Logger implements Loggable {
  private readonly logger = new TSLogger({
    name: "my-app",
    minLevel: LOG_LEVEL_DEFAULT,
  });

  info(message: string, data?: object): void {
    if (data) {
      this.logger.info(message, data);
    } else {
      this.logger.info(message);
    }
  }

  debug(message: string, data?: object): void {
    if (data) {
      this.logger.debug(message, data);
    } else {
      this.logger.debug(message);
    }
  }

  warn(message: string, data?: object): void {
    if (data) {
      this.logger.warn(message, data);
    } else {
      this.logger.warn(message);
    }
  }

  error(message: string, data?: object): void {
    if (data) {
      this.logger.error(message, data);
    } else {
      this.logger.error(message);
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logger.setMinLevel(level);
  }
}

export const logger = new Logger();
