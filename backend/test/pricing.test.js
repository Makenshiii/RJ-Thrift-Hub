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

test('checkout accepts a four-character street address', () => {
  const result = checkoutSchema.safeParse({
    idempotencyKey: 'checkout-key-123',
    shippingAddress: {
      recipient: 'Alex Buyer',
      phone: '09170000000',
      address: 'Blk1',
      city: 'fds',
      postalCode: '9200'
    }
  });
  assert.equal(result.success, true);
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

test('numeric product stock accepts quantities and rejects values above 9999', () => {
  const result = productSchema.safeParse({
    name: 'Vintage jacket',
    description: 'One unique vintage jacket',
    category: 'Outerwear',
    price: 250,
    image: 'https://example.test/jacket.jpg',
    size: 'M',
    sizes: ['S', 'M', 'L'],
    size_stock: { S: 3, M: 6, L: 3 },
    condition: 'Good',
    stock: 12
  });
  assert.equal(result.success, true);

  const mismatchedInventory = productSchema.safeParse({
    name: 'Vintage jacket',
    description: 'One unique vintage jacket',
    category: 'Outerwear',
    price: 250,
    image: 'https://example.test/jacket.jpg',
    size: 'M',
    sizes: ['S', 'M'],
    size_stock: { S: 3, M: 6 },
    condition: 'Good',
    stock: 12
  });
  assert.equal(mismatchedInventory.success, false);

  const tooHigh = productSchema.safeParse({
    name: 'Vintage jacket',
    description: 'One unique vintage jacket',
    category: 'Outerwear',
    price: 250,
    image: 'https://example.test/jacket.jpg',
    size: 'M',
    condition: 'Good',
    stock: 10000
  });
  assert.equal(tooHigh.success, false);
});
