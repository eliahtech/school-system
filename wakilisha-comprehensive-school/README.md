# Wakilisha Comprehensive School Management System

**ELIAHTECH Digital Solutions** · Single-school platform for **PP1, PP2 and Grades 1–9**

> **Status: substantive development build — NOT production certified.** This archive contains actual Express route handlers, PostgreSQL migration files, interactive HTML interfaces, business rules, PDF generation and tests. It is **not** a fully tested production system. Do not enter real children's, guardian or financial data before database integration testing, deployment security review and privacy controls have been checked on your hosting environment.

## Technology

Node.js 22+, Express 4, PostgreSQL, HTML/CSS, locally vendored Bootstrap 5, vanilla JavaScript, server-side sessions, server-rendered HTML. No React/Next.js. An Express server can run on a Node host; a serverless adapter is included for experimentation with Vercel, but live serverless deployment has **not** been verified.

## What you can find in the source

- **Public website:** Home, About, Services, Contact, news, consent-gated gallery, teacher/staff directory and slideshow, public school settings, basic SEO endpoints.
- **Online admission:** Application form, reference + guardian-email tracking, approval, admission number, email outbox, PDF admission letters, configurable reporting requirements, staff checklist and activation of enrollment.
- **People & access:** Student and staff profiles, multi-step registration and editing, class/stream teacher assignments, parent/guardian linkage, student login using first name + admission number + secure password, invitation-based activation, role switching, privileged MFA/TOTP.
- **CBC:** Configurable schemes and school-defined performance levels, teacher-scoped marks and rubric observations, headteacher review/approval, immutable report versions, termly PDFs and 14-page annual PDFs. Practice assignment marks are never included in official CBC reports.
- **LMS:** Assignments, written submissions, private file submissions, teacher feedback, learning materials and school-class access restrictions.
- **Finance:** Termly fee structures and idempotent posting, manual payment recording, signed adjustments, charge allocations, student statements, HTML print receipts, active/inactive debtor summaries, manual reversal journal and Pesapal checkout with provider-side verification.
- **Operations:** Attendance, staff duties, public staff profiles, CSV student import/export, private file storage adapter, email outbox/SMTP worker, Pesapal reconciliation worker, development/sandbox options.

Some areas are still partial; read **`docs/REQUIREMENTS-AUDIT.md`** before relying on any module.

## Quick setup (local development)

1. Install **Node.js 22+**, **PostgreSQL 15+** and npm.
2. Create a PostgreSQL database and an application DB user with migration permissions.
3. Copy `.env.example` to `.env` and configure `DATABASE_URL`, `PUBLIC_BASE_URL`, school contact details and `MFA_ENCRYPTION_KEY` (32-byte random hex value). Never commit `.env`.
4. Run `npm install` to install app dependencies.
5. Run `npm run db:migrate` to apply the ordered, checksum-tracked migrations.
6. Create the first account using environment variables, e.g. `ADMIN_EMAIL=school-admin@example.org ADMIN_PASSWORD='<strong secret>' npm run db:seed`. Configure a real authenticator app on first privileged sign-in; account setup requires a valid `MFA_ENCRYPTION_KEY`.
7. Start with `npm start` and open `http://localhost:3000`. Check `/health` after a database connection is configured.
8. To see the unit tests, run `npm run test:unit` and `npm run test:syntax`; `npm test` additionally requires installed dependencies and working database fixtures.

Local system workflows:

```bash
npm run finance:bill-term -- 2027 1  # eligible students billed once (year/term)
npm run email:send                  # SMTP outbox delivery worker invocation
npm run payments:reconcile          # Pesapal pending / review reconciliation
```

Run email/reconciliation/billing via a scheduler for production where required, not on unprotected public routes. Review scripts before scheduling. **Do not schedule billing until the school's term dates and fee structures are verified.**

## Payments / email / files

- Pesapal: Set `PESAPAL_ENV=sandbox`, merchant consumer key/secret, registered IPN ID and public **HTTPS** `PUBLIC_BASE_URL`. Visit `docs/PESAPAL.md`. **No live Pesapal transaction was possible in this environment.** Do not switch to live until real sandbox tests pass.
- Email: Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`; invoke `npm run email:send` via a worker scheduler.
- Uploads: `STORAGE_DRIVER=local` writes to private `.uploads` (suitable only for persistent local/VPS disks). For serverless hosting select `STORAGE_DRIVER=supabase` with a **private** bucket and server-only service credentials. Storage service integration requires testing with your account.
- PDFs: The project generates a 14-page annual and shorter termly report, plus admission letters, without relying on Chrome. They contain configured/saved data but not every desired rich CBC report section in its final school-specific format.

## Tests actually run for this development artifact

- **38 targeted pure-domain, architecture, file-storage and report-format tests passed.**
- **42 JavaScript files passed syntax checks.**
- Annual sample PDF: 14 A4 pages. Admission sample: 3 A4 pages. Verified with PDF parser and text/page-boundary checks.
- **Full app test suite did not pass here** because npm dependencies are not installed (`ERR_MODULE_NOT_FOUND: bcryptjs`); the npm registry was inaccessible. PostgreSQL/SMTP/Pesapal provider integration, e2e browser, load and penetration tests were **not** run.

Full details: `docs/TEST-RESULTS.md` and `docs/REQUIREMENTS-AUDIT.md`.

## Directory overview

```text
src/server.js                Express entry + public pages and routed modules
src/modules/                 Academic, admissions, LMS, finance, guardian, staff, MFA, CMS
src/payments/                Pesapal provider integration
src/services/                PDF builder and private file adapter
scripts/                     Migrate, seed, bill term, email, payment reconciliation
public/                      CSS, JS, favicon (no sensitive uploads)
database/migrations/         Ordered PostgreSQL schema migrations 001–007
tests/                       Domain, architecture, report, payment and storage tests
docs/                        Integration guide, requirement audit, remaining work
.env.example                 Configuration keys only — NO SECRETS
```

## Next production work

1. Install dependencies in a networked environment, provision a clean PostgreSQL database and run migrations; test enrollment, billing, CBC, admissions and user permission flows end to end.
2. Verify Pesapal sandbox IPN, callbacks, completion, reversals, retries, receipts and reconciliation; independently reconcile school bank settlement.
3. Test private storage/SMTP, staged rollouts, multifactor recovery, secure password reset, deletion/consent workflows, protected file downloads and administrative authorization.
4. Complete school-specific branding/media, rich guardian communication, financial approvals and full report templates, then do browser accessibility, security, performance and backup/restore tests.

**Maintainers should treat tests that were not run as unverified, not as passed.**
