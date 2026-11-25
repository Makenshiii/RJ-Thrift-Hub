alter table public.products
  add column if not exists sizes text[] not null default '{}';

alter table public.products
  alter column sizes set default '{}';

alter table public.products
  drop constraint if exists products_stock_check;
alter table public.products
  alter column stock type integer using stock::integer,
  add constraint products_stock_check check (stock >= 0);

update public.products
set sizes = case
  when coalesce(cardinality(sizes), 0) > 0 then sizes
  else array[size]
end
where coalesce(cardinality(sizes), 0) = 0;

update public.products
set
  sizes = case category
    when 'Tops' then array['XS', 'S', 'M', 'L', 'XL', 'XXL']
    when 'Outerwear' then array['XS', 'S', 'M', 'L', 'XL', 'XXL']
    when 'Bottoms' then array['26', '28', '30', '32', '34', '36']
    when 'Shoes' then array['36', '37', '38', '39', '40', '41', '42', '43', '44']
    when 'Accessories' then array['One size']
    else sizes
  end,
  stock = case name
    when 'Vintage Denim Jacket' then 6
    when 'Classic White Shirt' then 9
    when 'Relaxed Cargo Pants' then 4
    when 'Retro Knit Sweater' then 7
    when 'Everyday Canvas Tote' then 12
    when 'Neutral Oversized Tee' then 5
    when 'Retro Crossbody Bag' then 3
    when 'Straight-Leg Jeans' then 10
    when 'Corduroy Overshirt' then 8
    when 'Striped Cotton Blouse' then 6
    when 'Pleated Midi Skirt' then 11
    when 'Woven Market Bag' then 4
    when 'Vintage Track Jacket' then 9
    when 'Soft Linen Shirt' then 7
    when 'Wide-Leg Trousers' then 5
    when 'Canvas Belt Bag' then 12
    when 'Quilted Weekend Jacket' then 3
    when 'Printed Camp Collar Shirt' then 8
    when 'Denim Midi Skirt' then 10
    when 'Leather-look Mini Bag' then 6
    when 'Classic Low-Top Sneakers' then 4
    else stock
  end,
  tag = case when tag = 'ONE ONLY' then '' else tag end
where name in (
  'Vintage Denim Jacket', 'Classic White Shirt', 'Relaxed Cargo Pants',
  'Retro Knit Sweater', 'Everyday Canvas Tote', 'Neutral Oversized Tee',
  'Retro Crossbody Bag', 'Straight-Leg Jeans', 'Corduroy Overshirt',
  'Striped Cotton Blouse', 'Pleated Midi Skirt', 'Woven Market Bag',
  'Vintage Track Jacket', 'Soft Linen Shirt', 'Wide-Leg Trousers',
  'Canvas Belt Bag', 'Quilted Weekend Jacket', 'Printed Camp Collar Shirt',
  'Denim Midi Skirt', 'Leather-look Mini Bag', 'Classic Low-Top Sneakers'
);

alter table public.cart_items
  add column if not exists size text not null default '';

alter table public.cart_items
  alter column quantity type integer using quantity::integer;
alter table public.cart_items
  drop constraint if exists cart_items_quantity_check;
alter table public.cart_items
  add constraint cart_items_quantity_check check (quantity > 0);

alter table public.cart_items
  drop constraint if exists cart_items_pkey;
alter table public.cart_items
  add constraint cart_items_pkey primary key (user_id, product_id, size);

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
      'size', ci.size,
      'lineTotal', p.price * ci.quantity
    ) order by ci.created_at), '[]'::jsonb),
    'subtotal', coalesce(sum(p.price * ci.quantity), 0)
  )
  from public.cart_items ci
  join public.products p on p.id = ci.product_id
  where ci.user_id = (select auth.uid()) and p.active;
$$;

create or replace function public.add_cart_item(p_product_id uuid, p_size text default null, p_quantity integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quantity integer := greatest(coalesce(p_quantity, 1), 1);
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (
    select 1 from public.products
    where id = p_product_id and active and stock >= v_quantity
  ) then
    raise exception 'OUT_OF_STOCK';
  end if;
  insert into public.cart_items (user_id, product_id, size, quantity)
  values (auth.uid(), p_product_id, coalesce(nullif(trim(p_size), ''), ''), v_quantity)
  on conflict (user_id, product_id, size) do update
  set quantity = cart_items.quantity + v_quantity;
  return public.get_cart();
end;
$$;

grant insert (name, description, category, price, image, size, sizes, condition, tag, stock, active)
  on public.products to authenticated;
grant update (name, description, category, price, image, size, sizes, condition, tag, active)
  on public.products to authenticated;
