alter table public.products
  add column if not exists size_stock jsonb not null default '{}'::jsonb;

update public.products p
set size_stock = inventory.stock_map
from (
  select
    p.id,
    jsonb_object_agg(
      sized.size,
      to_jsonb(
        p.stock / cardinality(p.sizes)
        + case when sized.position <= p.stock % cardinality(p.sizes) then 1 else 0 end
      )
    ) as stock_map
  from public.products p
  cross join lateral unnest(p.sizes) with ordinality as sized(size, position)
  where p.size_stock = '{}'::jsonb and cardinality(p.sizes) > 0
  group by p.id
) inventory
where p.id = inventory.id;

alter table public.order_items
  drop constraint if exists order_items_quantity_check;
alter table public.order_items
  add constraint order_items_quantity_check check (quantity > 0);

alter table public.reservations
  add column if not exists size text not null default '';
alter table public.reservations
  drop constraint if exists reservations_quantity_check;
alter table public.reservations
  add constraint reservations_quantity_check check (quantity > 0);

update public.reservations r
set size = oi.size
from public.order_items oi
where r.order_id = oi.order_id
  and r.product_id = oi.product_id
  and r.size = '';

update public.cart_items ci
set size = p.size
from public.products p
where p.id = ci.product_id and ci.size = '';

