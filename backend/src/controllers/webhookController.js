import { supabase } from '../lib/supabase.js';
import { paymentProvider } from '../services/paymentProviderFactory.js';
import { releaseReservation } from '../services/checkoutService.js';
import { verifyOrderPayment } from '../services/paymentVerificationService.js';
import { AppError, success } from '../utils/errors.js';

export async function mayaWebhook(req, res) {
  if (!Buffer.isBuffer(req.body)) {
    throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook body must be raw JSON.');
  }
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook body must contain valid JSON.');
  }
  if (!paymentProvider.verifyWebhook(payload, req.get('x-maya-webhook-signature'), req.get('x-maya-webhook-timestamp'))) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature or timestamp is invalid.');
  }
  const type = payload?.paymentStatus ?? payload?.status;
  const paymentId = payload?.id;
  if (!paymentId || !type) throw new AppError(400, 'INVALID_WEBHOOK', 'Webhook event is malformed.');
  const eventId = `${paymentId}:${type}:${payload.updatedAt ?? payload.createdAt ?? 'v1'}`;
  const { data: insertedEvent, error: insertError } = await supabase.from('payment_events')
    .insert({ event_id: eventId, type, payload })
    .select('event_id,processed_at')
    .maybeSingle();
  let event = insertedEvent;
  if (insertError?.code === '23505') {
    const { data, error } = await supabase.from('payment_events')
      .select('event_id,processed_at')
      .eq('event_id', eventId)
      .single();
    if (error) throw error;
    event = data;
    if (event.processed_at) return success(res, { received: true, duplicate: true });
  } else if (insertError) {
    throw insertError;
  }

  const reference = payload.requestReferenceNumber;
  const { data: checkoutOrder, error: checkoutOrderError } = await supabase.from('orders')
    .select('*,items:order_items(*)')
    .eq('payment_checkout_id', paymentId)
    .maybeSingle();
  if (checkoutOrderError) throw checkoutOrderError;
  let order = checkoutOrder;
  if (!order && reference) {
    const { data, error } = await supabase.from('orders')
      .select('*,items:order_items(*)')
      .eq('id', reference)
      .maybeSingle();
    if (error && error.code !== '22P02') throw error;
    order = data;
  }

  if (order && type === 'PAYMENT_SUCCESS') {
    await verifyOrderPayment(order, paymentProvider.normalizePayment(payload));
  } else if (order && ['PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'PAYMENT_CANCELLED'].includes(type)) {
    await releaseReservation(order.id, type === 'PAYMENT_CANCELLED' ? 'cancelled' : 'expired');
  }
  const { error: updateError } = await supabase.from('payment_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('event_id', event.event_id);
  if (updateError) throw updateError;
  return success(res, { received: true });
}
