# Deployment notes

## Always-on Node hosting (VPS, Render or similar)

- Set `NODE_ENV=production`, `DATABASE_URL` with TLS, `PUBLIC_BASE_URL=https://...` and all school contact variables.
- Use an unprivileged PostgreSQL app account, a migration administrator account for schema upgrades and managed backups.
- Set a 32-byte random hex `MFA_ENCRYPTION_KEY`; never rotate without a key migration procedure, or existing MFA secrets become unreadable.
- Apply migrations once per release using `npm run db:migrate` before routing user traffic to new code.
- Configure HTTPS reverse proxy, request limits, HTTP security headers, logs and monitoring.
- Configure SMTP and run `npm run email:send` from a scheduled/worker process.
- Run `npm run payments:reconcile` periodically against Pesapal sandbox and then live after approved testing.
- Run `npm run finance:bill-term -- YYYY N` only according to school-approved schedule and after checking structure details; the script is idempotent but billing policies must be validated.
- For local private uploads, mount a permanent writable disk and include it in verified, access-controlled backups. For distributed/serverless hosts, use a private supported object-store integration.

## Vercel / serverless

The repository includes `api/index.js` and `vercel.json` to adapt Express to a serverless entrypoint, but live deployment is not verified. Background workers and cron tasks must run separately. Local `.uploads` **does not persist** on Vercel. Set `STORAGE_DRIVER=supabase` with a private bucket (not public), restrict the service-role key to backend variables only and verify retrieval/authorization in a real test project.

## Before accepting real learners or payments

- Verify migrations in a clean database, and also from an older migrated database.
- Create separate test accounts for all roles; verify no role can view someone else's private records.
- Verify school-approved student photo publication consents and that removal takes effect.
- Confirm SMTP and Pesapal HTTPS IPN registration, test confirmed and reversed transactions.
- Test recovery of database and private uploads from backup.
- Complete explicit school-level signoff for fees, admission procedures, approved reports and privacy policy.
