import { z } from 'zod';
import { AI_QUERY_MAX_LENGTH, AI_QUERY_MIN_LENGTH, sanitizeAiQuery } from '../../../shared/aiDiscovery.mjs';

const id = z.string().uuid('A valid product ID is required.');

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72)
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72)
}).strict();

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1).max(4096)
}).strict();

export const cartQuantitySchema = z.object({
  size: z.string().trim().min(1).max(30),
  quantity: z.number().int().min(1).max(9999)
}).strict();

export const cartRemoveQuerySchema = z.object({
  size: z.string().trim().max(30).optional()
}).strict();

export const productSearchQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['newest', 'price', '-price']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(50)
}).strict().refine((query) =>
  query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
  message: 'Minimum price cannot exceed maximum price.',
  path: ['minPrice']
});

export const ordersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict();

export const cartItemSchema = z.object({
  productId: id,
  size: z.string().trim().min(1).max(30).optional(),
  quantity: z.number().int().min(1).max(9999).optional()
}).strict();

export const checkoutSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  couponCode: z.string().trim().max(40).optional(),
  shippingAddress: z.object({
    recipient: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    address: z.string().trim().min(3).max(300),
    city: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(3).max(16)
  }).strict()
}).strict();

export const quoteSchema = z.object({
  couponCode: z.string().trim().max(40).optional()
}).strict();

export const aiSchema = z.object({
  query: z.preprocess(
    (value) => typeof value === 'string' ? sanitizeAiQuery(value) : value,
    z.string().min(AI_QUERY_MIN_LENGTH).max(AI_QUERY_MAX_LENGTH)
  )
}).strict();

const productFieldsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(2000),
  category: z.string().trim().min(2).max(60),
  price: z.number().finite().int().min(0),
  image: z.string().url(),
  size: z.string().trim().min(1).max(30),
  sizes: z.array(z.string().trim().min(1).max(30)).min(1).max(30).optional(),
  size_stock: z.record(z.string(), z.number().int().min(0).max(9999)).optional(),
  condition: z.enum(['Like new', 'Very good', 'Good', 'Fair']),
  tag: z.string().trim().max(40).optional(),
  stock: z.number().int().min(0).max(9999)
}).strict();

export const productSchema = productFieldsSchema.superRefine((product, context) => {
  if (!product.size_stock) return;
  const sizes = product.sizes || [product.size];
  if (sizes.some((size) => !Object.hasOwn(product.size_stock, size)) ||
      Object.keys(product.size_stock).some((size) => !sizes.includes(size))) {
    context.addIssue({ code: 'custom', message: 'Stock entries must match the available sizes.', path: ['size_stock'] });
  }
  if (Object.values(product.size_stock).reduce((total, quantity) => total + quantity, 0) !== product.stock) {
    context.addIssue({ code: 'custom', message: 'Total stock must equal the sum of stock per size.', path: ['stock'] });
  }
});
export const productUpdateSchema = productFieldsSchema.omit({ stock: true }).partial().extend({ active: z.boolean().optional() });

export const inventoryUpdateSchema = z.object({
  price: z.number().int().min(0),
  sizes: z.array(z.string().trim().min(1).max(30)).min(1).max(30),
  sizeStock: z.record(z.string(), z.number().int().min(0).max(9999))
}).strict().superRefine((inventory, context) => {
  if (new Set(inventory.sizes).size !== inventory.sizes.length ||
      inventory.sizes.some((size) => !Object.hasOwn(inventory.sizeStock, size)) ||
      Object.keys(inventory.sizeStock).some((size) => !inventory.sizes.includes(size)) ||
      Object.values(inventory.sizeStock).reduce((total, stock) => total + stock, 0) > 9999) {
    context.addIssue({ code: 'custom', message: 'Stock entries must match unique sizes and total no more than 9999.', path: ['sizeStock'] });
  }
});

const couponFields = z.object({
  code: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().finite().min(0),
  minimumSpend: z.number().finite().int().min(0),
  expiresAt: z.coerce.date().nullable(),
  usageLimit: z.number().int().min(1).nullable(),
  perCustomerLimit: z.number().int().min(1),
  active: z.boolean()
}).strict();

export const couponSchema = couponFields.refine((coupon) =>
  coupon.type !== 'percentage' || coupon.value <= 100, {
    message: 'Percentage coupons cannot exceed 100.',
    path: ['value']
  }).refine((coupon) => coupon.type === 'percentage' || Number.isInteger(coupon.value), {
    message: 'Fixed coupon values must be whole pesos.',
    path: ['value']
  });
export const couponUpdateSchema = couponFields.partial().refine((coupon) =>
  coupon.type !== 'percentage' || coupon.value === undefined || coupon.value <= 100, {
    message: 'Percentage coupons cannot exceed 100.',
    path: ['value']
  }).refine((coupon) => coupon.type !== 'fixed' || coupon.value === undefined || Number.isInteger(coupon.value), {
    message: 'Fixed coupon values must be whole pesos.',
    path: ['value']
  });
