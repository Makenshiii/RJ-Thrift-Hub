import { AppError } from '../utils/errors.js';

export function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found.'));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const requestId = req.id ?? 'unknown';
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'MALFORMED_JSON', message: 'Request body must contain valid JSON.' },
      requestId
    });
  }
  if (error.name === 'ValidationError') {
    return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted information.' }, requestId });
  }
  if (error.code === 11000) {
    return res.status(409).json({ success: false, error: { code: 'DUPLICATE_RESOURCE', message: 'This record already exists.' }, requestId });
  }
  const status = error instanceof AppError ? error.status : 500;
  const body = {
    success: false,
    error: {
      code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof AppError ? error.message : 'Something went wrong. Please try again.'
    },
    requestId
  };
  if (error instanceof AppError && error.details) body.error.details = error.details;
  if (status >= 500) console.error({ requestId, error });
  return res.status(status).json(body);
}
