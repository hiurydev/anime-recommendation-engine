import { env } from './env.js';

const LEVELS = ['debug', 'info', 'warn', 'error'];
const threshold = LEVELS.indexOf(env.LOG_LEVEL);

function log(level, ...args) {
  if (LEVELS.indexOf(level) >= threshold) {
    console[level === 'debug' ? 'log' : level](`[${level}]`, ...args);
  }
}

export const logger = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args)
};
