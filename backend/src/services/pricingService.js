export function calculateDiscount(subtotal, coupon) {
  if (!coupon) return 0;
  return coupon.type === 'percentage'
    ? Math.round((subtotal * coupon.value) / 100)
    : Math.min(subtotal, coupon.value);
}
