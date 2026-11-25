with size_quantities as (
  select
    p.id,
    sized.size,
    case
      when p.category = 'Accessories' then 15 + mod(abs(hashtext(p.name)::bigint), 10)::integer
      else 5 + mod(abs(hashtext(p.name)::bigint + sized.position), 6)::integer
    end as quantity
  from public.products p
  cross join lateral unnest(p.sizes) with ordinality as sized(size, position)
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
product_inventory as (
  select
    id,
    jsonb_object_agg(size, to_jsonb(quantity)) as size_stock,
    sum(quantity)::integer as stock
  from size_quantities
  group by id
)
update public.products p
set size_stock = product_inventory.size_stock,
    stock = product_inventory.stock
from product_inventory
where p.id = product_inventory.id;
