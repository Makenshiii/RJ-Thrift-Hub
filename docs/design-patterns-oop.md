# Design patterns and OOP

## Layered API boundary

- **Motivation:** Keep external-provider work and response formatting on the server while Supabase owns application data and authentication.
- **Files:** `src/routes/api.js`, `src/controllers/`, `src/services/`, `src/lib/supabase.js`.
- **Request flow:** Checkout route → checkout controller → reservation/payment services → Supabase RPC and Maya adapter.
- **Trade-off:** The browser can use Supabase directly under RLS; payment secrets and privileged database access remain server-side.

## Database transaction boundary

- **Motivation:** Keep stock, order, coupon, and payment invariants atomic despite concurrent requests.
- **Implementation:** Postgres RPCs in `supabase/migrations/202611230001_initial_schema.sql`.
- **Flow:** A checkout RPC serializes the idempotency key, locks the cart/product/coupon records, reserves inventory, snapshots the order, claims the coupon, and clears the cart in one transaction.
- **Trade-off:** Business rules live close to the data and survive multiple application instances; SQL RPCs need focused integration tests against the configured Supabase project.

## Supabase client singleton

- **Motivation:** Reuse one client instance for the browser session and one backend service-role client.
- **Files:** `client/src/api.js`, `backend/src/lib/supabase.js`.
- **Security boundary:** The browser client uses only the publishable key. The backend service-role key is read from the backend environment and is never bundled into Vite.

## Factory with polymorphic payment providers

- **Motivation:** Checkout should not depend on which payment implementation is configured.
- **Files/classes:** `PaymentProvider`, `MayaCheckoutProvider`, `UnavailablePaymentProvider`, `paymentProviderFactory.js`.
- **Flow:** Factory selects a provider at startup; checkout uses the common `createCheckout` contract; webhook and reconciliation use common verification operations.
- **Trade-off:** Provider substitution and local missing-configuration behavior are clear; every provider must implement the same contract.

## Façade

`MayaCheckoutProvider` hides gateway HTTP, authentication headers, timeouts, signature details, and error mapping. Business services call its methods without depending on vendor-specific request formats.
