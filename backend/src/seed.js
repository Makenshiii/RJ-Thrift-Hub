import { supabase } from './lib/supabase.js';

const catalog = [
  ['Vintage Denim Jacket', 'A timeless denim layer with a relaxed vintage fit.', 'Outerwear', 350, 'M', 'Very good', 'BEST FIND', '1543076447-215ad9ba6923'],
  ['Classic White Shirt', 'An easy everyday essential. Clean, versatile, and simple to style.', 'Tops', 180, 'L', 'Like new', 'FRESH DROP', '1598033129183-c4f50c736f10'],
  ['Relaxed Cargo Pants', 'Comfortable relaxed-fit cargos with a practical everyday look.', 'Bottoms', 280, '32', 'Very good', 'TRENDING', '1517438476312-10d79c077509'],
  ['Retro Knit Sweater', 'A cozy retro-inspired knit with plenty of character.', 'Tops', 240, 'M', 'Good', 'RARE FIND', '1576566588028-4147f3842f27'],
  ['Everyday Canvas Tote', 'A reusable tote for errands, school, and everyday carry.', 'Accessories', 120, 'One size', 'Very good', '', '1544816155-12df9643f363'],
  ['Neutral Oversized Tee', 'Soft-feel oversized tee in a versatile neutral shade.', 'Tops', 150, 'XL', 'Like new', '', '1521572163474-6864f9cf17ab'],
  ['Retro Crossbody Bag', 'A compact vintage-inspired bag, ready for a new owner.', 'Accessories', 210, 'One size', 'Good', '', '1548036328-c9fa89d128fa'],
  ['Straight-Leg Jeans', 'Easy-to-style straight-leg denim with a classic silhouette.', 'Bottoms', 260, '30', 'Very good', '', '1541099649105-f69ad21f3246'],
  ['Corduroy Overshirt', 'Soft corduroy overshirt in a warm earthy tone.', 'Outerwear', 320, 'L', 'Good', '', '1591047139829-d91aecb6caea'],
  ['Striped Cotton Blouse', 'Lightweight striped blouse for relaxed everyday styling.', 'Tops', 190, 'S', 'Very good', '', '1551488831-00ddcb6c6bd3'],
  ['Pleated Midi Skirt', 'A flowing pleated skirt in an easy neutral color.', 'Bottoms', 220, 'M', 'Like new', '', '1583496661160-fb5886a0aaaa'],
  ['Woven Market Bag', 'Handy woven bag with room for daily essentials.', 'Accessories', 160, 'One size', 'Good', '', '1590874103328-eac38a683ce7'],
  ['Vintage Track Jacket', 'Sporty retro track jacket with a relaxed shape.', 'Outerwear', 290, 'M', 'Very good', 'FRESH DROP', '1551028719-00167b16eac5'],
  ['Soft Linen Shirt', 'Breathable linen-blend shirt with a gently worn-in feel.', 'Tops', 230, 'L', 'Good', '', '1596755094514-f87e34085b2c'],
  ['Wide-Leg Trousers', 'High-rise wide-leg trousers in a versatile dark shade.', 'Bottoms', 270, '28', 'Very good', '', '1509631179647-0177331693ae'],
  ['Canvas Belt Bag', 'Compact hands-free bag for everyday outings.', 'Accessories', 140, 'One size', 'Like new', '', '1553062407-98eeb64c6a62'],
  ['Quilted Weekend Jacket', 'Lightweight quilted layer with practical pockets.', 'Outerwear', 390, 'XL', 'Very good', 'RARE FIND', '1544923246-77307dd654cb'],
  ['Printed Camp Collar Shirt', 'A relaxed camp-collar shirt with a playful print.', 'Tops', 200, 'M', 'Good', '', '1603252110481-7ba873bf42ab'],
  ['Denim Midi Skirt', 'Classic denim midi skirt with a straight silhouette.', 'Bottoms', 250, '30', 'Very good', '', '1582418702059-97ebafb35d09'],
  ['Leather-look Mini Bag', 'A small statement bag, ready for a second life.', 'Accessories', 180, 'One size', 'Good', '', '1584917865442-de89df76afd3'],
  ['Classic Low-Top Sneakers', 'Gently worn everyday sneakers with plenty of life left.', 'Shoes', 300, '39', 'Good', '', '1542291026-7eec264c27ff']
];

