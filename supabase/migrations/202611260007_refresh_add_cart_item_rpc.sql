drop function if exists public.add_cart_item(uuid, text, integer);
drop function if exists public.add_cart_item(uuid, integer, text);

create function public.add_cart_item(
  p_product_id uuid,
  p_size text default null,
  p_quantity integer default 1
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

revoke execute on function public.add_cart_item(uuid, text, integer) from public, anon;
grant execute on function public.add_cart_item(uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
