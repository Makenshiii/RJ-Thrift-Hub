with catalog_products as (
  select
    p.id,
    p.name,
    p.size as current_size,
    case p.name
      when 'Vintage Denim Jacket' then array['S', 'M', 'L']
      when 'Classic White Shirt' then array['S', 'M', 'L', 'XL']
      when 'Relaxed Cargo Pants' then array['28', '30', '32', '34']
      when 'Retro Knit Sweater' then array['M', 'L']
      when 'Everyday Canvas Tote' then array['One size']
      when 'Neutral Oversized Tee' then array['M', 'L', 'XL', 'XXL']
      when 'Retro Crossbody Bag' then array['One size']
      when 'Straight-Leg Jeans' then array['28', '30', '32', '34']
      when 'Corduroy Overshirt' then array['M', 'L', 'XL']
      when 'Striped Cotton Blouse' then array['XS', 'S', 'M']
      when 'Pleated Midi Skirt' then array['S', 'M', 'L', 'XL']
      when 'Woven Market Bag' then array['One size']
      when 'Vintage Track Jacket' then array['S', 'M', 'L']
      when 'Soft Linen Shirt' then array['S', 'M', 'L']
      when 'Wide-Leg Trousers' then array['26', '28', '30']
      when 'Canvas Belt Bag' then array['One size']
      when 'Quilted Weekend Jacket' then array['L', 'XL', 'XXL']
      when 'Printed Camp Collar Shirt' then array['S', 'M', 'L', 'XL']
      when 'Denim Midi Skirt' then array['28', '30', '32']
      when 'Leather-look Mini Bag' then array['One size']
      when 'Classic Low-Top Sneakers' then array['38', '39', '40', '41', '42', '43']
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
size_quantities as (
  select
    catalog_products.id,
    catalog_products.current_size,
    sized.size,
    sized.position,
    case
      when sized.size = 'One size' then 15 + mod(abs(hashtext(catalog_products.id::text)::bigint), 10)::integer
      else 5 + mod(abs(hashtext(catalog_products.id::text)::bigint + sized.position), 6)::integer
    end as quantity
  from catalog_products
  cross join lateral unnest(catalog_products.sizes) with ordinality as sized(size, position)
),
product_inventory as (
  select
    id,
    array_agg(size order by position) as sizes,
    max(current_size) as current_size,
    jsonb_object_agg(size, to_jsonb(quantity)) as size_stock,
    sum(quantity)::integer as stock
  from size_quantities
  group by id
)
update public.products p
set sizes = product_inventory.sizes,
    size = case when product_inventory.current_size = any(product_inventory.sizes)
      then product_inventory.current_size else product_inventory.sizes[1] end,
    size_stock = product_inventory.size_stock,
    stock = product_inventory.stock
from product_inventory
where p.id = product_inventory.id;

notify pgrst, 'reload schema';
