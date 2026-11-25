export function normalizeProduct(product) {
  return product ? {
    ...product,
    _id: product.id ?? product._id,
    createdAt: product.created_at ?? product.createdAt
  } : product;
}

export function normalizeCart(cart) {
  return {
    ...cart,
    items: (cart?.items || []).map((item) => ({
      ...item,
      product: normalizeProduct(item.product)
    }))
  };
}

export function normalizeOrder(order) {
  if (!order) return order;
  return {
    ...order,
    _id: order.id ?? order._id,
    createdAt: order.created_at ?? order.createdAt,
    shippingFee: order.shipping_fee ?? order.shippingFee,
    couponCode: order.coupon_code ?? order.couponCode,
    shippingAddress: order.shipping_address ?? order.shippingAddress,
    paymentCheckoutId: order.payment_checkout_id ?? order.paymentCheckoutId,
    checkoutUrl: order.checkout_url ?? order.checkoutUrl,
    reservationExpiresAt: order.reservation_expires_at ?? order.reservationExpiresAt,
    paymentIssue: order.payment_issue ?? order.paymentIssue,
    items: (order.items || []).map((item) => ({
      ...item,
      _id: item.id ?? item._id,
      product: item.product_id ?? item.product,
      unitPrice: item.unit_price ?? item.unitPrice
    })),
    user: order.user ? { ...order.user, _id: order.user.id ?? order.user._id } : order.user
  };
}

export function normalizeCoupon(coupon) {
  return coupon ? {
    ...coupon,
    _id: coupon.id ?? coupon._id,
    minimumSpend: coupon.minimum_spend ?? coupon.minimumSpend,
    expiresAt: coupon.expires_at ?? coupon.expiresAt,
    usageLimit: coupon.usage_limit ?? coupon.usageLimit,
    perCustomerLimit: coupon.per_customer_limit ?? coupon.perCustomerLimit,
    usageCount: coupon.usage_count ?? coupon.usageCount
  } : coupon;
}