const sizesByProduct = {
  'Vintage Denim Jacket': ['S', 'M', 'L'],
  'Classic White Shirt': ['S', 'M', 'L', 'XL'],
  'Relaxed Cargo Pants': ['28', '30', '32', '34'],
  'Retro Knit Sweater': ['M', 'L'],
  'Everyday Canvas Tote': ['One size'],
  'Neutral Oversized Tee': ['M', 'L', 'XL', 'XXL'],
  'Retro Crossbody Bag': ['One size'],
  'Straight-Leg Jeans': ['28', '30', '32', '34'],
  'Corduroy Overshirt': ['M', 'L', 'XL'],
  'Striped Cotton Blouse': ['XS', 'S', 'M'],
  'Pleated Midi Skirt': ['S', 'M', 'L', 'XL'],
  'Woven Market Bag': ['One size'],
  'Vintage Track Jacket': ['S', 'M', 'L'],
  'Soft Linen Shirt': ['S', 'M', 'L'],
  'Wide-Leg Trousers': ['26', '28', '30'],
  'Canvas Belt Bag': ['One size'],
  'Quilted Weekend Jacket': ['L', 'XL', 'XXL'],
  'Printed Camp Collar Shirt': ['S', 'M', 'L', 'XL'],
  'Denim Midi Skirt': ['28', '30', '32'],
  'Leather-look Mini Bag': ['One size'],
  'Classic Low-Top Sneakers': ['38', '39', '40', '41', '42', '43']
};
for (const [index, [name, description, category, price, size, condition, tag, imageId]] of catalog.entries()) {
  const sizes = sizesByProduct[name];
  const sizeStock = Object.fromEntries(sizes.map((value, sizeIndex) => [
    value,
    category === 'Accessories' ? 15 + (index % 10) : 5 + ((index + sizeIndex) % 6)
  ]));
  const stock = Object.values(sizeStock).reduce((total, quantity) => total + quantity, 0);
  const { data: existing, error: lookupError } = await supabase.from('products')
    .select('id,sizes')
    .eq('name', name)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) continue;

  const { error } = await supabase.from('products').insert({
    name,
    description,
    category,
    price,
    size: sizes.includes(size) ? size : sizes[0],
    sizes,
    size_stock: sizeStock,
    condition,
    tag,
    stock,
    active: true,
    image: `https://images.unsplash.com/photo-${imageId}?auto=format&fit=crop&w=900&q=85`
  });
  if (error) throw error;
}

const coupons = [
  { code: 'WELCOME10', type: 'percentage', value: 10, minimum_spend: 300, per_customer_limit: 1, active: true },
  { code: 'THRIFT50', type: 'fixed', value: 50, minimum_spend: 250, per_customer_limit: 1, active: true },
  { code: 'FREESHIP', type: 'fixed', value: 100, minimum_spend: 500, per_customer_limit: 1, active: true }
];
for (const coupon of coupons) {
  const { error } = await supabase.from('coupons').upsert(coupon, { onConflict: 'code', ignoreDuplicates: true });
  if (error) throw error;
}

const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
if (adminEmail || adminPassword) {
  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    throw new Error('Set both SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of at least 12 characters.');
  }
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let adminUser = userList.users.find((user) => user.email?.toLowerCase() === adminEmail);
  if (!adminUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { name: 'RJ Store Admin' }
    });
    if (error) throw error;
    adminUser = data.user;
  }
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: adminUser.id,
    name: adminUser.user_metadata?.name || 'RJ Store Admin',
    email: adminEmail,
    role: 'admin'
  });
  if (profileError) throw profileError;
  console.log(`Seeded admin account ${adminEmail}.`);
} else {
  console.log('Skipped admin creation; set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.');
}

console.log(`Seed complete: ${catalog.length} products and ${coupons.length} coupons.`);
