import { randomUUID } from 'node:crypto';
import { supabase } from '../lib/supabase.js';
import { paymentProvider } from './paymentProviderFactory.js';
import { assertMayaCheckoutConfigured } from './MayaCheckoutProvider.js';
import { AppError } from '../utils/errors.js';

const checkoutAttemptLeaseMs = 30_000;

function presentOrder(order) {
  if (!order) return order;
  return {
    ...order,
    id: order.id,
    shippingFee: order.shipping_fee,
    couponCode: order.coupon_code,
    shippingAddress: order.shipping_address,
    paymentCheckoutId: order.payment_checkout_id,
    checkoutUrl: order.checkout_url,
    reservationExpiresAt: order.reservation_expires_at,
    items: (order.items || []).map((item) => ({
      ...item,
      product: item.product_id,
      unitPrice: item.unit_price
    }))
  };
}

export async function findOrder(orderId) {
  const { data, error } = await supabase.from('orders')
    .select('*,items:order_items(*)')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  return presentOrder(data);
}

async function findIdempotentOrder(userId, idempotencyKey) {
  const { data, error } = await supabase.from('orders')
    .select('*,items:order_items(*)')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return presentOrder(data);
}

function checkoutError(error) {
  const message = error?.message || '';
  if (error?.code === '23514' && /(?:order_items|reservations)_quantity_check/.test(message)) {
    return new AppError(
      503,
      'CHECKOUT_DATABASE_NOT_READY',
      'Checkout database is missing the quantity migration. Apply Supabase migration 202611260009_repair_checkout_inventory.sql.'
    );
  }
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new AppError(
      503,
      'CHECKOUT_DATABASE_NOT_READY',
      'Checkout database setup is incomplete. Apply the Supabase initial schema and size-level inventory migrations.'
    );
  }
  if (
    (error?.code === '42703' || error?.code === 'PGRST204') &&
    /checkout_session_attempt_(?:id|at)/.test(message)
  ) {
    return new AppError(
      503,
      'PAYMENT_RECOVERY_NOT_CONFIGURED',
      'Pending payment recovery is not configured. Apply Supabase migration 202611260010_payment_session_recovery.sql.'
    );
  }
  if (error?.code === '42703' || error?.code === '42P01') {
    return new AppError(
      503,
      'CHECKOUT_DATABASE_NOT_READY',
      'Checkout database setup is incomplete. Apply all required Supabase migrations in order.'
    );
  }
  if (message.includes('CART_EMPTY')) {
    return new AppError(422, 'CART_EMPTY', 'Add an available piece to your bag before checking out.');
  }
  if (message.includes('OUT_OF_STOCK')) {
    return new AppError(409, 'OUT_OF_STOCK', 'A piece in your bag is no longer available.');
  }
  if (message.includes('COUPON_')) {
    return new AppError(422, message.split(':')[0], 'The coupon is no longer valid for this order.');
  }
  return error;
}

function paymentItems(order) {
  return (order.items || []).map((item) => ({
    product: item.product,
    name: item.name,
    image: item.image,
    size: item.size,
    quantity: item.quantity,
    unitPrice: item.unitPrice
  }));
}

