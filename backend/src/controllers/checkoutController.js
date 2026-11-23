import { createCheckout } from '../services/checkoutService.js';
import { success } from '../utils/errors.js';

export async function checkout(req, res) {
  const order = await createCheckout(req.user.id, req.body);
  return success(res, {
    id: order.id,
    status: order.status,
    subtotal: order.subtotal,
    discount: order.discount,
    shippingFee: order.shippingFee,
    total: order.total,
    currency: order.currency,
    checkoutUrl: order.checkoutUrl,
    checkoutSessionId: order.paymentCheckoutId
  }, 201);
}
