import { AppError } from '../utils/errors.js';

export function validate(schema, source = 'body', {
  status = 422,
  code = 'VALIDATION_ERROR',
  message = 'Please check the submitted information.'
} = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError(status, code, message, result.error.flatten()));
    }
    req[source] = result.data;
    return next();
  };
}
