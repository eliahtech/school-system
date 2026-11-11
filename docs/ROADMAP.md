# Remaining work before Wakilisha can go live

This archive has more than a starter shell: see `README.md` and `REQUIREMENTS-AUDIT.md`. However, the following work is **not completed or production validated**:

1. Run `npm install`, clean PostgreSQL migration, and full cross-module integration suite in a real development environment. Fix any SQL/runtime failures. Re-run after every migration change.
2. Test authorization with each role and a second unrelated family/class; school minors' records must remain private.
3. Verify Pesapal API 3.0 sandbox checkout and provider-signed outcomes; reconcile reversals and actual bank settlement, implement institution-approved refunds and dual approvals.
4. Implement secure guardian-assisted password recovery, MFA recovery, and live account activation using SMTP.
5. Complete academic rubric definitions, moderation/correction workflow, configurable 12–15-page final report layout and approval tests.
6. Add full fee debt aging, financial clearance PDFs and safe transfer/graduation policy workflow including current-term adjustments.
7. Expand CMS with per-user delegated permissions, consent-takedown by photo, image upload/optimization, and dynamic SEO structured data.
8. Implement reliable automatic billing scheduler, admission-email dispatch worker, and alerts as separate deployable background processes.
9. Browser E2E, mobile accessibility and performance testing, security audit, backups and restoration exercises.
10. Confirm Vercel or Node VPS deployment with real private storage, secure environment variables, HTTPS and monitoring.

**Never label the release complete simply because a syntax or pure-domain test passes.**
