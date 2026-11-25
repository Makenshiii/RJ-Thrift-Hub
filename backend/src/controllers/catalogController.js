import { createPublicSupabase } from '../lib/requestSupabase.js';
import { AppError, success } from '../utils/errors.js';

export async function listProducts(req, res) {
  const { data, error } = await createPublicSupabase().rpc('search_products', {
    p_search: req.query.search || null,
    p_category: req.query.category && req.query.category !== 'All' ? req.query.category : null,
    p_min_price: req.query.minPrice ?? null,
    p_max_price: req.query.maxPrice ?? null,
    p_sort: req.query.sort || 'newest',
    p_page: req.query.page || 1,
    p_limit: req.query.limit || 50
  });
  if (error) throw error;
  return success(res, data || [], 200, { page: req.query.page || 1, limit: req.query.limit || 50 });
}

export async function getProduct(req, res) {
  const { data, error } = await createPublicSupabase().from('products')
    .select('*')
    .eq('id', req.params.id)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'This product is no longer available.');
  return success(res, data);
}
