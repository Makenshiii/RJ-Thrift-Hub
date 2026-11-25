alter table public.products
  add column if not exists sizes text[] not null default '{}',
  add column if not exists size_stock jsonb not null default '{}'::jsonb;

alter table public.order_items
  drop constraint if exists order_items_quantity_check;
alter table public.order_items
  add constraint order_items_quantity_check check (quantity > 0);

alter table public.reservations
  drop constraint if exists reservations_quantity_check;
alter table public.reservations
  add constraint reservations_quantity_check check (quantity > 0);

with catalog_products as (
  select
    p.id,
    p.name,
    p.size as current_size,
    p.stock as total_stock,
    p.size_stock as current_size_stock,
    case p.name
      when 'Vintage Denim Jacket' then array['S', 'M', 'L']
      when 'Classic White Shirt' then array['S', 'M', 'L', 'XL']
      when 'Relaxed Cargo Pants' then array['28', '30', '32', '34']
      when 'Retro Knit Sweater' then array['M', 'L']
      when 'Neutral Oversized Tee' then array['M', 'L', 'XL', 'XXL']
      when 'Straight-Leg Jeans' then array['28', '30', '32', '34']
      when 'Corduroy Overshirt' then array['M', 'L', 'XL']
      when 'Striped Cotton Blouse' then array['XS', 'S', 'M']
      when 'Pleated Midi Skirt' then array['S', 'M', 'L', 'XL']
      when 'Vintage Track Jacket' then array['S', 'M', 'L']
      when 'Soft Linen Shirt' then array['S', 'M', 'L']
      when 'Wide-Leg Trousers' then array['26', '28', '30']
      when 'Quilted Weekend Jacket' then array['L', 'XL', 'XXL']
      when 'Printed Camp Collar Shirt' then array['S', 'M', 'L', 'XL']
      when 'Denim Midi Skirt' then array['28', '30', '32']
      when 'Classic Low-Top Sneakers' then array['38', '39', '40', '41', '42', '43']
      when 'Everyday Canvas Tote' then array['One size']
      when 'Retro Crossbody Bag' then array['One size']
      when 'Woven Market Bag' then array['One size']
      when 'Canvas Belt Bag' then array['One size']
      when 'Leather-look Mini Bag' then array['One size']
    end as sizes
  from public.products p
  where p.name in (
    'Vintage Denim Jacket', 'Classic White Shirt', 'Relaxed Cargo Pants',
    'Retro Knit Sweater', 'Everyday Canvas Tote', 'Neutral Oversized Tee',
    'Retro Crossbody Bag', 'Straight-Leg Jeans', 'Corduroy Overshirt',
    'Striped Cotton Blouse', 'Pleated Midi Skirt', 'Woven Market Bag',
    'Vintage Track Jacket', 'Soft Linen Shirt', 'Wide-Leg Trousers',
    'Canvas Belt Bag', 'Quilted Weekend Jacket', 'Printed Camp Collar Shirt',
    'Denim Midi Skirt', 'Leather-look Mini Bag', 'Classic Low-Top Sneakers'
  )
),
product_sizes as (
  select
    catalog_products.id,
    catalog_products.current_size,
    catalog_products.total_stock,
    catalog_products.current_size_stock,
    sized.size,
    sized.position,
    case
      when jsonb_typeof(catalog_products.current_size_stock -> sized.size) = 'number'
        and (catalog_products.current_size_stock ->> sized.size) ~ '^[0-9]+$'
      then (catalog_products.current_size_stock ->> sized.size)::numeric
      else null
    end as existing_quantity
  from catalog_products
  cross join lateral unnest(catalog_products.sizes) with ordinality as sized(size, position)
),
size_quantities as (
  select
    product_sizes.*,
    sum(existing_quantity) over (partition by id) as existing_total,
    count(*) filter (where existing_quantity is null) over (partition by id) as missing_size_count,
    sum(case when existing_quantity is null then 1 else 0 end) over (
      partition by id
      order by position
      rows between unbounded preceding and current row
    ) as missing_size_position,
    count(*) over (partition by id) as size_count
  from product_sizes
),
allocated_inventory as (
  select
    id,
    current_size,
    size,
    position,
    case
      when existing_total <= total_stock and missing_size_count > 0 then
        coalesce(
          existing_quantity,
          floor((total_stock - existing_total) / missing_size_count)
          + case
              when missing_size_position <= mod(total_stock - existing_total, missing_size_count) then 1
              else 0
            end
        )
      when existing_total <= total_stock then
        existing_quantity
        + floor((total_stock - existing_total) / size_count)
        + case
            when position <= mod(total_stock - existing_total, size_count) then 1
            else 0
          end
      else
        floor(total_stock / size_count)
        + case when position <= mod(total_stock, size_count) then 1 else 0 end
    end::integer as quantity
  from size_quantities
),
product_inventory as (
  select
    id,
    array_agg(size order by position) as sizes,
    max(current_size) as current_size,
    jsonb_object_agg(size, to_jsonb(quantity)) as size_stock,
    sum(quantity)::integer as stock
  from allocated_inventory
  group by id
)
update public.products p
set sizes = product_inventory.sizes,
    size = case when product_inventory.current_size = any(product_inventory.sizes)
      then product_inventory.current_size else product_inventory.sizes[1] end,
    size_stock = product_inventory.size_stock,
    stock = product_inventory.stock
from product_inventory
where p.id = product_inventory.id
  and p.name in (
    'Vintage Denim Jacket', 'Classic White Shirt', 'Relaxed Cargo Pants',
    'Retro Knit Sweater', 'Everyday Canvas Tote', 'Neutral Oversized Tee',
    'Retro Crossbody Bag', 'Straight-Leg Jeans', 'Corduroy Overshirt',
    'Striped Cotton Blouse', 'Pleated Midi Skirt', 'Woven Market Bag',
    'Vintage Track Jacket', 'Soft Linen Shirt', 'Wide-Leg Trousers',
    'Canvas Belt Bag', 'Quilted Weekend Jacket', 'Printed Camp Collar Shirt',
    'Denim Midi Skirt', 'Leather-look Mini Bag', 'Classic Low-Top Sneakers'
  );

notify pgrst, 'reload schema';
