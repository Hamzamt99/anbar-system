# Optimization baseline — 2026-11-23

Branch: optimization. Starting commit: 9b3d188. No source changes before baseline.

- API: 14/14 groups passed (6.14 seconds).
- Browser: existing desktop workflow, mobile 320/390/768, receipt normal/long and print locking passed.
- npm audit (including development dependencies): zero vulnerabilities, 250 dependencies reported.
- Existing controls preserved: authentication, hashed sessions, role authorization and Super Admin ownership, input schemas and parameterized queries, IP/email login throttling, atomic printed locks, historical snapshots, invoice audit, integer thousandths and quantity triggers.
- Confirmed gaps: invoice retry uniqueness, stale-edit rejection, 100k PBKDF2, HTML security headers, optional-OR filter scans, deep OFFSET and repeated counts, unbounded selectors/master lists, quadratic daily recalculation, recovery drill/retention, sanitized monitoring and CI.
- Existing receipt semantics: application print action locks before dialog; native browser printing cannot be prevented for users authorized to view receipts. Keep both unchanged.
- Baseline build: main JS 299.38 kB (94.05 kB gzip), CSS 43.66 kB (8.48 kB gzip), uncropped PNG 398.08 kB. Fonts local.
- Authorization: authenticated roles can read invoices/quantities/active masters and create invoices. Admin/Super can write masters, filter, edit (Admin only unprinted), print. Only Super can manage users/read audit. Super accounts owner-edit only, no app deletion/demotion. No invoice-delete/cancel route exists. No per-owner invoice restriction in this shared-factory model.

Order: integrity → password/header/log hardening → measured SQL/pagination/selectors → recovery/CI → synthetic performance and regressions → backup/rollback → deploy optimization only. Latest user explicitly authorizes deployment; do not merge main. Physical printer acceptance checks remain operator tasks.
