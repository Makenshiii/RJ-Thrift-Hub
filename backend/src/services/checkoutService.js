import { supabase } from '../lib/supabase.js';
import { paymentProvider } from './paymentProviderFactory.js';
import { AppError } from '../utils/errors.js';

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

function existingCheckout(order) {
  if (order?.status === 'pending_payment' && !order.checkoutUrl) {
    throw new AppError(409, 'CHECKOUT_IN_PROGRESS', 'A checkout with this key is already being prepared. Retry shortly.');
  }
  return order;
}

export async function createCheckout(userId, { idempotencyKey, couponCode, shippingAddress }) {
  const existing = await findIdempotentOrder(userId, idempotencyKey);
  if (existing) return existingCheckout(existing);

  const { data: reservation, error: reserveError } = await supabase.rpc('create_order_and_reserve', {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_coupon_code: couponCode || null,
    p_shipping_address: shippingAddress
  });
  if (reserveError) {
    if (reserveError.code === '23505') {
      const duplicate = await findIdempotentOrder(userId, idempotencyKey);
      if (duplicate) return existingCheckout(duplicate);
    }
    throw checkoutError(reserveError);
  }

  if (!reservation.created) return existingCheckout(await findOrder(reservation.id));
  const order = await findOrder(reservation.id);
  const items = order.items.map((item) => ({
    product: item.product,
    name: item.name,
    image: item.image,
    size: item.size,
    quantity: item.quantity,
    unitPrice: item.unitPrice
  }));
  let checkout;
  try {
    checkout = await paymentProvider.createCheckout({
      id: order.id,
      items,
      subtotal: order.subtotal,
      discount: order.discount,
      shippingFee: order.shippingFee,
      total: order.total,
      currency: order.currency,
      shippingAddress: order.shippingAddress
    });
  } catch (error) {
    await releaseReservation(order.id, 'cancelled');
    throw error;
  }

  const { data: updated, error: updateError } = await supabase.from('orders')
    .update({
      payment_checkout_id: checkout.checkoutId,
      checkout_url: checkout.checkoutUrl
    })
    .eq('id', order.id)
    .select('*,items:order_items(*)')
    .single();
  if (updateError) {
    await releaseReservation(order.id, 'cancelled');
    throw updateError;
  }
  return presentOrder(updated);
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
