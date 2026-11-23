# Maya Checkout integration

Maya Checkout is the hosted payment provider for this application. Checkout creation and payment reconciliation run on the backend; the browser only receives Maya's hosted checkout URL. No card data or API keys pass through the client.

## Configure Sandbox

1. Set `MAYA_ENVIRONMENT=sandbox` in `backend/.env`.
2. Set `MAYA_PUBLIC_KEY` and `MAYA_SECRET_KEY` to the Sandbox keys for your Maya Checkout merchant. Keep both keys backend-only.
3. Start the API and expose it through a public HTTPS URL for webhook delivery.
4. Register `https://<your-api-host>/api/v1/webhooks/maya` in Maya Manager for `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, and `PAYMENT_CANCELLED`.
5. Configure `PUBLIC_API_URL` and `CLIENT_ORIGIN` for the deployment. Checkout return URLs are informational; the app confirms payment only from verified Maya payment data.

Maya's current Sandbox and Production webhook public keys are built into the provider. The optional `MAYA_WEBHOOK_PUBLIC_KEY_1` and `MAYA_WEBHOOK_PUBLIC_KEY_2` settings override them during Maya key rotation.

## Transaction flow

1. The backend asks a service-role-only Supabase RPC to recompute pricing, claim a coupon, reserve inventory, and create the pending order atomically.
2. It calls Maya `POST /checkout/v1/checkouts` with the public API key, the server-calculated total, order reference, item details, and return URLs.
3. The customer is redirected to Maya's hosted `redirectUrl`.
4. Maya sends a signed webhook to `/api/v1/webhooks/maya`. The handler checks `X-Maya-Webhook-Signature` (RSA-SHA256 using Maya's published keys) and the five-minute `X-Maya-Webhook-Timestamp` window before processing.
5. The backend uses the signed payment payload to compare payment status, peso amount (converted to centavos), currency, and order reference before changing the order. Replayed events are idempotently acknowledged; failed, expired, or cancelled attempts release reservations.
6. If a webhook was missed, `POST /api/v1/orders/{id}/verify-payment` retrieves Maya's payment using the secret API key and reconciles the result.

Maya's API uses `https://pg-sandbox.paymaya.com` in Sandbox and `https://pg.maya.ph` in Production. Production requests can incur real charges; change `MAYA_ENVIRONMENT` only when production credentials, a production webhook, and the required merchant onboarding are ready.

Official references:

- [Maya Checkout Create Checkout](https://developers.maya.ph/reference/createv1checkout)
- [Maya Checkout one-time payment flow](https://developers.maya.ph/reference/accept-one-time-payment-using-maya-checkout)
- [Maya webhook configuration](https://developers.maya.ph/reference/configuring-your-webhook-for-maya-checkout)
- [Maya webhook signature verification](https://developers.maya.ph/reference/webhook-security)
- [Maya Sandbox and Production API environments](https://developers.maya.ph/reference/api-environments)

No live credentials or real payment data are included. Before a production launch, run Sandbox success, decline, cancel, expiry, bad-signature, webhook-replay, and missed-webhook reconciliation scenarios.
