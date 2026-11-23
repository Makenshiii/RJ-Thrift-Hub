import { createClient } from '@supabase/supabase-js';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
const CATALOG_CACHE_KEY = 'rj-public-catalog-v1';
let supabase;

function getSupabase() {
  if (!supabase) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in client/.env.');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

function apiError(error) {
  const result = new Error(error?.message || 'The request could not be completed.');
  result.code = error?.code;
  result.status = error?.status;
  return result;
}

async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw apiError(error);
  return data;
}

function normalizeProduct(product) {
  return product ? { ...product, _id: product.id, createdAt: product.created_at } : product;
}

function normalizeOrder(order) {
  if (!order) return order;
  return {
    ...order,
    _id: order.id,
    createdAt: order.created_at,
    shippingFee: order.shipping_fee,
    couponCode: order.coupon_code,
    shippingAddress: order.shipping_address,
    paymentCheckoutId: order.payment_checkout_id,
    checkoutUrl: order.checkout_url,
    reservationExpiresAt: order.reservation_expires_at,
    paymentIssue: order.payment_issue,
    items: (order.items || []).map((item) => ({
      ...item,
      _id: item.id,
      product: item.product_id,
      unitPrice: item.unit_price
    })),
    user: order.user ? { ...order.user, _id: order.user.id } : order.user
  };
}

function normalizeCoupon(coupon) {
  return coupon ? {
    ...coupon,
    _id: coupon.id,
    minimumSpend: coupon.minimum_spend,
    expiresAt: coupon.expires_at,
    usageLimit: coupon.usage_limit,
    perCustomerLimit: coupon.per_customer_limit,
    usageCount: coupon.usage_count
  } : coupon;
}

export function getCachedProducts() {
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
    if (!cached || Date.now() - cached.savedAt > 7 * 24 * 60 * 60 * 1000 || !Array.isArray(cached.products)) return [];
    return cached.products;
  } catch {
    return [];
  }
}

function cacheProducts(products) {
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      products: products.map(({ id, _id, name, description, category, price, image, size, condition, tag, stock, active }) => ({
        id: id ?? _id, name, description, category, price, image, size, condition, tag, stock, active
      }))
    }));
  } catch (error) {
    console.warn('RJ Thrift Hub could not save the catalog for offline viewing.', error);
  }
}

async function getProfile(userId) {
  const profile = await unwrap(
    getSupabase().from('profiles').select('id,name,email,role').eq('id', userId).single()
  );
  return { ...profile, _id: profile.id };
}

async function getAccessToken(fallback) {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw apiError(error);
  return data.session?.access_token || fallback;
}

async function getOrder(id, withUser = false) {
  const selection = withUser
    ? '*,items:order_items(*),user:profiles(id,name,email)'
    : '*,items:order_items(*)';
  return normalizeOrder(await unwrap(getSupabase().from('orders').select(selection).eq('id', id).single()));
}

async function expressRequest(path, { token, ...options } = {}) {
  const accessToken = await getAccessToken(token);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers
    }
  });
  let body = null;
  if (response.status !== 204) {
    try {
      body = await response.json();
    } catch {
      throw new Error('The API returned an unreadable response. Check that the backend is running and configured.');
    }
  }
  if (!response.ok) {
    const error = new Error(body?.error?.message || 'The request could not be completed.');
    error.code = body?.error?.code;
    error.status = response.status;
    throw error;
  }
  return body?.data;
}

export async function signOutSupabase() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw apiError(error);
}

