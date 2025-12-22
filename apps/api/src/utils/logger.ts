// apps/api/src/utils/logger.ts
import pino from 'pino';

// Define custom levels
const customLevels = {
  http: 25,
};

const isDev = process.env.NODE_ENV === 'development';

const transport = isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

const logger = pino({
  level: isDev ? 'debug' : 'info',
  customLevels,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}, transport as any);

export default logger;
