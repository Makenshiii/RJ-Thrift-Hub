import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { checkout } from '../controllers/checkoutController.js';
import { reconcilePayment } from '../controllers/paymentController.js';
import * as ai from '../controllers/aiController.js';
import { checkoutSchema, aiSchema } from '../utils/schemas.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/errors.js';

const router = Router();
const aiLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const orderIdParams = z.object({ id: z.string().uuid() });

router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));
router.post('/checkout', requireAuth, validate(checkoutSchema), asyncHandler(checkout));
router.post('/orders/:id/verify-payment', requireAuth, validate(orderIdParams, 'params'), asyncHandler(reconcilePayment));
router.post('/ai/discover', aiLimit, validate(aiSchema), asyncHandler(ai.discover));

export default router;
