const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor(level = LogLevel.INFO) {
    this.level = level;
  }

  log(level, message, ...args) {
    if (level >= this.level) {
      const timestamp = new Date().toISOString();
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(`[${timestamp}] DEBUG:`, message, ...args);
          break;
        case LogLevel.INFO:
          console.info(`[${timestamp}] INFO:`, message, ...args);
          break;
        case LogLevel.WARN:
          console.warn(`[${timestamp}] WARN:`, message, ...args);
          break;
        case LogLevel.ERROR:
          console.error(`[${timestamp}] ERROR:`, message, ...args);
          break;
        default:
          console.log(`[${timestamp}]`, message, ...args);
      }
    }
  }

  debug(message, ...args) {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message, ...args) {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message, ...args) {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message, ...args) {
    this.log(LogLevel.ERROR, message, ...args);
  }
}

export default new Logger();