create or replace function public.add_cart_item(p_product_id uuid, p_size text default null, p_quantity integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_size text;
  v_size_stock integer;
  v_cart_quantity integer;
  v_quantity integer := coalesce(p_quantity, 1);
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if v_quantity < 1 or v_quantity > 9999 then raise exception 'INVALID_QUANTITY'; end if;
  select * into v_product
  from public.products
  where id = p_product_id and active
  for update;
  if not found then raise exception 'OUT_OF_STOCK'; end if;
  v_size := coalesce(nullif(trim(p_size), ''), v_product.size);
  v_size_stock := coalesce((v_product.size_stock ->> v_size)::integer, 0);
  select coalesce(sum(quantity), 0) into v_cart_quantity
  from public.cart_items
  where user_id = auth.uid() and product_id = p_product_id and size = v_size;
  if v_size_stock < v_cart_quantity + v_quantity then raise exception 'OUT_OF_STOCK'; end if;

  insert into public.cart_items (user_id, product_id, size, quantity)
  values (auth.uid(), p_product_id, v_size, v_quantity)
  on conflict (user_id, product_id, size) do update
  set quantity = public.cart_items.quantity + excluded.quantity;
  return public.get_cart();
end;
$$;

drop function if exists public.remove_cart_item(uuid);
create function public.remove_cart_item(p_product_id uuid, p_size text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_size is null then
    delete from public.cart_items where user_id = auth.uid() and product_id = p_product_id;
  else
    delete from public.cart_items where user_id = auth.uid() and product_id = p_product_id and size = p_size;
  end if;
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
  where ci.user_id = v_user_id and p.active
    and coalesce((p.size_stock ->> ci.size)::integer, 0) >= ci.quantity;
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

create or replace function public.create_order_and_reserve(
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
    select ci.product_id, ci.size, ci.quantity, p.name, p.price
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = p_user_id
    order by ci.product_id, ci.size
  loop
    update public.products
    set size_stock = jsonb_set(
          size_stock,
          array[v_item.size],
          to_jsonb((size_stock ->> v_item.size)::integer - v_item.quantity),
          false
        ),
        stock = stock - v_item.quantity
    where id = v_item.product_id and active
      and coalesce((size_stock ->> v_item.size)::integer, 0) >= v_item.quantity;
    if not found then raise exception 'OUT_OF_STOCK: % (%).', v_item.name, v_item.size; end if;
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
  select v_order_id, p.id, p.name, p.image, ci.size, ci.quantity, p.price
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = p_user_id;

  insert into public.reservations (order_id, product_id, size, quantity, expires_at)
  select v_order_id, product_id, size, quantity, now() + interval '30 minutes'
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
    select product_id, size, quantity from public.reservations
    where order_id = p_order_id and status = 'active'
    for update
  loop
    update public.products
    set size_stock = jsonb_set(
          size_stock,
          array[v_reservation.size],
          to_jsonb(coalesce((size_stock ->> v_reservation.size)::integer, 0) + v_reservation.quantity),
          true
        ),
        stock = stock + v_reservation.quantity
    where id = v_reservation.product_id;
    if exists (
      select 1 from public.products
      where id = v_reservation.product_id and active and coalesce((size_stock ->> v_reservation.size)::integer, 0) > 0
    ) then
      insert into public.cart_items (user_id, product_id, size, quantity)
      values (v_order.user_id, v_reservation.product_id, v_reservation.size, v_reservation.quantity)
      on conflict (user_id, product_id, size) do update
      set quantity = public.cart_items.quantity + excluded.quantity;
    end if;
  end loop;
  update public.reservations set status = p_status
  where order_id = p_order_id and status = 'active';
  delete from public.coupon_usages where order_id = p_order_id;
  select * into v_order from public.orders where id = p_order_id;
  return to_jsonb(v_order);
end;
$$;

create or replace function public.admin_update_product_inventory(
  p_product_id uuid,
  p_price integer,
  p_sizes text[],
  p_size_stock jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_product public.products%rowtype;
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_price is null or p_price < 0 or p_sizes is null or cardinality(p_sizes) not between 1 and 30 then
    raise exception 'INVALID_PRODUCT_INVENTORY';
  end if;
  if (select count(distinct requested.size) from unnest(p_sizes) as requested(size)) <> cardinality(p_sizes)
    or exists (select 1 from unnest(p_sizes) as requested(size) where nullif(trim(requested.size), '') is null)
    or coalesce(jsonb_typeof(p_size_stock), '') <> 'object'
    or exists (
      select 1 from unnest(p_sizes) as requested(size)
      where not (p_size_stock ? requested.size)
    )
    or exists (
      select 1 from jsonb_each(p_size_stock) item
      where not (item.key = any(p_sizes))
        or jsonb_typeof(item.value) <> 'number'
        or (item.value #>> '{}') !~ '^[0-9]{1,4}$'
    ) then
    raise exception 'INVALID_PRODUCT_INVENTORY';
  end if;
  select coalesce(sum(value::integer), 0) into v_total
  from jsonb_each_text(p_size_stock);
  if v_total > 9999 then raise exception 'INVALID_PRODUCT_INVENTORY'; end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if exists (select 1 from public.reservations where product_id = p_product_id and status = 'active') then
    raise exception 'ITEM_RESERVED';
  end if;
  update public.products
  set price = p_price,
      sizes = p_sizes,
      size = p_sizes[1],
      size_stock = p_size_stock,
      stock = v_total
  where id = p_product_id
  returning to_jsonb(products) into v_result;
  return v_result;
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
  v_size text;
  v_size_stock integer;
  v_new_stock integer;
  v_movement_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_change = 0 then raise exception 'INVALID_STOCK'; end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if p_change > 0 then
    v_size := v_product.sizes[1];
  else
    select item.key, item.value::integer into v_size, v_size_stock
    from jsonb_each_text(v_product.size_stock) item
    where item.value::integer >= abs(p_change)
    order by item.value::integer desc
    limit 1;
    if v_size is null then raise exception 'INVALID_STOCK'; end if;
  end if;
  v_size_stock := coalesce((v_product.size_stock ->> v_size)::integer, 0);
  v_new_stock := v_product.stock + p_change;
  if v_new_stock < 0 or v_new_stock > 9999 then raise exception 'INVALID_STOCK'; end if;
  if p_change > 0 and exists (
    select 1 from public.reservations where product_id = p_product_id and status = 'active'
  ) then raise exception 'ITEM_RESERVED'; end if;
  update public.products
  set size_stock = jsonb_set(size_stock, array[v_size], to_jsonb(v_size_stock + p_change), true),
      stock = v_new_stock
  where id = p_product_id;
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

grant insert (name, description, category, price, image, size, sizes, size_stock, condition, tag, stock, active)
  on public.products to authenticated;
revoke execute on function public.add_cart_item(uuid, text, integer) from public, anon;
revoke execute on function public.remove_cart_item(uuid, text) from public, anon;
grant execute on function public.add_cart_item(uuid, text, integer) to authenticated;
grant execute on function public.remove_cart_item(uuid, text) to authenticated;
revoke execute on function public.admin_update_product_inventory(uuid, integer, text[], jsonb) from public, anon;
grant execute on function public.admin_update_product_inventory(uuid, integer, text[], jsonb) to authenticated;