async function findOwnedOrder(userId, orderId) {
  const { data, error } = await supabase.from('orders')
    .select('*,items:order_items(*)')
    .eq('id', orderId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return presentOrder(data);
}

async function assertPaymentRecoverySchema() {
  const { error } = await supabase.from('orders')
    .select('checkout_session_attempt_id,checkout_session_attempted_at')
    .limit(1);
  if (error) throw checkoutError(error);
}

async function clearCheckoutAttempt(orderId, attemptId) {
  const { error } = await supabase.from('orders')
    .update({
      checkout_session_attempt_id: null,
      checkout_session_attempted_at: null
    })
    .eq('id', orderId)
    .eq('checkout_session_attempt_id', attemptId);
  if (error) throw error;
}

async function assertPendingPaymentWindow(order) {
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (order.status !== 'pending_payment') {
    throw new AppError(409, 'ORDER_NOT_PAYABLE', 'Only an unpaid order can start a payment session.');
  }

  const expiry = Date.parse(order.reservationExpiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    await releaseReservation(order.id, 'expired');
    throw new AppError(409, 'PAYMENT_RESERVATION_EXPIRED', 'This payment window expired. Return to your bag to place a new order.');
  }
}

async function ensureCheckoutSession(order) {
  await assertPendingPaymentWindow(order);

  if (order.paymentCheckoutId && order.checkoutUrl) return order;
  if (order.paymentCheckoutId || order.checkoutUrl) {
    throw new AppError(409, 'PAYMENT_SESSION_INCOMPLETE', 'This order has an incomplete Maya session. Contact the store administrator before retrying payment.');
  }

  assertMayaCheckoutConfigured();
  const attemptId = randomUUID();
  const attemptStartedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - checkoutAttemptLeaseMs).toISOString();
  const { data: claimed, error: claimError } = await supabase.from('orders')
    .update({
      checkout_session_attempt_id: attemptId,
      checkout_session_attempted_at: attemptStartedAt
    })
    .eq('id', order.id)
    .eq('status', 'pending_payment')
    .is('payment_checkout_id', null)
    .is('checkout_url', null)
    .gt('reservation_expires_at', attemptStartedAt)
    .or(`checkout_session_attempted_at.is.null,checkout_session_attempted_at.lt.${staleBefore}`)
    .select('*,items:order_items(*)')
    .maybeSingle();
  if (claimError) throw checkoutError(claimError);
  if (!claimed) {
    const latest = await findOrder(order.id);
    if (latest?.paymentCheckoutId && latest.checkoutUrl) return latest;
    await assertPendingPaymentWindow(latest);
    throw new AppError(409, 'CHECKOUT_IN_PROGRESS', 'A payment session is already being prepared. Wait a few seconds and retry.');
  }

  const claimedOrder = presentOrder(claimed);
  let checkout;
  try {
    checkout = await paymentProvider.createCheckout({
      id: claimedOrder.id,
      items: paymentItems(claimedOrder),
      subtotal: claimedOrder.subtotal,
      discount: claimedOrder.discount,
      shippingFee: claimedOrder.shippingFee,
      total: claimedOrder.total,
      currency: claimedOrder.currency,
      shippingAddress: claimedOrder.shippingAddress
    });
  } catch (error) {
    await clearCheckoutAttempt(claimedOrder.id, attemptId);
    throw error;
  }

  const { data: updated, error: updateError } = await supabase.from('orders')
    .update({
      payment_checkout_id: checkout.checkoutId,
      checkout_url: checkout.checkoutUrl,
      checkout_session_attempt_id: null,
      checkout_session_attempted_at: null
    })
    .eq('id', claimedOrder.id)
    .eq('status', 'pending_payment')
    .eq('checkout_session_attempt_id', attemptId)
    .is('payment_checkout_id', null)
    .gt('reservation_expires_at', new Date().toISOString())
    .select('*,items:order_items(*)')
    .maybeSingle();
  if (updateError) throw updateError;
  if (updated) return presentOrder(updated);

  const latest = await findOrder(claimedOrder.id);
  if (latest?.paymentCheckoutId && latest.checkoutUrl) return latest;
  await assertPendingPaymentWindow(latest);
  throw new AppError(409, 'CHECKOUT_IN_PROGRESS', 'A payment session is already being prepared. Wait a few seconds and retry.');
}

export async function createCheckout(userId, { idempotencyKey, couponCode, shippingAddress }) {
  const existing = await findIdempotentOrder(userId, idempotencyKey);
  if (existing) return ensureCheckoutSession(existing);
  assertMayaCheckoutConfigured();
  await assertPaymentRecoverySchema();

  const { data: reservation, error: reserveError } = await supabase.rpc('create_order_and_reserve', {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_coupon_code: couponCode || null,
    p_shipping_address: shippingAddress
  });
  if (reserveError) {
    if (reserveError.code === '23505') {
      const duplicate = await findIdempotentOrder(userId, idempotencyKey);
      if (duplicate) return ensureCheckoutSession(duplicate);
    }
    throw checkoutError(reserveError);
  }

  return ensureCheckoutSession(await findOrder(reservation.id));
}

export async function resumeOrderPayment(userId, orderId) {
  const order = await findOwnedOrder(userId, orderId);
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return ensureCheckoutSession(order);
}

export async function releaseReservation(orderOrId, status = 'cancelled', actor = null) {
  const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId.id;
  const { error } = await supabase.rpc('release_order_reservation', {
    p_order_id: orderId,
    p_status: status,
    p_actor_id: actor
  });
  if (error) throw error;
  return findOrder(orderId);
}
