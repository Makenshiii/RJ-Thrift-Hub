import { createUserSupabase } from '../lib/requestSupabase.js';
import { AppError, success } from '../utils/errors.js';

function adminError(error) {
  const message = String(error?.message || '');
  if (message.includes('ITEM_RESERVED')) return new AppError(409, 'ITEM_RESERVED', 'Inventory cannot be changed while an item is reserved for checkout.');
  if (message.includes('INVALID_PRODUCT_INVENTORY')) return new AppError(422, 'INVALID_PRODUCT_INVENTORY', 'Check the price, size list, and stock values.');
  if (message.includes('PRODUCT_NOT_FOUND')) return new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  if (message.includes('ORDER_NOT_FOUND')) return new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (message.includes('ILLEGAL_ORDER_TRANSITION')) return new AppError(409, 'ILLEGAL_ORDER_TRANSITION', 'That order status transition is not allowed.');
  if (message.includes('FORBIDDEN')) return new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
  return error;
}

function adminDb(req) {
  return createUserSupabase(req.accessToken);
}

export async function dashboard(req, res) {
  const { data, error } = await adminDb(req).rpc('admin_dashboard_stats');
  if (error) throw adminError(error);
  return success(res, data);
}

export async function listProducts(req, res) {
  const { data, error } = await adminDb(req).from('products')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return success(res, data || []);
}

export async function createProduct(req, res) {
  const { data, error } = await adminDb(req).from('products')
    .insert(req.body)
    .select()
    .single();
  if (error) throw adminError(error);
  return success(res, data, 201);
}

export async function updateProduct(req, res) {
  const { data, error } = await adminDb(req).from('products')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) throw adminError(error);
  return success(res, data);
}

export async function updateInventory(req, res) {
  const { data, error } = await adminDb(req).rpc('admin_update_product_inventory', {
    p_product_id: req.params.id,
    p_price: req.body.price,
    p_sizes: req.body.sizes,
    p_size_stock: req.body.sizeStock
  });
  if (error) throw adminError(error);
  return success(res, data);
}

export async function listOrders(req, res) {
  const { data, error } = await adminDb(req).from('orders')
    .select('*,items:order_items(*),user:profiles(id,name,email)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return success(res, data || []);
}

export async function updateOrderStatus(req, res) {
  const { error } = await adminDb(req).rpc('admin_update_order_status', {
    p_order_id: req.params.id,
    p_status: req.body.status
  });
  if (error) throw adminError(error);
  const { data, error: fetchError } = await adminDb(req).from('orders')
    .select('*,items:order_items(*),user:profiles(id,name,email)')
    .eq('id', req.params.id)
    .single();
  if (fetchError) throw fetchError;
  return success(res, data);
}

export async function listCoupons(req, res) {
  const { data, error } = await adminDb(req).rpc('admin_list_coupons');
  if (error) throw adminError(error);
  return success(res, data || []);
}

export async function createCoupon(req, res) {
  const { minimumSpend, usageLimit, perCustomerLimit, expiresAt, ...fields } = req.body;
  const { data, error } = await adminDb(req).from('coupons').insert({
    ...fields,
    code: fields.code.toUpperCase(),
    minimum_spend: minimumSpend,
    expires_at: expiresAt,
    usage_limit: usageLimit,
    per_customer_limit: perCustomerLimit
  }).select().single();
  if (error) throw adminError(error);
  const { data: coupons, error: listError } = await adminDb(req).rpc('admin_list_coupons');
  if (listError) throw listError;
  return success(res, coupons.find((coupon) => coupon.id === data.id) || data, 201);
}

export async function updateCoupon(req, res) {
  const patch = {};
  if (req.body.active !== undefined) patch.active = req.body.active;
  if (req.body.expiresAt !== undefined) patch.expires_at = req.body.expiresAt;
  const { error } = await adminDb(req).from('coupons')
    .update(patch)
    .eq('id', req.params.id)
    .select('id')
    .single();
  if (error) {
    if (error.code === 'PGRST116') throw new AppError(404, 'COUPON_NOT_FOUND', 'Coupon not found.');
    throw adminError(error);
  }
  const { data, error: listError } = await adminDb(req).rpc('admin_list_coupons');
  if (listError) throw listError;
  const coupon = data.find((item) => item.id === req.params.id);
  if (!coupon) throw new AppError(404, 'COUPON_NOT_FOUND', 'Coupon not found.');
  return success(res, coupon);
}
