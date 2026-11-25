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

revoke execute on function public.admin_update_product_inventory(uuid, integer, text[], jsonb) from public, anon;
grant execute on function public.admin_update_product_inventory(uuid, integer, text[], jsonb) to authenticated;
grant insert (name, description, category, price, image, size, sizes, size_stock, condition, tag, stock, active)
  on public.products to authenticated;

notify pgrst, 'reload schema';
