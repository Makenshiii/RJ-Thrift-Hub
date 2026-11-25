import { createUserSupabase } from '../lib/requestSupabase.js';
import { AppError, success } from '../utils/errors.js';

function orderError(error) {
  const message = String(error?.message || '');
  if (message.includes('ORDER_NOT_FOUND')) return new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (message.includes('ORDER_NOT_CANCELLABLE')) return new AppError(409, 'ORDER_NOT_CANCELLABLE', 'This order can no longer be cancelled.');
  return error;
}

async function fetchOrder(req, id) {
  const { data, error } = await createUserSupabase(req.accessToken).from('orders')
    .select('*,items:order_items(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return data;
}

export async function listOrders(req, res) {
  const { page, limit } = req.query;
  const first = (page - 1) * limit;
  const { data, error, count } = await createUserSupabase(req.accessToken).from('orders')
    .select('*,items:order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(first, first + limit - 1);
  if (error) throw error;
  return success(res, data || [], 200, { page, limit, count: count || 0 });
}

export async function getOrder(req, res) {
  return success(res, await fetchOrder(req, req.params.id));
}

export async function cancelOrder(req, res) {
  const { error } = await createUserSupabase(req.accessToken).rpc('cancel_order', {
    p_order_id: req.params.id
  });
  if (error) throw orderError(error);
  return success(res, await fetchOrder(req, req.params.id));
}

export function mapOrderError(error) {
  return orderError(error);
}
