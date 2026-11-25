with catalog_products as (
  select
    p.id,
    p.name,
    p.category,
    p.size,
    case p.category
      when 'Tops' then array['XS', 'S', 'M', 'L', 'XL', 'XXL']
      when 'Outerwear' then array['XS', 'S', 'M', 'L', 'XL', 'XXL']
      when 'Bottoms' then array['26', '28', '30', '32', '34', '36']
      when 'Shoes' then array['36', '37', '38', '39', '40', '41', '42', '43', '44']
      when 'Accessories' then array['One size']
      else p.sizes
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
    catalog_products.size as current_size,
    sized.size,
    sized.position,
    case
      when catalog_products.category = 'Accessories' then 15 + mod(abs(hashtext(catalog_products.name)::bigint), 10)::integer
      else 5 + mod(abs(hashtext(catalog_products.name)::bigint + sized.position), 6)::integer
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
