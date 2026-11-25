import { createUserSupabase } from '../lib/requestSupabase.js';
import { AppError, success } from '../utils/errors.js';

function cartError(error) {
  const message = String(error?.message || '');
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return new AppError(503, 'CART_DATABASE_NOT_READY', 'Cart database setup is incomplete. Apply the required cart and inventory migrations.');
  }
  if (message.includes('OUT_OF_STOCK')) return new AppError(409, 'OUT_OF_STOCK', 'That size or quantity is no longer available.');
  if (message.includes('CART_EMPTY')) return new AppError(422, 'CART_EMPTY', 'Add an available piece to your bag first.');
  if (message.includes('COUPON_')) return new AppError(422, message.split(':')[0], 'The coupon is not valid for this order.');
  return error;
}

async function runCartRpc(req, name, args) {
  const { data, error } = await createUserSupabase(req.accessToken).rpc(name, args);
  if (error) throw cartError(error);
  return data;
}

export async function getCart(req, res) {
  return success(res, await runCartRpc(req, 'get_cart'));
}

export async function addCartItem(req, res) {
  const data = await runCartRpc(req, 'add_cart_item', {
    p_product_id: req.body.productId,
    p_size: req.body.size || null,
    p_quantity: req.body.quantity || 1
  });
  return success(res, data, 201);
}

export async function updateCartItem(req, res) {
  const data = await runCartRpc(req, 'set_cart_item_quantity', {
    p_product_id: req.params.id,
    p_quantity: req.body.quantity,
    p_size: req.body.size
  });
  return success(res, data);
}

export async function removeCartItem(req, res) {
  const data = await runCartRpc(req, 'remove_cart_item', {
    p_product_id: req.params.id,
    p_size: req.query.size || null
  });
  return success(res, data);
}

export async function quoteCart(req, res) {
  const data = await runCartRpc(req, 'quote_cart', {
    p_coupon_code: req.body.couponCode || null
  });
  return success(res, data);
}

export function validateCartError(error) {
  return cartError(error);
}
