# RJ Thrift Hub

RJ Thrift Hub is a mobile-first, installable shopping PWA for one-of-a-kind pre-loved clothing.

## Stack

- React + Vite customer and admin app
- Express REST API for all browser data access and authenticated operations
- Supabase Auth and Postgres behind Express for accounts, catalog, carts, coupons, orders, and inventory
- Row Level Security plus Postgres RPCs for protected access and atomic checkout/reservation flows
- Express for Maya Checkout, signed Maya webhooks, and Gemini product discovery
- Vite PWA with a standalone install manifest, Workbox precaching, and bounded offline caches
- OpenAPI, Postman collection, and Node test runner

## Requirements

- Node.js 20.19+ (or 22.12+)
- A Supabase project
- Maya Checkout credentials to accept real payments
- Optional Gemini API key for AI discovery

## Setup on Windows

From the project root:

```powershell
npm install
if (!(Test-Path client\.env)) { Copy-Item client\.env.example client\.env }
if (!(Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
```

The browser does not need Supabase credentials. `VITE_API_URL` defaults to the local Vite proxy (`/api/v1`); set it to the deployed Express API base URL when frontend and backend are hosted separately. Configure Supabase URL, publishable key, and the newly rotated service-role key only in `backend\.env`; never put the service-role key in the client or chat.

Before using Supabase:

1. Revoke/rotate the service-role key that was previously shared.
2. In the Supabase SQL Editor, run [`supabase/migrations/202611230001_initial_schema.sql`](./supabase/migrations/202611230001_initial_schema.sql).
3. Run [`supabase/migrations/202611260001_product_sizes_stock.sql`](./supabase/migrations/202611260001_product_sizes_stock.sql) to add multiple product sizes and numeric stock.
4. Run [`supabase/migrations/202611260002_size_level_inventory.sql`](./supabase/migrations/202611260002_size_level_inventory.sql) to track stock separately for each size.
5. Run [`supabase/migrations/202611260003_expand_sample_inventory.sql`](./supabase/migrations/202611260003_expand_sample_inventory.sql) to add larger per-size quantities to the sample products.
6. Run [`supabase/migrations/202611260004_refresh_inventory_rpc.sql`](./supabase/migrations/202611260004_refresh_inventory_rpc.sql) to refresh the admin inventory RPC and Supabase schema cache.
7. Run [`supabase/migrations/202611260005_seed_product_size_ranges.sql`](./supabase/migrations/202611260005_seed_product_size_ranges.sql) to apply size ranges to seeded products.
8. Run [`supabase/migrations/202611260006_product_specific_sizes.sql`](./supabase/migrations/202611260006_product_specific_sizes.sql) to give each sample product its own size options and size inventory.
9. Run [`supabase/migrations/202611260007_refresh_add_cart_item_rpc.sql`](./supabase/migrations/202611260007_refresh_add_cart_item_rpc.sql) to refresh the size-aware add-to-bag function and Supabase schema cache.
10. Run [`supabase/migrations/202611260008_keep_cart_until_payment.sql`](./supabase/migrations/202611260008_keep_cart_until_payment.sql) so pending checkout does not empty the cart and only verified payment clears purchased quantities.
11. Run [`supabase/migrations/202611260009_repair_checkout_inventory.sql`](./supabase/migrations/202611260009_repair_checkout_inventory.sql) to allow cart quantities above one, add the missing product `sizes` column when needed, and fill per-size inventory while preserving each product's aggregate stock.
12. Run [`supabase/migrations/202611260010_payment_session_recovery.sql`](./supabase/migrations/202611260010_payment_session_recovery.sql) to enable safe retries for pending orders that do not yet have a Maya session.
13. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the newly rotated `SUPABASE_SERVICE_ROLE_KEY` in `backend\.env`.
14. Configure Maya values in `backend\.env` when ready to test checkout. Configure Gemini there if you want AI discovery.
15. To provision a store admin, set `SEED_ADMIN_EMAIL` and a private `SEED_ADMIN_PASSWORD` (at least 12 characters) in `backend\.env`.

### Maya Sandbox checkout

