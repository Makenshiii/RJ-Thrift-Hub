import { z } from 'zod';

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

export const cartItemSchema = z.object({ productId: id }).strict();

export const checkoutSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(100),
  couponCode: z.string().trim().max(40).optional(),
  shippingAddress: z.object({
    recipient: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(30),
    address: z.string().trim().min(5).max(300),
    city: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(3).max(16)
  }).strict()
}).strict();

export const quoteSchema = z.object({
  couponCode: z.string().trim().max(40).optional()
}).strict();

export const aiSchema = z.object({ prompt: z.string().trim().min(3).max(500) }).strict();

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(2000),
  category: z.string().trim().min(2).max(60),
  price: z.number().finite().int().min(0),
  image: z.string().url(),
  size: z.string().trim().min(1).max(30),
  condition: z.enum(['Like new', 'Very good', 'Good', 'Fair']),
  tag: z.string().trim().max(40).optional(),
  stock: z.number().int().min(0).max(1)
}).strict();
export const productUpdateSchema = productSchema.omit({ stock: true }).partial().extend({ active: z.boolean().optional() });

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
