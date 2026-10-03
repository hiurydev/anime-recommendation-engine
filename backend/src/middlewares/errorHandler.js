import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';

export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { message: err.message, code: err.code, details: err.details }
    });
  }

  logger.error(err);
  return res.status(500).json({
    error: { message: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' }
  });
}
