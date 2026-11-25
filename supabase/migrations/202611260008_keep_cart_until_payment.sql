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
  where ci.user_id = v_user_id
    and p.active
    and coalesce((p.size_stock ->> ci.size)::integer, 0) + coalesce((
      select sum(r.quantity)
      from public.reservations r
      join public.orders o on o.id = r.order_id
      where o.user_id = ci.user_id
        and o.status = 'pending_payment'
        and o.reservation_expires_at > now()
        and r.status = 'active'
        and r.expires_at > now()
        and r.product_id = ci.product_id
        and r.size = ci.size
    ), 0) >= ci.quantity;
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
  v_expired_order record;
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

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select id into v_order_id from public.orders
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('id', v_order_id, 'created', false); end if;

  for v_expired_order in
    select id from public.orders
    where user_id = p_user_id
      and status = 'pending_payment'
      and reservation_expires_at <= now()
    order by created_at
    for update
  loop
    perform public.release_order_reservation(v_expired_order.id, 'expired', null);
  end loop;

  select id into v_order_id from public.orders
  where user_id = p_user_id
    and status = 'pending_payment'
    and reservation_expires_at > now()
  order by created_at desc
  limit 1
  for update;
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
  end loop;
  update public.reservations set status = p_status
  where order_id = p_order_id and status = 'active';
  delete from public.coupon_usages where order_id = p_order_id;
  select * into v_order from public.orders where id = p_order_id;
  return to_jsonb(v_order);
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
  v_item record;
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

    for v_item in
      select product_id, size, quantity
      from public.order_items
      where order_id = p_order_id and product_id is not null
    loop
      update public.cart_items
      set quantity = quantity - v_item.quantity
      where user_id = v_order.user_id
        and product_id = v_item.product_id
        and size = v_item.size
        and quantity > v_item.quantity;
      if not found then
        delete from public.cart_items
        where user_id = v_order.user_id
          and product_id = v_item.product_id
          and size = v_item.size
          and quantity <= v_item.quantity;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'paid', (select status in ('paid', 'processing', 'shipped', 'delivered') from public.orders where id = p_order_id),
    'mismatch', false
  );
end;
$$;

notify pgrst, 'reload schema';
