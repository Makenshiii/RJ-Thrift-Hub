create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  description text not null check (char_length(description) between 5 and 2000),
  category text not null check (char_length(category) between 2 and 60),
  price integer not null check (price >= 0),
  image text not null,
  size text not null,
  condition text not null check (condition in ('Like new', 'Very good', 'Good', 'Fair')),
  tag text not null default '',
  stock smallint not null default 1 check (stock in (0, 1)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_active_category_price_created
  on public.products (active, category, price, created_at desc);

create table if not exists public.cart_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity smallint not null default 1 check (quantity = 1),
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,40}$'),
  type text not null check (type in ('percentage', 'fixed')),
  value numeric not null check (value >= 0 and (type <> 'percentage' or value <= 100) and (type <> 'fixed' or value = trunc(value))),
  minimum_spend integer not null default 0 check (minimum_spend >= 0),
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit >= 1),
  per_customer_limit integer not null default 1 check (per_customer_limit >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  idempotency_key text not null,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  shipping_fee integer not null default 0 check (shipping_fee >= 0),
  total integer not null check (total >= 0),
  currency text not null default 'PHP',
  coupon_code text,
  shipping_address jsonb not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired', 'payment_mismatch')),
  payment_checkout_id text unique,
  checkout_url text,
  payment_id text unique,
  payment_issue jsonb,
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists orders_status_expiry on public.orders (status, reservation_expires_at);
create index if not exists orders_created_at on public.orders (created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  image text not null,
  size text not null,
  quantity smallint not null check (quantity = 1),
  unit_price integer not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id on public.order_items (order_id);

create table if not exists public.order_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity smallint not null check (quantity = 1),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'paid', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservations_product_status on public.reservations (product_id, status);
create index if not exists reservations_expires_at on public.reservations (expires_at);

create table if not exists public.coupon_usages (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  user_id uuid not null references public.profiles(id),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists coupon_usages_coupon_user on public.coupon_usages (coupon_id, user_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  previous_stock smallint not null,
  new_stock smallint not null,
  reason text not null check (char_length(reason) between 3 and 300),
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
drop trigger if exists coupons_set_updated_at on public.coupons;
create trigger coupons_set_updated_at before update on public.coupons
for each row execute function public.set_updated_at();
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at before update on public.reservations
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
    lower(new.email)
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.search_products(
  p_search text default null,
  p_category text default null,
  p_min_price integer default null,
  p_max_price integer default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_limit integer default 50
)
returns setof public.products
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select p.*
  from public.products p
  where p.active
    and (p_category is null or p.category = p_category)
    and (p_min_price is null or p.price >= p_min_price)
    and (p_max_price is null or p.price <= p_max_price)
    and (nullif(trim(p_search), '') is null or
      p.name ilike '%' || trim(p_search) || '%' or
      p.description ilike '%' || trim(p_search) || '%' or
      p.category ilike '%' || trim(p_search) || '%')
  order by
    case when p_sort = 'price' then p.price end asc nulls last,
    case when p_sort = '-price' then p.price end desc nulls last,
    p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 50)
  offset (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_limit, 50), 1), 50);
$$;

create or replace function public.get_cart()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'product', to_jsonb(p) || jsonb_build_object('_id', p.id),
      'quantity', ci.quantity,
      'lineTotal', p.price * ci.quantity
    ) order by ci.created_at), '[]'::jsonb),
    'subtotal', coalesce(sum(p.price * ci.quantity), 0)
  )
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = (select auth.uid()) and p.active;
$$;

