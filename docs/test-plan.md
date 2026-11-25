# Test plan and results

## Local checks

| Test | Result |
|---|---|
| Backend HTTP/provider suite (`npm test`) | 30 passed |
| Production frontend/PWA build (`npm run build`) | Passed |
| Browser route smoke check | Product detail opens/closes at its URL; unauthenticated cart redirects to login; payment return stays informational; unknown path shows 404; legacy `/#bag` remains supported. |
| Viewport overflow smoke check | No horizontal overflow observed at 360×800, 390×844, 412×915, or 800×600. |

Run local checks from the repository root:

```powershell
npm test
npm run build
```

The browser check used the local Vite app. At that time, the running Express process reported that `SUPABASE_PUBLISHABLE_KEY` was missing. The existing public key has since been moved to the private backend `.env` and removed from the client `.env`; restart Express and repeat the live catalog/authenticated flow checks. Cart/order/admin flows were not browser-verified in this run.

## Required external checks

After configuring backend Supabase values and applying migrations 001–008:

1. Register/login with a customer and verify user-scoped catalog/cart/order access and RLS.
2. Verify non-admin requests are rejected and an admin can edit products, size stock, prices, coupons, and order status.
3. Exercise cart add, remove, quantity changes, server-calculated coupon quotes, checkout idempotency, and stock reservation/release.
4. With authorized Maya Sandbox keys and a public HTTPS webhook URL, test success, decline, cancel, expiry, bad signature, duplicate webhook delivery, and missed-webhook reconciliation.
5. Confirm orders become paid only from verified Maya payment data and the cart clears only after payment finalization.
6. Test offline cache/action gating, installability, safe-area behavior, keyboard/screen-reader flows, chosen host rewrites, and Lighthouse on the deployment URL.

These remote Supabase, Maya, deployment, assistive-technology, and Lighthouse checks have not been run from this workspace.
