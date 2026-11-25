import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { checkout } from '../controllers/checkoutController.js';
import { reconcilePayment, resumePayment } from '../controllers/paymentController.js';
import * as auth from '../controllers/authController.js';
import * as catalog from '../controllers/catalogController.js';
import * as cart from '../controllers/cartController.js';
import * as orders from '../controllers/ordersController.js';
import * as admin from '../controllers/adminController.js';
import * as ai from '../controllers/aiController.js';
import {
  aiSchema, cartItemSchema, cartQuantitySchema, cartRemoveQuerySchema,
  checkoutSchema, couponSchema, couponUpdateSchema, inventoryUpdateSchema,
  loginSchema, ordersQuerySchema, productSchema, productSearchQuerySchema,
  productUpdateSchema, quoteSchema, refreshSessionSchema, registerSchema
} from '../utils/schemas.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { AI_QUERY_MAX_LENGTH, AI_QUERY_MIN_LENGTH } from '../../../shared/aiDiscovery.mjs';

const router = Router();
const aiLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    success: false,
    error: { code: 'AI_RATE_LIMITED', message: 'Too many AI searches. Please try again later.' },
    requestId: req.id
  })
});
const idParams = z.object({ id: z.string().uuid() });
function applyIdempotencyHeader(req, res, next) {
  const headerKey = req.get('idempotency-key')?.trim();
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const bodyKey = body.idempotencyKey;
  if (headerKey && bodyKey && headerKey !== bodyKey) {
    return next(new AppError(422, 'IDEMPOTENCY_KEY_MISMATCH', 'The Idempotency-Key header must match the request body.'));
  }
  req.body = headerKey ? { ...body, idempotencyKey: headerKey } : body;
  return next();
}

router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));
router.post('/auth/register', validate(registerSchema), asyncHandler(auth.register));
router.post('/auth/login', validate(loginSchema), asyncHandler(auth.login));
router.post('/auth/refresh', validate(refreshSessionSchema), asyncHandler(auth.refresh));
router.post('/auth/logout', requireAuth, validate(refreshSessionSchema), asyncHandler(auth.logout));
router.get('/auth/me', requireAuth, asyncHandler(auth.currentUser));
router.get('/products', validate(productSearchQuerySchema, 'query'), asyncHandler(catalog.listProducts));
router.get('/products/:id', validate(idParams, 'params'), asyncHandler(catalog.getProduct));
router.get('/cart', requireAuth, asyncHandler(cart.getCart));
router.post('/cart/items', requireAuth, validate(cartItemSchema), asyncHandler(cart.addCartItem));
router.patch('/cart/items/:id', requireAuth, validate(idParams, 'params'), validate(cartQuantitySchema), asyncHandler(cart.updateCartItem));
router.delete('/cart/items/:id', requireAuth, validate(idParams, 'params'), validate(cartRemoveQuerySchema, 'query'), asyncHandler(cart.removeCartItem));
router.post('/checkout/quote', requireAuth, validate(quoteSchema), asyncHandler(cart.quoteCart));
router.post('/checkout', requireAuth, applyIdempotencyHeader, validate(checkoutSchema), asyncHandler(checkout));
router.get('/orders', requireAuth, validate(ordersQuerySchema, 'query'), asyncHandler(orders.listOrders));
router.post('/orders/:id/cancel', requireAuth, validate(idParams, 'params'), asyncHandler(orders.cancelOrder));
router.post('/orders/:id/retry-payment', requireAuth, validate(idParams, 'params'), asyncHandler(resumePayment));
router.post('/orders/:id/verify-payment', requireAuth, validate(idParams, 'params'), asyncHandler(reconcilePayment));
router.get('/orders/:id', requireAuth, validate(idParams, 'params'), asyncHandler(orders.getOrder));
router.get('/admin/dashboard', requireAuth, requireAdmin, asyncHandler(admin.dashboard));
router.get('/admin/products', requireAuth, requireAdmin, asyncHandler(admin.listProducts));
router.post('/admin/products', requireAuth, requireAdmin, validate(productSchema), asyncHandler(admin.createProduct));
router.patch('/admin/products/:id', requireAuth, requireAdmin, validate(idParams, 'params'), validate(productUpdateSchema), asyncHandler(admin.updateProduct));
router.patch('/admin/products/:id/inventory', requireAuth, requireAdmin, validate(idParams, 'params'), validate(inventoryUpdateSchema), asyncHandler(admin.updateInventory));
router.get('/admin/orders', requireAuth, requireAdmin, asyncHandler(admin.listOrders));
router.patch('/admin/orders/:id/status', requireAuth, requireAdmin, validate(idParams, 'params'), validate(z.object({ status: z.enum(['processing', 'shipped', 'delivered']) }).strict()), asyncHandler(admin.updateOrderStatus));
router.get('/admin/coupons', requireAuth, requireAdmin, asyncHandler(admin.listCoupons));
router.post('/admin/coupons', requireAuth, requireAdmin, validate(couponSchema), asyncHandler(admin.createCoupon));
router.patch('/admin/coupons/:id', requireAuth, requireAdmin, validate(idParams, 'params'), validate(couponUpdateSchema), asyncHandler(admin.updateCoupon));
router.post('/ai/discover', aiLimit, validate(aiSchema, 'body', {
  status: 400,
  code: 'AI_QUERY_INVALID',
  message: `Enter a search request between ${AI_QUERY_MIN_LENGTH} and ${AI_QUERY_MAX_LENGTH} characters.`
}), asyncHandler(ai.discover));

export default router;