The backend needs both a Maya Sandbox **Public API Key** (`MAYA_PUBLIC_KEY`) to create Checkout sessions and its matching **Secret API Key** (`MAYA_SECRET_KEY`) to verify payments. In Maya Business Manager, open **Developer Sandbox Application Management** and create or select keys for the **Checkout** service. If you do not have Business Manager access, Maya lists shared test credentials in its [Sandbox Credentials and Cards guide](https://developers.maya.ph/reference/sandbox-credentials-and-cards); use a matching Checkout public/secret pair from that guide. Do not copy production keys into the sandbox environment.

Set these values only in the private `backend\.env` file:

```dotenv
MAYA_ENVIRONMENT=sandbox
MAYA_PUBLIC_KEY=your-sandbox-checkout-public-key
MAYA_SECRET_KEY=your-matching-sandbox-checkout-secret-key
```

Restart the backend after changing the file. `MAYA_WEBHOOK_PUBLIC_KEY_1` and `MAYA_WEBHOOK_PUBLIC_KEY_2` are optional overrides for Maya's webhook-signing public keys; leave them blank to use the provider's built-in Sandbox verification keys unless Maya gives you replacement signing keys. These are **not** API secret keys. Never put any Maya key in `client\.env`, source code, chat, or a committed file. Sandbox API keys create test sessions only; the payment page should use Maya's Sandbox host.

The initial migration creates the schema, indexes, RLS policies, profile trigger, and transactional RPCs. The product sizes/stock migrations add category-specific sizes, per-size inventory, and larger quantities to the sample catalog. The size-level inventory migration keeps cart and checkout reservations size-specific. These migrations do not erase existing project data. The seed command adds 21 sample products and three coupons, and optionally creates the configured admin account:

```powershell
npm run seed
npm run dev
```

Open the Vite URL (normally http://localhost:5173). The Express API runs at http://localhost:4000 and its payment/AI API documentation is at http://localhost:4000/api-docs. New Supabase Auth accounts may require email confirmation, depending on the project's Auth settings.

Run the root `npm run dev` command only once; it starts both services. If the API is already running on port 4000, start only the client with `npm run dev --workspace client` instead of starting a second backend. An `EADDRINUSE` error means that port is already occupied; verify the existing `/api/v1/health` endpoint before stopping any process.

The interface uses app-style screens and a fixed, safe-area-aware bottom bar. On supported browsers, install it from the browser's install/Add to Home Screen action to launch in standalone mode.

Workbox precaches the production app shell. Public `GET /api/v1/products` responses without an Authorization header use a bounded NetworkFirst cache; locally saved catalog data is retained for up to seven days, and previously downloaded product images for up to 30 days. Authentication, cart, order, checkout, and payment responses are never cached. Offline cached and sample products are browse-only—availability and purchases always require a live connection. If the API is unavailable or the catalog is empty, the app labels cached or sample pieces instead of claiming live inventory. `client/public/offline.html` is available as a static offline fallback page.

The client uses BrowserRouter paths for products, checkout, payment returns, customer orders, account, and admin pages. The Vercel rewrite in `client/vercel.json` and Netlify rule in `client/public/_redirects` route direct page loads to the SPA shell. For separate frontend/backend hosting, set `VITE_API_URL` to the Express API origin and configure that API's CORS allowlist for the deployed client origin.

## Grounded AI Discovery

The Shop page sends a normalized 3-200 character request to `POST /api/v1/ai/discover`. Gemini is called only by Express using Google's official `@google/genai` SDK and the private `GEMINI_API_KEY` from `backend\.env`. The stable default model is `gemini-3.5-flash-lite`; `GEMINI_MODEL` can override it. Never use a `VITE_` variable for Gemini credentials. `AI_EXPLANATIONS=false` keeps optional per-product reasons disabled by default.

Gemini interprets the shopper's request into bounded search filters only; it never chooses product IDs or supplies catalog facts. The backend derives allowed categories and sizes from active database rows, validates Gemini's structured output, then calls the existing `search_products` RPC. Product names, prices, image URLs, condition, sizes, and quantities in the response are shaped from returned database rows and `size_stock` (with the row's aggregate stock used only for legacy rows without a size map). Results are limited to 12 in-stock products. This grounding leaves the Supabase schema and checkout/inventory logic unchanged.

The system instruction treats shopper text and any product text as untrusted input, ignores embedded instructions, and requires only schema-conforming JSON. The interpretation request contains no product descriptions or prices. Server-side validation drops unknown filters, clamps prices, checks category/size values against the catalog, and maps malformed model output to a generic 503 without logging the query, key, or model response. Gemini calls have an 8-second SDK timeout and rate limiting; if AI search is unavailable, the Shop page automatically retries the same query through standard catalog search and labels those results as standard search.

## Commands

```powershell
npm run dev       # API and React app
npm run seed      # Add catalog, coupons, and optionally an admin account
npm test          # API and business-rule tests
npm run lint      # Frontend/backend lint; enforces react/no-danger
npm run build     # Production frontend build
npm audit         # Dependency audit
```

## Integration boundary

The browser calls the Express `/api/v1` contract for all account, catalog, cart, order, checkout, and admin data. Express validates the Supabase user session and forwards that user's access token to Supabase, so RLS and `auth.uid()` RPC authorization remain authoritative. The Supabase publishable key and service-role key remain backend-only; the service-role key is reserved for backend operations that require it.

Express validates Supabase access tokens before starting checkout, and keeps Maya credentials and webhook signature verification server-side. Orders become paid only after a signed webhook or customer-triggered reconciliation confirms the Maya amount, currency, and status. Gemini is also called only from Express.

Existing data in a previous MongoDB instance is not automatically imported. The schema and seed command prepare Supabase without modifying that old database.

Never commit `.env` files, service-role credentials, Maya secrets, or real payment data. `.env.example` files contain placeholders only.
