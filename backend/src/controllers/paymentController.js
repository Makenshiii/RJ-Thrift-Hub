import { supabase } from '../lib/supabase.js';
import { verifyOrderPayment } from '../services/paymentVerificationService.js';
import { AppError, success } from '../utils/errors.js';

export async function reconcilePayment(req, res) {
  const { data: order, error } = await supabase.from('orders')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (!order.payment_checkout_id) {
    throw new AppError(409, 'PAYMENT_SESSION_MISSING', 'This order does not have a payment session to verify.');
  }
  const result = await verifyOrderPayment(order);
  return success(res, { order: result.order, paid: result.paid, mismatch: result.mismatch });
}