export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);

  if (pathname === '/checkout' || pathname === '/ai/discover' ||
      /^\/orders\/[^/]+\/verify-payment$/.test(pathname)) {
    return expressRequest(path, options);
  }

  const supabaseClient = getSupabase();

  if (pathname === '/auth/register' && method === 'POST') {
    const { data, error } = await supabaseClient.auth.signUp({
      email: body.email,
      password: body.password,
      options: { data: { name: body.name } }
    });
    if (error) throw apiError(error);
    if (!data.session) {
      throw new Error('Account created. Confirm your email, then sign in to continue.');
    }
    return { token: data.session.access_token, user: await getProfile(data.user.id) };
  }

  if (pathname === '/auth/login' && method === 'POST') {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: body.email,
      password: body.password
    });
    if (error) throw apiError(error);
    return { token: data.session.access_token, user: await getProfile(data.user.id) };
  }

  if (pathname === '/auth/me') {
    const accessToken = await getAccessToken(options.token);
    const { data, error } = await supabaseClient.auth.getUser(accessToken);
    if (error) throw apiError(error);
    return getProfile(data.user.id);
  }

  if (pathname === '/cart' && method === 'GET') {
    const cart = await unwrap(supabaseClient.rpc('get_cart'));
    return { ...cart, items: cart.items.map((item) => ({ ...item, product: normalizeProduct(item.product) })) };
  }

  if (pathname === '/cart/items' && method === 'POST') {
    const cart = await unwrap(supabaseClient.rpc('add_cart_item', { p_product_id: body.productId }));
    return { ...cart, items: cart.items.map((item) => ({ ...item, product: normalizeProduct(item.product) })) };
  }

  const cartItemMatch = pathname.match(/^\/cart\/items\/([^/]+)$/);
  if (cartItemMatch && method === 'DELETE') {
    const cart = await unwrap(supabaseClient.rpc('remove_cart_item', { p_product_id: cartItemMatch[1] }));
    return { ...cart, items: cart.items.map((item) => ({ ...item, product: normalizeProduct(item.product) })) };
  }

  if (pathname === '/checkout/quote' && method === 'POST') {
    return unwrap(supabaseClient.rpc('quote_cart', { p_coupon_code: body.couponCode || null }));
  }

  if (pathname === '/products') {
    const products = await unwrap(supabaseClient.rpc('search_products', {
      p_search: params.get('search') || null,
      p_category: params.get('category') && params.get('category') !== 'All' ? params.get('category') : null,
      p_min_price: params.has('minPrice') ? Number(params.get('minPrice')) : null,
      p_max_price: params.has('maxPrice') ? Number(params.get('maxPrice')) : null,
      p_sort: params.get('sort') || 'newest',
      p_page: Number(params.get('page') || 1),
      p_limit: Math.min(Number(params.get('limit') || 50), 50)
    }));
    const normalized = products.map(normalizeProduct);
    if (!params.get('search') && (!params.get('category') || params.get('category') === 'All') &&
        Number(params.get('page') || 1) === 1) {
      cacheProducts(normalized);
    }
    return normalized;
  }

  const productMatch = pathname.match(/^\/products\/([^/]+)$/);
  if (productMatch) {
    const product = await unwrap(supabaseClient.from('products').select('*').eq('id', productMatch[1]).eq('active', true).maybeSingle());
    if (!product) throw new Error('Product not found.');
    return normalizeProduct(product);
  }

  if (pathname === '/orders' && method === 'GET') {
    const page = Math.max(Number(params.get('page') || 1), 1);
    const limit = Math.min(Math.max(Number(params.get('limit') || 20), 1), 50);
    const { data, error } = await supabaseClient.from('orders')
      .select('*,items:order_items(*)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (error) throw apiError(error);
    return data.map(normalizeOrder);
  }

  const orderMatch = pathname.match(/^\/orders\/([^/]+)$/);
  if (orderMatch && method === 'GET') return getOrder(orderMatch[1]);

  const cancelMatch = pathname.match(/^\/orders\/([^/]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    await unwrap(supabaseClient.rpc('cancel_order', { p_order_id: cancelMatch[1] }));
    return getOrder(cancelMatch[1]);
  }

  if (pathname === '/admin/dashboard') return unwrap(supabaseClient.rpc('admin_dashboard_stats'));

  if (pathname === '/admin/products' && method === 'GET') {
    return (await unwrap(supabaseClient.from('products').select('*').order('created_at', { ascending: false }))).map(normalizeProduct);
  }
  if (pathname === '/admin/products' && method === 'POST') {
    const product = await unwrap(supabaseClient.from('products').insert({
      name: body.name,
      description: body.description,
      category: body.category,
      price: body.price,
      image: body.image,
      size: body.size,
      condition: body.condition,
      tag: body.tag || '',
      stock: body.stock,
      active: true
    }).select().single());
    return normalizeProduct(product);
  }

  const productAdminMatch = pathname.match(/^\/admin\/products\/([^/]+)$/);
  if (productAdminMatch && method === 'PATCH') {
    const patch = {};
    for (const key of ['name', 'description', 'category', 'price', 'image', 'size', 'condition', 'tag', 'active']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    return normalizeProduct(await unwrap(
      supabaseClient.from('products').update(patch).eq('id', productAdminMatch[1]).select().single()
    ));
  }

  const stockMatch = pathname.match(/^\/admin\/products\/([^/]+)\/stock$/);
  if (stockMatch && method === 'POST') {
    return unwrap(supabaseClient.rpc('admin_adjust_inventory', {
      p_product_id: stockMatch[1],
      p_change: body.change,
      p_reason: body.reason
    }));
  }

  if (pathname === '/admin/orders' && method === 'GET') {
    const orders = await unwrap(supabaseClient.from('orders')
      .select('*,items:order_items(*),user:profiles(id,name,email)')
      .order('created_at', { ascending: false }));
    return orders.map(normalizeOrder);
  }

  const adminOrderStatusMatch = pathname.match(/^\/admin\/orders\/([^/]+)\/status$/);
  if (adminOrderStatusMatch && method === 'PATCH') {
    await unwrap(supabaseClient.rpc('admin_update_order_status', {
      p_order_id: adminOrderStatusMatch[1],
      p_status: body.status
    }));
    return getOrder(adminOrderStatusMatch[1], true);
  }

  if (pathname === '/admin/coupons' && method === 'GET') {
    return (await unwrap(supabaseClient.rpc('admin_list_coupons'))).map(normalizeCoupon);
  }
  if (pathname === '/admin/coupons' && method === 'POST') {
    const coupon = await unwrap(supabaseClient.from('coupons').insert({
      code: body.code.toUpperCase(),
      type: body.type,
      value: body.value,
      minimum_spend: body.minimumSpend,
      expires_at: body.expiresAt,
      usage_limit: body.usageLimit,
      per_customer_limit: body.perCustomerLimit,
      active: body.active
    }).select().single());
    return normalizeCoupon(coupon);
  }

  const couponMatch = pathname.match(/^\/admin\/coupons\/([^/]+)$/);
  if (couponMatch && method === 'PATCH') {
    const patch = {};
    if (body.active !== undefined) patch.active = body.active;
    if (body.expiresAt !== undefined) patch.expires_at = body.expiresAt;
    await unwrap(supabaseClient.from('coupons').update(patch).eq('id', couponMatch[1]).select('id').single());
    const coupons = await unwrap(supabaseClient.rpc('admin_list_coupons'));
    return normalizeCoupon(coupons.find((coupon) => coupon.id === couponMatch[1]));
  }

  throw new Error(`Unsupported API operation: ${method} ${pathname}`);
}

export function getProductId(product) {
  return product?._id ?? product?.id;
}
