import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDiscount } from '../src/services/pricingService.js';
import { checkoutSchema, couponSchema, productSchema } from '../src/utils/schemas.js';

test('percentage coupons round to the nearest whole peso', () => {
  assert.equal(calculateDiscount(255, { type: 'percentage', value: 10 }), 26);
});

test('fixed coupons cannot discount more than the subtotal', () => {
  assert.equal(calculateDiscount(30, { type: 'fixed', value: 50 }), 30);
});

test('checkout rejects client-supplied prices and totals', () => {
  const result = checkoutSchema.safeParse({
    idempotencyKey: 'checkout-key-123',
    total: 1,
    shippingAddress: { recipient: 'Alex', phone: '09171234567', address: '12 Sample St', city: 'Manila', postalCode: '1000' }
  });
  assert.equal(result.success, false);
});

test('percentage coupon validation rejects values above 100', () => {
  const result = couponSchema.safeParse({
    code: 'TOOMUCH',
    type: 'percentage',
    value: 101,
    minimumSpend: 0,
    expiresAt: null,
    usageLimit: null,
    perCustomerLimit: 1,
    active: true
  });
  assert.equal(result.success, false);
});

test('unique product stock cannot exceed one', () => {
  const result = productSchema.safeParse({
    name: 'Vintage jacket',
    description: 'One unique vintage jacket',
    category: 'Outerwear',
    price: 250,
    image: 'https://example.test/jacket.jpg',
    size: 'M',
    condition: 'Good',
    stock: 2
  });
  assert.equal(result.success, false);
});
