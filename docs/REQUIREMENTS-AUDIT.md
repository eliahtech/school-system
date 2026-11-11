# Requirements coverage and remaining gaps

This table intentionally separates **implemented source code** from **operationally verified** functionality. Because PostgreSQL, npm dependencies, SMTP and Pesapal credentials were unavailable, no database-backed or hosted workflow is production certified.

| Agreed requirement | Source-code implementation | Remaining verification / gap |
|---|---|---|
| Single school, PP1–G9 | Config, grade enumerations, database | School operational setup and content |
| Responsive public Home/About/Services/Contact | Rendered routes and responsive CSS | Actual school photographs, content, browser testing |
| Hero slideshow | CMS slide content + client rotation | Live media upload, image performance, accessibility review |
| Public news | Publishable news routes/CMS, search | Rich-text editor, scheduling and moderation workflow |
| Public gallery by year/category | Gallery filtering, publication permission check | Genuine photo consent capture and media takedown linked per photo |
| Teachers, departments and duties | Public staff directory and assignments | Staff photographs and complete approved profiles |
| Super Admin public website controls | Public settings and core content permissions | Comprehensive drag/drop page-builder not present |
| Admin/delegated news and gallery | Admin/headteacher CMS routes | Fine-grained permission assignments beyond roles incomplete |
| Public online admission | Application, guardian-email tracking | Applicant anti-bot, richer documents upload, browser integration |
| Approval, admission number, email | Transactional approval + email outbox | SMTP sender deliverability, rejection/waitlist workflow, live race testing |
| Reporting-day requirement checklist | Grade/year checklist, verified arrival, enrollment | Full supporting document workflows, staff training |
| Admission letter PDF | PDF builder and secure download route | Official school letterhead, signed attachments |
| Students multi-step registration/edit | Forms, linked guardians, enrollment history | Profile image upload, comprehensive record lifecycle |
| Teachers multi-step registration/edit | Staff forms, TSC/qualifications, secure invite | More flexible staff role and document management |
| Student first-name + admission login | Name+admission+secret and hashed credentials | Student recovery/guardian-assisted onboarding end-to-end |
| Parent/student/teacher portals | Role-scoped profiles, assignments, attendance and reports | More polished full dashboard UX, notifications |
| Admin/headteacher/bursar/super-admin | Role-based dashboards, MFA and secure sessions | MFA recovery and detailed per-action permission matrix |
| Teacher assignments and scoped data | Queries and class/stream/subject checks | Real integration authorization/security penetration tests |
| CBC numerical and rubric assessment | Configurable schemes, per-term entry, observations | School-specific criteria/rubric library and regulatory validation |
| School-defined EE/ME/AE/BE | Threshold/remark code | Official school-approved scales and moderation |
| Official termly and 14-page annual PDFs | PDF generator, approval/version snapshot | Production formatting and complete school-customized report sections |
| LMS practice, marking and feedback | Assignments, submissions, feedback, uploaded files | Guardian-assisted early-years workflow, document preview |
| No LMS marks in official CBC | Separate DB model/calculations, domain tests | Database integration regression tests |
| Attendance | Class-scoped entry and history | Date policy, schedule-based attendance, correction workflow |
| Termly fee structures and posting | Grade/year structures and idempotent insert; CLI scheduler | Real database race test, enrollment effective dates and fee policy |
| Active/inactive student debt | Aggregate overview by status | Debt aging and institutional finance reporting completeness |
| Past debt after graduation/transfer | Status-based future charge stops, retained payments | Full clearance, refunds, write-offs approval flows |
| Manual payments & printable receipts | Payment ledger, printable HTML receipts, reversal journal | Receipts as standalone PDFs and dual-control accounting |
| Pesapal | API 3.0 token/checkout/status/IPN, reconciliation | Sandbox tests with merchant credentials, refunds and settlement reconciliation |
| Emails and notices | SMTP outbox worker, queued admissions/receipt messages | Live SMTP test, template design, retries under production worker |
| Private files | Local/Supabase adapter, auth-scoped upload/download | Cloud storage security test, antivirus scan, retention policies |
| Student CSV bulk import | CSV parser and transaction, formula-safe export | Real large-file CSV integration, duplicate-user reports |
| SEO, robots, sitemap | Public pages/meta/robots and route sitemap | News URLs in sitemap, full school-specific structured data |
| Vercel portability | Express adapter and vercel.json | Cold starts, public serverless deployment, storage and jobs need testing |
| Real-world quality assurance | 38 targeted tests, JS syntax, sample PDF reading | Full npm integration, PostgreSQL, e2e, accessibility/security/load tests |

## Major caution

Features labelled "implemented" are implemented in the source, not independently proven to work on a deployed site. The existing `server.js` and `extended.js` contain some legacy/monolithic routes that deserve refactoring before a large production rollout. School legal obligations, consent, fee policies and CBC thresholds must be reviewed by the school leadership.
