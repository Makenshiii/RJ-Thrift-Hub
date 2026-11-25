import { supabase } from '../lib/supabase.js';
import { resumeOrderPayment } from '../services/checkoutService.js';
import { verifyOrderPayment } from '../services/paymentVerificationService.js';
import { AppError, success } from '../utils/errors.js';

export async function resumePayment(req, res) {
  const order = await resumeOrderPayment(req.user.id, req.params.id);
  return success(res, {
    id: order.id,
    status: order.status,
    checkoutUrl: order.checkoutUrl,
    checkoutSessionId: order.paymentCheckoutId
  });
}

export async function reconcilePayment(req, res) {
  const { data: order, error } = await supabase.from('orders')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (!order.payment_checkout_id) {
    throw new AppError(409, 'PAYMENT_SESSION_MISSING', 'This order does not have a Maya session yet. Choose Continue to payment to start checkout.');
  }
  const result = await verifyOrderPayment(order);
  return success(res, { order: result.order, paid: result.paid, mismatch: result.mismatch });
}
