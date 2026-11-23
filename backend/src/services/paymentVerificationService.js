import { supabase } from '../lib/supabase.js';
import { paymentProvider } from './paymentProviderFactory.js';
import { findOrder } from './checkoutService.js';

export async function verifyOrderPayment(order, verifiedPayment = null) {
  const payment = verifiedPayment ?? await paymentProvider.verifyCheckout(
    order.payment_checkout_id ?? order.paymentCheckoutId
  );
  const paymentAmount = Number(payment?.amount);
  const { data: result, error } = await supabase.rpc('finalize_order_payment', {
    p_order_id: order.id,
    p_payment_id: payment?.id ?? null,
    p_amount_cents: Number.isFinite(paymentAmount) ? paymentAmount : -1,
    p_currency: payment?.currency?.toUpperCase() ?? 'UNKNOWN',
    p_paid: payment?.paid === true
  });
  if (error) throw error;
  const updatedOrder = await findOrder(order.id);
  if (result?.mismatch) {
    console.error({
      orderId: order.id,
      expectedAmount: order.total * 100,
      actualAmount: Number.isFinite(paymentAmount) ? paymentAmount : null,
      expectedCurrency: order.currency,
      actualCurrency: payment?.currency ?? 'unknown'
    });
  }
  return {
    order: updatedOrder,
    paid: result?.paid === true,
    mismatch: result?.mismatch === true
  };
}
