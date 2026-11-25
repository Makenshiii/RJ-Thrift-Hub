# Database design

Supabase Postgres is the application data store. Apply [`../supabase/migrations/202611230001_initial_schema.sql`](../supabase/migrations/202611230001_initial_schema.sql) in the Supabase SQL Editor before starting the API or seeding. The migration is repeatable and does not drop existing project data.

| Table | Important rules |
|---|---|
| `profiles` | One row per Supabase Auth user; role is `customer` or `admin`; created by an Auth trigger |
| `products` | Nonnegative price; stock is 0 or 1; public reads limited to active items; only admins can edit |
| `cart_items` | One unique item per user/product; read is owner-scoped; cart mutations use authenticated RPCs |
| `coupons` | Unique uppercase code; active/expiry/minimum/usage rules and per-customer usage limits |
| `orders` | Unique `(user_id, idempotency_key)`; server-calculated money fields; JSON shipping address; explicit payment and fulfillment state |
| `order_items` | Immutable purchase snapshots for names, images, size, quantity, and unit price |
| `reservations` | Order/product/quantity/expiry/status records for reserved inventory |
| `coupon_usages` | One claimed coupon per order and per-customer usage accounting |
| `order_history` | Append-only status transitions |
| `payment_events` | Unique Maya event ID prevents repeat processing |
| `inventory_movements` | Previous/new stock, reason, actor, and timestamp |

RLS is enabled on all application tables. User-facing RPCs derive the user ID from the Supabase JWT; admin RPCs verify the profile role. Checkout and payment RPCs are executable only by the backend service role.

## Seed

`npm run seed` adds 21 sample products and three coupons. It does not erase existing data. To also create a store admin, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in the backend environment before running the seed. The seed does not create shared demo customer accounts or preset passwords.

Existing records from a prior MongoDB database are not automatically imported; that database is left untouched.
