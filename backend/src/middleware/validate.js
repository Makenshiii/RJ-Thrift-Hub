import { AppError } from '../utils/errors.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError(422, 'VALIDATION_ERROR', 'Please check the submitted information.', result.error.flatten()));
    }
    req[source] = result.data;
    return next();
  };
}
