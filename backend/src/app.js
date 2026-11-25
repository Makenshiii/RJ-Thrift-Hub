import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { env } from './config/env.js';
import api from './routes/api.js';
import { mayaWebhook } from './controllers/webhookController.js';
import { asyncHandler } from './utils/errors.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const openApi = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(helmet());
app.use(cors({
  origin: [env.CLIENT_ORIGIN, 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use('/api/v1/webhooks/maya', express.raw({ type: 'application/json', limit: '1mb' }), asyncHandler(mayaWebhook));
app.use(express.json({ limit: '100kb' }));
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/v1', api);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApi));
app.use(notFound);
app.use(errorHandler);
