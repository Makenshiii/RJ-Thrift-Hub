# RJ Thrift Hub

RJ Thrift Hub is a mobile-first, installable shopping PWA for one-of-a-kind pre-loved clothing.

## Stack

- React + Vite customer and admin app
- Supabase Auth and Postgres for accounts, catalog, carts, coupons, orders, and inventory
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

The client example is configured with this project's Supabase URL and publishable key. The publishable key is intended for browser use. Keep the **newly rotated** Supabase service-role key only in `backend\.env`; never put it in `client\.env`, source code, or chat.

Before using Supabase:

1. Revoke/rotate the service-role key that was previously shared.
2. In the Supabase SQL Editor, run [`supabase/migrations/202611230001_initial_schema.sql`](./supabase/migrations/202611230001_initial_schema.sql).
3. Set `SUPABASE_URL` and the newly rotated `SUPABASE_SERVICE_ROLE_KEY` in `backend\.env`.
4. Configure Maya values in `backend\.env` when ready to test checkout. Configure Gemini there if you want AI discovery.
5. To provision a store admin, set `SEED_ADMIN_EMAIL` and a private `SEED_ADMIN_PASSWORD` (at least 12 characters) in `backend\.env`.

The migration creates the schema, indexes, RLS policies, profile trigger, and transactional RPCs. It does not erase existing project data. The seed command adds 21 sample products and three coupons, and optionally creates the configured admin account:

```powershell
npm run seed
npm run dev
```

Open the Vite URL (normally http://localhost:5173). The Express API runs at http://localhost:4000 and its payment/AI API documentation is at http://localhost:4000/api-docs. New Supabase Auth accounts may require email confirmation, depending on the project's Auth settings.

The interface uses app-style screens and a fixed, safe-area-aware bottom bar. On supported browsers, install it from the browser's install/Add to Home Screen action to launch in standalone mode.

Workbox precaches the production app shell. A successful public catalog response is also saved locally for up to seven days; previously downloaded Unsplash product images are cached for up to 30 days. Some public Supabase product GET requests use a 24-hour NetworkFirst cache. These caches never include authentication, cart, order, checkout, or payment responses. Offline cached and sample products are browse-only—availability and purchases always require a live connection. If Supabase is unavailable or the catalog is empty, the app shows a clearly labeled cached or sample catalog rather than claiming live inventory.

## Commands

```powershell
npm run dev       # API and React app
npm run seed      # Add catalog, coupons, and optionally an admin account
npm test          # API and business-rule tests
npm run build     # Production frontend build
npm audit         # Dependency audit
```

## Integration boundary

The browser uses the Supabase publishable key and the signed-in user's Supabase session for ordinary application data. RLS protects reads and writes; checkout, stock reservation, coupon claiming, payment verification, and admin inventory/status changes use database functions that enforce their own authorization and consistency rules. The Supabase service-role key is backend-only.

Express validates Supabase access tokens before starting checkout, and keeps Maya credentials and webhook signature verification server-side. Orders become paid only after a signed webhook or customer-triggered reconciliation confirms the Maya amount, currency, and status. Gemini is also called only from Express.

Existing data in a previous MongoDB instance is not automatically imported. The schema and seed command prepare Supabase without modifying that old database.

Never commit `.env` files, service-role credentials, Maya secrets, or real payment data. `.env.example` files may contain the public Supabase URL and publishable key only.
