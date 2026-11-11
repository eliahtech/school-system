# Quality verification record — 31 October 2026

Executed locally with Node.js 22, with no installed npm dependencies, live PostgreSQL database, SMTP credentials or Pesapal account.

## Passed

- `npm run test:unit` — **38/38 passed**. The passing tests include:
  - Student status billing rule and money arithmetic.
  - PP1–Grade 9 grade support.
  - CBC configurable numerical marks and school-defined level bands.
  - Official report dataset excludes LMS practice marks.
  - A4 annual 14-page PDF generation with structural xref checks.
  - Pesapal transaction validation of amount, currency, reference and status.
  - App route/permission architecture checks.
  - TOTP reference test and AES-256-GCM secret encryption.
  - CSV escaping/parsing and spreadsheet formula safety.
  - Private file signature/type/size validation and local write/read test.
- `npm run test:syntax` — **42 files passed**.
- Sample report PDF: **14 pages**, valid PDF parsed by `pdfinfo` and `PyMuPDF`, no text outside page bounds.
- Sample admission letter PDF: **3 pages**, valid PDF parsed by `pdfinfo` and `PyMuPDF`.
- ZIP archive integrity: checked at packaging time.

## Not passed / unavailable

- `npm test` — did **not** complete. It runs the unit and syntax tests then attempts dependency-backed `tests/core.test.js`; Node reports `ERR_MODULE_NOT_FOUND: Cannot find package 'bcryptjs'` because dependencies are not installed.
- `npm install` — failed to access registry.npmjs.org (`EAI_AGAIN` DNS / network restriction); cannot provide an honest installed-dependency test result.
- Database migrations — **not executed against PostgreSQL**. SQL schema consistency is inspected but not database-confirmed.
- End-to-end login, admissions and term billing — **not tested against PostgreSQL**.
- SMTP outbox — **not tested with a live SMTP provider**.
- Pesapal — **not tested with merchant credentials**, sandbox/live checkout or real IPN.
- Browser e2e, mobile layout audit, network concurrency, accessibility and security penetration tests — **not executed**.

## Reproduction steps in a networked environment

```bash
cp .env.example .env
# Edit .env with a fresh DEVELOPMENT PostgreSQL database and fake/test school identities.
npm install
npm run db:migrate
npm run db:seed
npm test
npm start
# Visit /health, register test student, assign test teacher, issue fake charges,
# activate test user, submit assignment, approve CBC report.
```

Then run a separate Pesapal sandbox verification: successful payment, unconfirmed payment, duplicate callback, replayed IPN, failed payment, reversed payment and settlement reconciliation. Results not captured in this record must not be represented as passed.
