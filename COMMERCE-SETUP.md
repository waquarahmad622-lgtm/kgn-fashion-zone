# KGN catalogue and orders v34

Implemented: up to four product images with cover selection/removal and customer gallery; original and selling price for each size; computed discounts; guest order requests; private tracking; owner confirmation and packing/dispatch/delivery stages; hosted Razorpay payment links with server-side verification; optional COD; order retention.

## Deployment order

1. Inspect the existing `products`, `admin_users`, inventory RLS and `kgn_stock_action(uuid,text,integer,text)` definitions in the Supabase project `vmvyubzpuncasirgjptn`. Tests use a representative local schema and do not establish that the production schema has the same types or policies. `size_options` must be `text[]`, `pack_options` integer arrays, `size_rates` JSONB, inventory quantities pieces. Check that owner/staff-only catalogue update policies are already enforced.
2. Apply the SQL migrations in filename order, including the release performance migration. They are additive; they keep existing covers and size selling prices. The order tables are private, and ordering/payment methods default to disabled. **Do not change public customer-data RLS to make setup work.**
3. Publish the frontend files from this branch together. `inventory.html` redirects to the unified admin panel to prevent old editors from overriding the new gallery. The service worker v34 updates assets; admin responses and Supabase calls are never cached.
4. Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` using Supabase's private Edge Function secrets. Never put them in `cloud-config.js`, git or chat. Set `KGN_SITE_ORIGIN` to the actual web origin. Deploy both Edge Functions with the supplied config. `kgn-payment` verifies the admin session and allowlist inside the handler. The webhook verifies HMAC over the raw body.
5. Configure the merchant webhook for `payment_link.paid` at the deployed `kgn-payment-webhook` URL. Start with the merchant test environment. Verify failed, successful, delayed and duplicate events; then configure live merchant keys. Provider confirmation is the only route to online `paid`. Opening a payment page alone never marks an order paid. No automated SMS/email is sent by this integration.
6. Obtain explicit owner approval before scheduling permanent deletion of delivered/cancelled order records older than one year. Then, in Supabase Cron, schedule `select public.kgn_purge_closed_orders()` daily (e.g. `15 3 * * *` UTC), and verify a successful scheduled run before enabling order requests. Review the order privacy notice and courier/payment arrangements. Statutory invoice/record obligations need separate business handling.
7. Owner opens Admin → Orders → Order settings. Enable supported methods only: online after live setup, or COD only if the delivery arrangement supports collection. Keep order requests off until a complete test order and the policy review are complete.

## Operations

- Admin → Orders → `Razorpay setup जाँचें` runs an authenticated, read-only API connection check. It reports Test/Live mode and whether the webhook secret is present; it does not verify webhook delivery or complete a payment. The check returns no keys or payment/customer records and does not create orders, change settings, or charge money. Run a full merchant test before enabling customer payments.
- A request is not a confirmed sale. Server prices are captured from current size rates. The store confirms stock and the final shipping charge; final shipping is locked afterwards.
- Confirmation reserves quantities against other confirmed/packed app orders. Stock must have an opening count. These requests accept products priced per piece; set/dozen products continue using WhatsApp until explicitly supported.
- Shipped requires courier and AWB, verified online payment (or COD), and calls the existing inventory Sale/Dispatch RPC in the same transaction. **Do not also record a manual Sale for the same app order.** Other manual inventory edits can reduce available stock; dispatch will fail if stock is insufficient.
- Status must move one stage at a time. Courier status displayed in the app is updated by staff. The courier HTTPS tracking link provides the carrier's latest status. No automatic courier API is connected yet.
- COD remains labelled payment due on delivery. It does not pretend collection was verified. Reconciliation, refunds, returns and cancellations after a payment link exists require the merchant/store workflow; this release does not automate those financial operations.
- Payment link creation locks the order against duplicate creation. A timeout or uncertain result is held for manual gateway reconciliation; never reset it blindly or create another link without checking the gateway.
- Customer tracking requires the order UUID and a random 256-bit private key. The server stores only its hash and does not expose buyer contact/address in tracking responses. The browser retains up to 20 tracking records. Lost keys require store-assisted identity verification; public phone-only lookup is intentionally absent.
- Anonymous order requests have a per-phone rate limit of five/hour. Add a gateway/WAF challenge and broader request rate controls if abuse occurs; do not expose service-role credentials to callers.

## Verification

Run `npm ci && npm test`. Tests cover gallery controls and limits, upload rollback, saved-product refresh failure, size discounts, private order permissions, server totals, invalid size/quantity, idempotency, payment mismatches/HMAC, dispatch stock changes and retention. Database tests use PGlite with representative existing tables and a stock-function fixture.

Production verification on 2026-10-03: inspected the real schema, owner RLS and stock RPC; applied the catalogue, order, payment, retention-function and performance migrations; deployed both payment functions. A rolled-back database transaction verified photo/discount constraints, server totals, private tracking, payment matching and real inventory dispatch. All four existing products and covers remain intact, with no test orders retained. Ordering, online payments and COD remain disabled. No merchant credentials or automatic courier integration are configured. Automatic retention scheduling was blocked by approval review and has not been applied; explicit owner approval is required. Real device and merchant end-to-end tests remain outstanding.

The security advisor flags deliberately privileged guest order/tracking RPCs and admin RPCs. Guest tracking requires a 256-bit key and returns no buyer contact/address; management checks the admin allowlist. Existing unrelated advisories include anonymous grants on legacy `kgn_custom_stock_action`/`rls_auto_enable` and disabled leaked-password protection; these existing settings were not changed during this release. See [function access guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).


## Direct customer checkout (2026-10-06)

The owner selected **delivery charges paid separately to the courier**. New online checkouts collect only the item subtotal; the checkout, gateway description, tracking view and admin view disclose the separate freight. Existing orders keep their original shipping charges. No customer notifications are sent automatically.

- Deploy `20261006072847_direct_customer_checkout.sql`, which leaves `direct_checkout_enabled=false`. Deploy `kgn-checkout` with its supplied config, then publish the v36 frontend. Enable the feature only after verification by updating the singleton setting. The existing online/orders switches still gate purchases.
- The customer reviews the item amount, address and separate-courier-charge notice, accepts the notice and selects Pay. The server validates catalogue prices, bundle rules, published status and counted/unreserved stock, and creates a confirmed/unpaid order atomically. There is no manual owner confirmation for these purchases. A changed price aborts before order creation.
- `kgn-checkout` is a guest entry point, not an admin session endpoint. Its service-only SQL helpers enforce inputs, the existing per-phone rate limit, idempotency and stock locks. Access to any existing checkout also requires its random 256-bit key. No service key, gateway credential or private tracking key is sent to Razorpay. Public order-table RLS remains closed.
- A saved fingerprint hash and private retry token survive reloads; no buyer contact details are stored in this retry record. The same checkout reuses the same order and link. A provider timeout leaves the claim uncertain and requires gateway reconciliation; it never blindly issues another link.
- Links expire after 30 minutes. Before a later checkout, at most five old direct reservations are reconciled concurrently. An issued link's stock is released only after a gateway GET confirms the matching reference/amount, a final expired/cancelled state, no captured payments, and a five-minute grace period. An unpublished link in `none` state can be released after the same grace period. `creating` and `uncertain` states remain held for store reconciliation. No cron, permanent deletion or mass cleanup of old test orders is introduced.
- Payment success still comes only from the existing signed `payment_link.paid` webhook. Callback query parameters never mark a payment paid. A return URL opens private tracking using the key already saved in that browser. Packing and dispatch still require verified payment.
- Rollback: disable `direct_checkout_enabled` to restore the prior request UI for new sessions, without altering existing payments or orders. Keep the additive schema and payment webhook in place.

Tests include legacy order behavior and direct-checkout authorization, price mismatch rollback, reservations, retries, expiry reconciliation, translated freight disclosure, return/tracking behavior and malicious payment URL rejection.


## Optional mobile verification and delivery contact (v38)

Implementation is in `checkout-phone.js` and migration `20261006093600_checkout_phone_verification.sql`. The additive migration leaves `phone_verification_required=false`. No historical order is marked phone-verified. Checkout and order settings continue working while the SMS provider is unavailable.

1. Apply the migration, deploy the updated `kgn-checkout` (custom authentication, existing `verify_jwt=false`), and publish the v38 checkout assets together. Keep `phone_verification_required=false`, as requested by the owner on 2026-10-06. Configuring the SMS provider does not make verification mandatory.
2. In Supabase Authentication → Sign In / Providers → Phone, configure an owner-approved SMS provider and enable Phone. Enter credentials only in its private dashboard. Check the provider's sending permissions, SMS budget, sender/template requirements and delivery to Indian numbers. Keep phone autoconfirm disabled and remove fixed test OTPs for production. Set six-digit codes and review Auth SMS send/verify limits; the UI also has a 60-second resend delay. CAPTCHA requires a matching frontend integration before enabling that Auth setting.
3. For domain-bound SMS autofill, use a custom SMS template whose final line is the actual checkout hostname and code. With a provider that supports this template, the example is:

   ```text
   Your K.G.N. Fashion Zone verification code is {{ .Code }}.
   Do not share this code.

   @waquarahmad622-lgtm.github.io #{{ .Code }}
   ```

   Confirm the delivered message preserves this exact final-line structure. A provider-managed OTP template may require provider-side customization. WebOTP is progressive enhancement: Android browser support and consent are required; iOS may offer a keyboard code suggestion via `autocomplete="one-time-code"`. Manual entry always remains available. Autofill never clicks Verify or Pay.
4. Use a staging project for an actual send/verify test before production activation. Verify correct, incorrect, expired and resent codes, changing the number, denied autofill consent, and returning from the payment app. A real SMS/provider test has not been run by the automated test suite.
5. After publishing and validating the SMS service, keep `phone_verification_required=false`. The checkout checks the public Auth settings and offers SMS verification when Phone is enabled. Until then, it explains that OTP is unavailable and customers can continue. Requests are only sent when a customer chooses Send OTP. Failed, partially entered, skipped or expired optional OTPs do not prevent unverified checkout. Only a successfully verified phone carries proof into direct checkout. Required mode is retained for compatibility and must not be enabled without a new owner instruction. Do not bypass it with autoconfirm, a universal OTP or a fake verified timestamp.

The OTP Supabase client uses separate, in-memory Auth storage and never overwrites the admin login. For optional verification, direct checkout accepts either an unverified mobile or a verified phone session. Verification is never claimed without proof. The Edge Function fetches the current user with `getUser` and checks the exact phone and its confirmation. Its service-only database helper rechecks the Auth identity and stores proof with the order. The old direct signature fails closed when verification is required; legacy/COD RPCs require a signed matching phone identity too. Caller-provided `phone_verified` fields are ignored. Existing orders resume with their original private tracking keys. Payment is still marked paid only by the signed Razorpay webhook.

Customers review their address with the mobile number before payment. Authorized staff see a `tel:` link and a copy-delivery-details button. Only genuinely verified orders carry the OTP badge. Contact details and Auth identifiers remain absent from public tracking responses. Copying a delivery label does not send it to anyone automatically.

Provider reference: https://supabase.com/docs/guides/auth/phone-login
Autofill reference: https://developer.chrome.com/docs/identity/web-apis/web-otp
