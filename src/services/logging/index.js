import { v4 as uuidv4 } from 'uuid';

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  constructor(level = LogLevel.INFO) {
    this.level = level;
    if (typeof localStorage !== 'undefined') {
      this.correlationId = localStorage.getItem('x-axim-correlation-id') || uuidv4();
      localStorage.setItem('x-axim-correlation-id', this.correlationId);
    } else {
      this.correlationId = uuidv4();
    }
  }

  getCorrelationId() {
    return this.correlationId;
  }

  refreshCorrelationId() {
    this.correlationId = uuidv4();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('x-axim-correlation-id', this.correlationId);
    }
    return this.correlationId;
  }

  log(level, message, ...args) {
    if (level >= this.level) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [CID: ${this.correlationId}]`;
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(`${prefix} DEBUG:`, message, ...args);
          break;
        case LogLevel.INFO:
          console.info(`${prefix} INFO:`, message, ...args);
          break;
        case LogLevel.WARN:
          console.warn(`${prefix} WARN:`, message, ...args);
          break;
        case LogLevel.ERROR:
          console.error(`${prefix} ERROR:`, message, ...args);
          break;
        default:
          console.log(`${prefix}`, message, ...args);
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
