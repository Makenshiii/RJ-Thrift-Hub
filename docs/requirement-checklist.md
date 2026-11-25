# Project requirement-to-code checklist

| Requirement | Implementation | Verification / remaining |
|---|---|---|
| Mobile-first storefront and product browsing | `client/src/App.jsx`, `client/src/components/ProductCard.jsx`, `client/src/styles.css` | Production build; test the requested viewport sizes on a real browser before submission. |
| URL navigation and direct page loads | `client/src/main.jsx`, `client/src/App.jsx`, `client/vercel.json`, `client/public/_redirects` | BrowserRouter paths cover home, products/details, AI discovery, cart, checkout, payment return, orders/details, account, login/register, and admin. Verify hosting rewrites on the chosen host. |
| Authentication and customer/admin route protection | `client/src/context/AuthContext.jsx`, `client/src/App.jsx`, `backend/src/controllers/authController.js`, `backend/src/middleware/auth.js` | Backend tests cover auth/API behavior. Verify customer and admin accounts against the configured Supabase project. |
| Express-only browser data boundary | `client/src/api/`, `backend/src/routes/api.js`, `backend/src/lib/requestSupabase.js` | Client modules call `/api/v1`; user operations forward the authenticated bearer token and remain subject to Supabase RLS. No client Supabase adapter remains. |
| Catalog, cart, quantities, quote, and customer orders | `client/src/api/products.js`, `client/src/api/cart.js`, `client/src/api/orders.js`, `backend/src/controllers/catalogController.js`, `backend/src/controllers/cartController.js`, `backend/src/controllers/ordersController.js` | Uses existing tables/RPCs. Run the existing Supabase migrations and test with a signed-in customer. |
| Maya hosted checkout and verified payment | `client/src/api/checkout.js`, `backend/src/services/checkoutService.js`, `backend/src/services/MayaCheckoutProvider.js`, `backend/src/controllers/webhookController.js`, `backend/src/services/paymentVerificationService.js` | Checkout return is informational; only a verified webhook or server-side reconciliation marks an order paid. Sandbox E2E requires valid Sandbox keys and a public HTTPS webhook URL. |
| Admin catalog, per-size stock, pricing, coupons, and order status | `client/src/api/admin.js`, `client/src/App.jsx`, `backend/src/controllers/adminController.js` | Admin endpoints require verified admin authorization and existing database RPC/RLS rules. Verify with a configured admin account. |
| Offline shell, browse-only catalog, and disabled online actions | `client/vite.config.js`, `client/public/offline.html`, `client/src/context/NetworkStatusContext.jsx`, `client/src/context/CartContext.jsx`, `client/src/App.jsx` | Only public product GET responses without Authorization are runtime-cached. Cart snapshots are scoped to a user and cannot be changed or checked out offline. |
| OpenAPI API contract | `backend/openapi.yaml` | Validate the document and ensure every exposed API route is represented. |
| Deployment preparation | `client/vercel.json`, `client/public/_redirects`, `README.md` | Configure `VITE_API_URL`, backend CORS origin, Supabase keys, and Maya Sandbox keys for the selected hosting environment. No deployment URL or credentials were supplied. |

## Not claimed as complete

- A real Maya Sandbox payment, signed webhook delivery, duplicate delivery, or production payment was not run because valid credentials and a publicly reachable webhook endpoint are required.
- Remote Supabase migration application and customer/admin RLS checks require access to the project.
- Deployment, Lighthouse scores, and browser validation at 360×800, 390×844, 412×915, and 800×600 remain external checks; a local build alone does not establish them.
