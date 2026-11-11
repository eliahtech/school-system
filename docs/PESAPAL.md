# Pesapal API 3.0 integration (Wakilisha Comprehensive School)

1. Apply for and activate the school's own Pesapal merchant account.
2. Set `PESAPAL_ENV=sandbox`, `PESAPAL_CONSUMER_KEY` and `PESAPAL_CONSUMER_SECRET` in a private environment configuration.
3. Deploy the application at a publicly reachable HTTPS `PUBLIC_BASE_URL`.
4. Register `https://YOUR_DOMAIN/payments/pesapal/ipn` as an IPN URL using Pesapal API 3.0 `URLSetup/RegisterIPN` with `ipn_notification_type=POST` and save the returned `ipn_id` as `PESAPAL_IPN_ID`.
5. Run database migrations, including `003_pesapal.sql`, before enabling checkout.
6. Parents may pay only for learners linked to their verified guardian account. Admin/bursar may select learners from their management account.
7. A payment starts in `pesapal_orders` as a pending checkout intent. Pesapal redirects the payer to its hosted checkout. On callback or IPN the server queries `GetTransactionStatus` using a merchant bearer token; it does **not** trust the callback's status. It credits the payment ledger only if status, reference, currency, amount and confirmation match. A database row lock and unique payment reference protect against duplicate posting.
8. Confirm successful, pending, failed and repeated-IPN flows with Pesapal's sandbox, including an actual test payment, before switching to `PESAPAL_ENV=live`.
9. Reconcile stuck `pending` and `review` orders with the provider before reattempting a payment. A future production reconciliation job is still needed; refund/reversal handling must be completed before live operations.

**Limitations:** This integration has automated unit tests but has not been tested against a real Pesapal account or PostgreSQL instance in this environment. Provider status verification, not browser redirects, is authoritative. Do not enter real secrets in a chat or commit them to Git.

Documentation: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/api-reference