create or replace function public.add_cart_item(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (select 1 from public.products where id = p_product_id and active and stock > 0) then
    raise exception 'OUT_OF_STOCK';
  end if;
  insert into public.cart_items (user_id, product_id, quantity)
  values (auth.uid(), p_product_id, 1)
  on conflict (user_id, product_id) do nothing;
  return public.get_cart();
end;
$$;

create or replace function public.remove_cart_item(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  delete from public.cart_items where user_id = auth.uid() and product_id = p_product_id;
  return public.get_cart();
end;
$$;

create or replace function public.quote_cart(p_coupon_code text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_subtotal integer;
  v_item_count integer;
  v_available_count integer;
  v_discount integer := 0;
  v_shipping integer;
  v_coupon public.coupons%rowtype;
  v_usage_count integer;
  v_customer_count integer;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  select count(*) into v_item_count
  from public.cart_items ci
  where ci.user_id = v_user_id;
  if v_item_count = 0 then raise exception 'CART_EMPTY'; end if;

  select coalesce(sum(p.price * ci.quantity), 0), count(*) into v_subtotal, v_available_count
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = v_user_id and p.active and p.stock >= ci.quantity;
  if v_available_count <> v_item_count then raise exception 'OUT_OF_STOCK'; end if;

  if nullif(trim(p_coupon_code), '') is not null then
    select * into v_coupon from public.coupons
    where code = upper(trim(p_coupon_code)) and active
    for update;
    if not found then raise exception 'COUPON_INVALID'; end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then raise exception 'COUPON_EXPIRED'; end if;
    if v_subtotal < v_coupon.minimum_spend then raise exception 'COUPON_MINIMUM_SPEND'; end if;
    select count(*) into v_usage_count from public.coupon_usages where coupon_id = v_coupon.id;
    select count(*) into v_customer_count from public.coupon_usages
    where coupon_id = v_coupon.id and user_id = v_user_id;
    if v_coupon.usage_limit is not null and v_usage_count >= v_coupon.usage_limit then raise exception 'COUPON_EXHAUSTED'; end if;
    if v_customer_count >= v_coupon.per_customer_limit then raise exception 'COUPON_CUSTOMER_LIMIT'; end if;
    if v_coupon.type = 'percentage' then
      v_discount := round(v_subtotal * v_coupon.value / 100);
    else
      v_discount := least(v_subtotal, v_coupon.value::integer);
    end if;
  end if;
  v_shipping := case when v_subtotal - v_discount >= 1500 then 0 else 100 end;
  return jsonb_build_object(
    'subtotal', v_subtotal,
    'discount', v_discount,
    'shippingFee', v_shipping,
    'total', v_subtotal - v_discount + v_shipping,
    'currency', 'PHP'
  );
end;
$$;

drop function if exists public.create_order_and_reserve(uuid, text, text, jsonb);
create function public.create_order_and_reserve(
  p_user_id uuid,
  p_idempotency_key text,
  p_coupon_code text,
  p_shipping_address jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_shipping integer;
  v_total integer;
  v_coupon public.coupons%rowtype;
  v_usage_count integer;
  v_customer_count integer;
  v_item record;
begin
  if p_user_id is null or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'INVALID_CHECKOUT_REQUEST';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
  select id into v_order_id from public.orders
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('id', v_order_id, 'created', false); end if;

  perform 1 from public.cart_items where user_id = p_user_id for update;
  if not exists (select 1 from public.cart_items where user_id = p_user_id) then
    raise exception 'CART_EMPTY';
  end if;

  for v_item in
    select ci.product_id, ci.quantity, p.name, p.price
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = p_user_id
    order by ci.product_id
  loop
    update public.products
      set stock = stock - v_item.quantity
      where id = v_item.product_id and active and stock >= v_item.quantity;
    if not found then raise exception 'OUT_OF_STOCK: %', v_item.name; end if;
    v_subtotal := v_subtotal + v_item.price * v_item.quantity;
  end loop;

  if nullif(trim(p_coupon_code), '') is not null then
    select * into v_coupon from public.coupons
    where code = upper(trim(p_coupon_code)) and active
    for update;
    if not found then raise exception 'COUPON_INVALID'; end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then raise exception 'COUPON_EXPIRED'; end if;
    if v_subtotal < v_coupon.minimum_spend then raise exception 'COUPON_MINIMUM_SPEND'; end if;
    select count(*) into v_usage_count from public.coupon_usages where coupon_id = v_coupon.id;
    select count(*) into v_customer_count from public.coupon_usages
    where coupon_id = v_coupon.id and user_id = p_user_id;
    if v_coupon.usage_limit is not null and v_usage_count >= v_coupon.usage_limit then raise exception 'COUPON_EXHAUSTED'; end if;
    if v_customer_count >= v_coupon.per_customer_limit then raise exception 'COUPON_CUSTOMER_LIMIT'; end if;
    if v_coupon.type = 'percentage' then
      v_discount := round(v_subtotal * v_coupon.value / 100);
    else
      v_discount := least(v_subtotal, v_coupon.value::integer);
    end if;
  end if;

  v_shipping := case when v_subtotal - v_discount >= 1500 then 0 else 100 end;
  v_total := v_subtotal - v_discount + v_shipping;
  insert into public.orders (
    user_id, idempotency_key, subtotal, discount, shipping_fee, total,
    coupon_code, shipping_address, status, reservation_expires_at
  ) values (
    p_user_id, p_idempotency_key, v_subtotal, v_discount, v_shipping, v_total,
    nullif(upper(trim(p_coupon_code)), ''), p_shipping_address, 'pending_payment', now() + interval '30 minutes'
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, name, image, size, quantity, unit_price)
  select v_order_id, p.id, p.name, p.image, p.size, ci.quantity, p.price
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = p_user_id;

  insert into public.reservations (order_id, product_id, quantity, expires_at)
  select v_order_id, product_id, quantity, now() + interval '30 minutes'
  from public.cart_items where user_id = p_user_id;

  insert into public.order_history (order_id, status, actor_id)
  values (v_order_id, 'pending_payment', p_user_id);

  if v_coupon.id is not null then
    insert into public.coupon_usages (coupon_id, user_id, order_id)
    values (v_coupon.id, p_user_id, v_order_id);
  end if;

  delete from public.cart_items where user_id = p_user_id;
  return jsonb_build_object('id', v_order_id, 'created', true);
end;
$$;

create or replace function public.release_order_reservation(
  p_order_id uuid,
  p_status text default 'cancelled',
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_reservation record;
begin
  if p_status not in ('cancelled', 'expired') then raise exception 'INVALID_RESERVATION_STATUS'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending_payment' then return to_jsonb(v_order); end if;

  update public.orders set status = p_status where id = p_order_id;
  insert into public.order_history (order_id, status, actor_id) values (p_order_id, p_status, p_actor_id);
  for v_reservation in
    select product_id, quantity from public.reservations
    where order_id = p_order_id and status = 'active'
    for update
  loop
    update public.products set stock = least(1, stock + v_reservation.quantity)
    where id = v_reservation.product_id;
    if exists (
      select 1 from public.products
      where id = v_reservation.product_id and active and stock > 0
    ) then
      insert into public.cart_items (user_id, product_id, quantity)
      values (v_order.user_id, v_reservation.product_id, 1)
      on conflict (user_id, product_id) do nothing;
    end if;
  end loop;
  update public.reservations set status = p_status
  where order_id = p_order_id and status = 'active';
  delete from public.coupon_usages where order_id = p_order_id;
  select * into v_order from public.orders where id = p_order_id;
  return to_jsonb(v_order);
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_order from public.orders
  where id = p_order_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending_payment' then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
  return public.release_order_reservation(p_order_id, 'cancelled', auth.uid());
end;
$$;

create or replace function public.finalize_order_payment(
  p_order_id uuid,
  p_payment_id text,
  p_amount_cents bigint,
  p_currency text,
  p_paid boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_mismatch boolean := false;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not p_paid then return jsonb_build_object('paid', false, 'mismatch', false); end if;
  if v_order.status = 'payment_mismatch' then
    return jsonb_build_object('paid', false, 'mismatch', true);
  end if;

  if p_amount_cents <> v_order.total * 100 or upper(p_currency) <> v_order.currency then
    v_mismatch := true;
  end if;

  if v_order.status = 'pending_payment'
    and v_order.reservation_expires_at is not null
    and v_order.reservation_expires_at <= now() then
    perform public.release_order_reservation(p_order_id, 'expired', null);
    v_mismatch := true;
  end if;

  if v_order.status in ('cancelled', 'expired') then
    v_mismatch := true;
  end if;

  if v_mismatch and v_order.status in ('pending_payment', 'cancelled', 'expired') then
    update public.orders set
      status = 'payment_mismatch',
      payment_issue = jsonb_build_object(
        'expectedAmount', v_order.total * 100,
        'actualAmount', p_amount_cents,
        'expectedCurrency', v_order.currency,
        'actualCurrency', upper(p_currency),
        'reason', 'Gateway amount or currency did not match the order, or payment arrived after reservation ended.'
      )
    where id = p_order_id;
    insert into public.order_history (order_id, status) values (p_order_id, 'payment_mismatch');
    return jsonb_build_object('paid', false, 'mismatch', true);
  end if;

  if v_order.status = 'pending_payment' then
    update public.orders set status = 'paid', payment_id = p_payment_id where id = p_order_id;
    update public.reservations set status = 'paid'
    where order_id = p_order_id and status = 'active';
    insert into public.order_history (order_id, status) values (p_order_id, 'paid');
  end if;
  return jsonb_build_object(
    'paid', (select status in ('paid', 'processing', 'shipped', 'delivered') from public.orders where id = p_order_id),
    'mismatch', false
  );
end;
$$;

create or replace function public.admin_adjust_inventory(
  p_product_id uuid,
  p_change integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_new_stock integer;
  v_movement_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  v_new_stock := v_product.stock + p_change;
  if v_new_stock not in (0, 1) then raise exception 'INVALID_UNIQUE_ITEM_STOCK'; end if;
  if p_change > 0 and exists (
    select 1 from public.reservations where product_id = p_product_id and status = 'active'
  ) then raise exception 'ITEM_RESERVED'; end if;
  update public.products set stock = v_new_stock where id = p_product_id;
  insert into public.inventory_movements (product_id, previous_stock, new_stock, reason, actor_id)
  values (p_product_id, v_product.stock, v_new_stock, p_reason, auth.uid())
  returning id into v_movement_id;
  return jsonb_build_object(
    'id', v_movement_id,
    'product', p_product_id,
    'previousStock', v_product.stock,
    'newStock', v_new_stock,
    'reason', p_reason
  );
end;
$$;

create or replace function public.admin_update_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_allowed boolean;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_allowed := (v_order.status = 'paid' and p_status = 'processing')
    or (v_order.status = 'processing' and p_status = 'shipped')
    or (v_order.status = 'shipped' and p_status = 'delivered');
  if not v_allowed then raise exception 'ILLEGAL_ORDER_TRANSITION'; end if;
  update public.orders set status = p_status where id = p_order_id;
  insert into public.order_history (order_id, status, actor_id) values (p_order_id, p_status, auth.uid());
  return jsonb_build_object('id', p_order_id, 'status', p_status);
end;
$$;

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_paid_orders integer;
  v_gross_sales bigint;
  v_pending_orders integer;
  v_low_stock jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select count(*), coalesce(sum(total), 0) into v_paid_orders, v_gross_sales
  from public.orders where status in ('paid', 'processing', 'shipped', 'delivered');
  select count(*) into v_pending_orders from public.orders where status = 'pending_payment';
  select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('_id', p.id)), '[]'::jsonb)
    into v_low_stock from (
      select id, name, category, stock from public.products
      where active and stock <= 0 order by created_at desc limit 20
    ) p;
  return jsonb_build_object(
    'paidOrders', v_paid_orders,
    'grossSales', v_gross_sales,
    'pendingOrders', v_pending_orders,
    'lowStock', v_low_stock
  );
end;
$$;

create or replace function public.admin_list_coupons()
returns table (
  id uuid,
  code text,
  type text,
  value numeric,
  minimum_spend integer,
  expires_at timestamptz,
  usage_limit integer,
  per_customer_limit integer,
  active boolean,
  created_at timestamptz,
  usage_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    select c.id, c.code, c.type, c.value, c.minimum_spend, c.expires_at,
      c.usage_limit, c.per_customer_limit, c.active, c.created_at, count(cu.id)
    from public.coupons c
    left join public.coupon_usages cu on cu.coupon_id = c.id
    group by c.id
    order by c.created_at desc;
end;
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_history enable row level security;
alter table public.reservations enable row level security;
alter table public.coupon_usages enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.payment_events enable row level security;

grant usage on schema public to anon, authenticated, service_role;

drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles
for select to authenticated using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "products_read_active_or_admin" on public.products;
create policy "products_read_active_or_admin" on public.products
for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_insert" on public.products
for insert to authenticated with check (public.is_admin());
drop policy if exists "products_admin_update" on public.products;
create policy "products_admin_update" on public.products
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "cart_items_read_self" on public.cart_items;
create policy "cart_items_read_self" on public.cart_items
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "coupons_read_active_or_admin" on public.coupons;
create policy "coupons_read_active_or_admin" on public.coupons
for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "coupons_admin_insert" on public.coupons;
create policy "coupons_admin_insert" on public.coupons
for insert to authenticated with check (public.is_admin());
drop policy if exists "coupons_admin_update" on public.coupons;
create policy "coupons_admin_update" on public.coupons
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders_read_owner_or_admin" on public.orders;
create policy "orders_read_owner_or_admin" on public.orders
for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "order_items_read_owner_or_admin" on public.order_items;
create policy "order_items_read_owner_or_admin" on public.order_items
for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
  )
);

drop policy if exists "order_history_read_owner_or_admin" on public.order_history;
create policy "order_history_read_owner_or_admin" on public.order_history
for select to authenticated using (
  public.is_admin() or exists (
    select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
  )
);

drop policy if exists "inventory_movements_admin_read" on public.inventory_movements;
create policy "inventory_movements_admin_read" on public.inventory_movements
for select to authenticated using (public.is_admin());

revoke all on public.profiles, public.products, public.cart_items, public.coupons, public.orders,
  public.order_items, public.order_history, public.reservations, public.coupon_usages,
  public.inventory_movements, public.payment_events from anon, authenticated;
grant select on public.profiles, public.products, public.cart_items, public.coupons,
  public.orders, public.order_items, public.order_history to anon, authenticated;
grant insert (name, description, category, price, image, size, condition, tag, stock, active)
  on public.products to authenticated;
grant update (name, description, category, price, image, size, condition, tag, active)
  on public.products to authenticated;
grant insert, update on public.coupons to authenticated;
grant select on public.inventory_movements to authenticated;
grant all on all tables in schema public to service_role;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.search_products(text, text, integer, integer, text, integer, integer) to anon, authenticated;
revoke execute on function public.get_cart() from public, anon;
revoke execute on function public.add_cart_item(uuid) from public, anon;
revoke execute on function public.remove_cart_item(uuid) from public, anon;
revoke execute on function public.quote_cart(text) from public, anon;
grant execute on function public.get_cart() to authenticated;
grant execute on function public.add_cart_item(uuid) to authenticated;
grant execute on function public.remove_cart_item(uuid) to authenticated;
grant execute on function public.quote_cart(text) to authenticated;
revoke execute on function public.create_order_and_reserve(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.release_order_reservation(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.finalize_order_payment(uuid, text, bigint, text, boolean) from public, anon, authenticated;
revoke execute on function public.cancel_order(uuid) from public, anon;
revoke execute on function public.admin_adjust_inventory(uuid, integer, text) from public, anon;
revoke execute on function public.admin_update_order_status(uuid, text) from public, anon;
revoke execute on function public.admin_dashboard_stats() from public, anon;
revoke execute on function public.admin_list_coupons() from public, anon;
grant execute on function public.create_order_and_reserve(uuid, text, text, jsonb) to service_role;
grant execute on function public.release_order_reservation(uuid, text, uuid) to service_role;
grant execute on function public.finalize_order_payment(uuid, text, bigint, text, boolean) to service_role;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.admin_adjust_inventory(uuid, integer, text) to authenticated;
grant execute on function public.admin_update_order_status(uuid, text) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_list_coupons() to authenticated;

notify pgrst, 'reload schema';
