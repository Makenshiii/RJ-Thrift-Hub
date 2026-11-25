# Thrift business rules

| Rule | Enforcement | Result |
|---|---|---|
| Every thrift listing is unique; quantity and stock never exceed one. | Postgres constraints, cart RPC, admin inventory RPC, atomic checkout RPC | Unavailable items cannot be reserved |
| Only active products with stock are purchasable; deactivation preserves past order snapshots. | RLS-protected product queries and checkout RPC | Hidden products are unavailable to customers |
| Cart and checkout prices come only from current database product records. | `quote_cart` and `create_order_and_reserve` RPCs | Client-supplied prices and totals are not accepted |
| Coupons must be active, unexpired, within global/per-customer limits, and meet minimum spend. Percentage discounts round to a whole PHP peso; fixed discounts cannot exceed subtotal. | `quote_cart` and atomic coupon claim during checkout | Coupon errors are returned from the database |
| Shipping is PHP 100 below PHP 1,500 after discount; otherwise free. | Database quote and checkout functions | Totals are recomputed at checkout |
| Checkout is idempotent per customer/key and reserves stock for 30 minutes. | Advisory lock, unique order key, and transactional Postgres RPC | Repeated keys return the existing order |
| Provider failure, cancellation, or reservation expiry releases inventory and the coupon claim. | Service-role-only reservation RPC and expiry worker | Order becomes cancelled or expired |
| Only verified gateway payment can move an order to paid. Redirect is not proof; webhook processing is idempotent. | Maya adapter, RSA-signed webhook, unique payment event, payment RPC | Amount/currency mismatches are marked `payment_mismatch` |
| Customers can cancel only their own pending-payment orders. | `cancel_order` RPC checks `auth.uid()` ownership and status | Other users' orders are inaccessible |
| Fulfillment transitions are sequential: paid → processing → shipped → delivered. | Admin-only status RPC | Illegal transitions are rejected |

The AI assistant only ranks in-stock products fetched from the catalog. Displayed product details come from Supabase, not generated model text.
