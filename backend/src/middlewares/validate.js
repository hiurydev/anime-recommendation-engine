import { AppError } from '../utils/AppError.js';

// Valida params/query/body de uma rota contra schemas zod. Em caso de falha, delega ao
// errorHandler com o formato de erro padrão (§13.0) e código VALIDATION_ERROR (400).
export function validate(schemas) {
  return (req, res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      const details = err.issues?.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message
      }));
      next(new AppError(400, 'Dados de entrada inválidos.', 'VALIDATION_ERROR', details));
    }
  };
}
