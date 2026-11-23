# Optimization hardening report — 2026-11-23

## Assessment

The release is verified for the agreed small internal-factory workflow, subject to the remaining operator setup below. It is not a security guarantee or a million-record production certification. The approved application/receipt design, roles, quantities, departure offset and print-lock business rules are preserved. The client confirmed actual 220 × 190 mm factory-printer acceptance at 100%, with headers/footers off and long values readable on one unclipped page.

Work is on `optimization` only. `main` remains at `9b3d1885207ccf518473b6ea17edb9878a62e422`. The optimization release is deployed; no merge is authorized or performed.

## Gap validation and implementation

Already present and preserved: hashed sessions and random tokens; authentication and backend role checks; owner-only Super Admin edits and app deletion/demotion protection; strict validation and parameterized SQL; IP/email login throttling; exact integer-thousandth quantities and transactional recalculation; saved master snapshots; invoice audit; database migrations/indexes; Arabic/mobile layout and custom receipt printing.

Confirmed gaps addressed:

1. **Creation idempotency:** frontend keeps a UUID for retries of the same normalized submission and uses a synchronous double-submit guard. A partial unique `(created_by,idempotency_key)` index serializes concurrent requests. The insert and original response snapshot commit in one D1 batch. Identical retries return the original successful result, even after a later edit; a changed payload with the same key gets 409. Distinct keys remain distinct invoices. Keys/fingerprints/internal snapshots are omitted from API responses.
2. **Concurrent edits:** integer versions are required on edits and checked inside the atomic UPDATE alongside print permissions. Stale edits get HTTP 409 and a clear Arabic refresh message. Printing and dependent quantity changes advance versions so stale forms cannot silently overwrite changes. Tests cover competing writes and printed-invoice rules.
3. **Passwords:** new hashes use PBKDF2-SHA256 at 600,000 iterations. Native hosted WebCrypto/node PBKDF2 rejected that cost, despite local success. Noble's maintained implementation avoids the hosted cap and matches native reference vectors. Existing 100k hashes remain accepted and upgrade only after successful login with a conditional update. Failed old-hash logins receive equivalent extra work to reduce an account-existence timing distinction. Session issuance is conditional on the authenticated password hash still matching, preventing a concurrent password change from issuing an obsolete-login session. No passwords/hashes are logged. No forced-change account feature existed; none was invented.
4. **Headers/privacy:** one Worker wrapper covers HTML and API CSP, frame-ancestors, nosniff, Referrer-Policy and Permissions-Policy. HTTPS responses receive HSTS (no preload/includeSubDomains); production HTTP redirects to HTTPS. CSP has no unsafe-inline/eval allowance. Browser/font/logo/receipt tests passed. Production cookies are Secure/HttpOnly/SameSite Strict. Proxy/IP trust is restricted to the hosted boundary; local rate-limit tests ignore spoofed forwarding headers.
5. **SQL:** dynamic predicates replace optional-OR scans; matching indexes support customer/order and combined filters. List projection avoids loading receipt snapshots for table rows. UI next/previous navigation uses cursors; exact counts run on first/filter-reset pages, not every page. Legacy direct page requests are bounded to 100 pages without a cursor. Invoice-number lookup parses the serial into its indexed primary key. Master lists/selectors are bounded, server-searched and debounced, with stale requests aborted; users paginate at 20.
6. **Quantity performance:** insertion computes the inserted row once and adjusts later rows by a delta; changes subtract the old contribution, compute the edited row, and add the new contribution in the same transaction. No-op quantity edits skip recalculation. Quantity reads seek the latest applicable cumulative row. The deterministic reference-model test checks 24 out-of-order inserts and 40 customer/date/load moves against exact recalculated totals.
7. **Caching:** only fingerprinted JS/CSS/fonts/logo assets receive a one-year immutable browser cache. HTML revalidates; every business/auth/session/master/audit/quantity API is no-store. No Redis/KV or master-data response cache was introduced. The selected-name reference in a mounted picker is display state, not a shared response cache.
8. **Recovery/operations:** encrypted export script, 30-day retention, scheduler template, Time Travel instructions, down migrations, compatible Worker rollback builder, restore drill and incident checklist added. See [operations.md](operations.md).
9. **Monitoring:** committed observability settings and fixed-field error/login-rejection logs replace exception dumping. Tests prove synthetic private markers in exceptions/cookies do not enter responses/logs. Alert recipients, thresholds, backup-host installation and client-owned key/storage setup remain explicit operator tasks.
10. **CI:** clean install, ESLint/format check, unit/API tests, frontend/Worker build, high/critical dependency gate, browser tests and local migration/restore validation. No production credentials, production database changes or deployment step. JavaScript project: TypeScript checking is not applicable.

## Performance evidence

Synthetic datasets of 10,000 and 100,000 invoices only, in disposable local Miniflare/workerd D1. Each sampled query/endpoint has 25 observations per phase. The HTTP measurements include Express, authentication, D1 bridging and actual creation safeguards, but not hosted network/Worker CPU behavior. Separate SQL measurements expose D1 rows read/written and EXPLAIN plans. Benchmark write probes are removed from the disposable dataset between phases. Full measurements: [performance.json](evidence/performance.json); reproducer: `npm run test:performance`.

100,000-invoice local HTTP endpoints (milliseconds):

| Endpoint                                                | Before p50 / p95 | After p50 / p95 |
| ------------------------------------------------------- | ---------------: | --------------: |
| List data, repeat count omitted after optimization      |    29.61 / 35.48 |   14.84 / 19.15 |
| Customer/date filter                                    |    35.65 / 43.28 |   16.06 / 23.54 |
| Driver filter                                           |    32.21 / 37.14 |   15.41 / 20.53 |
| Combined filter                                         |    37.99 / 47.54 |    14.86 / 20.2 |
| Invoice detail                                          |    17.29 / 24.16 |   15.25 / 20.35 |
| Customer/day quantity                                   |    16.07 / 23.41 |   14.37 / 20.82 |
| Single-invoice audit                                    |     27.9 / 33.64 |   14.55 / 17.83 |
| Create, including retry safeguard and response snapshot |    61.38 / 76.17 |    66.26 / 82.2 |

Creation adds transactional retry/snapshot work, so a small measured latency increase is expected and is reported rather than hidden. The local measured read and write goals passed; these numbers are not production latency promises. The initial exact count still reads the matching set, and the UI's total is a snapshot until refresh/filter reset. No sensitive count-result cache is shared across users.

100,000-invoice SQL/trigger counters (median):

| Query         | Before rows read | After rows read | Before / after rows written |
| ------------- | ---------------: | --------------: | --------------------------: |
| invoice_list  |           100020 |              21 |                       0 / 0 |
| customer_date |           140200 |              21 |                       0 / 0 |
| driver        |           100400 |              21 |                       0 / 0 |
| combined      |           144000 |              21 |                       0 / 0 |
| date_range    |           154020 |              21 |                       0 / 0 |
| deep_page     |            90020 |            1021 |                       0 / 0 |
| detail        |                1 |               1 |                       0 / 0 |
| number_lookup |                1 |               1 |                       0 / 0 |
| quantity      |              101 |               1 |                       0 / 0 |
| audit         |           100000 |               2 |                       0 / 0 |
| create        |            13241 |             250 |                    123 / 14 |

Rows-read comparison includes the old repeated count in list/filter requests; optimized repeat-page measurements omit it by design. The exact initial count is separately measured in the evidence. SQLite's `SCAN ... USING INDEX` for an unfiltered LIMIT query is an ordered bounded walk, not proof of a full history traversal; observed reads are bounded. Deep date/id cursor seeks can still inspect records sharing the cursor date. Audit email contains-search and master contains-search may scan their selected candidate sets; substring semantics were preserved rather than replaced with a different business search behavior. Large daily-group edits still touch affected later rows. No 1,000,000-record or hosted load test was claimed.

## Indexes and plans

Added only:

- `invoice_submission(created_by,idempotency_key) WHERE idempotency_key IS NOT NULL`: retry lookup/uniqueness.
- `invoice_customer_order(customer_id,date DESC,id DESC)`: customer/date listing, avoiding the old creation-time tie order.
- `invoice_customer_driver_order(customer_id,driver_id,date DESC,id DESC)`: combined filter; a fixed source-controlled index hint selects its intended ordering.
- `sessions_user(user_id)`: session revocation.
- `login_attempts_reset(reset_at)`: expired throttle cleanup.
- `audit_action_order(action,id DESC)`: action-filtered audit ordering.

No existing index was removed. A proposed driver/date/id index was rejected as redundant: the existing driver/date index already orders ties through implicit rowid. Additional indexes and original retry-response snapshots have storage/write costs; monitor D1 usage.

Representative before/after plans (full plans in evidence; hosted staging also verified retry/session/throttle/action lookup plans in [supporting-plans.json](evidence/supporting-plans.json)):

- `customer_date`: before `SCAN invoices USING INDEX invoice_date`; after `SEARCH invoices USING INDEX invoice_customer_order (customer_id=? AND date>? AND date<?)`.
- `driver`: before `SCAN invoices USING INDEX invoice_date`; after `SEARCH invoices USING INDEX invoice_driver (driver_id=?)`.
- `combined`: before `SCAN invoices USING INDEX invoice_date`; after `SEARCH invoices USING INDEX invoice_customer_driver_order (customer_id=? AND driver_id=? AND date>? AND date<?)`.
- `quantity`: before `SEARCH invoices USING INDEX invoice_group (customer_id=? AND date=?)`; after `SEARCH invoices USING INDEX invoice_group (customer_id=? AND date=?)`.
- `audit`: before `SCAN audit_logs`; after `SEARCH audit_logs USING INDEX audit_invoice (invoice_id=?)`.
- `detail`: before `SEARCH invoices USING INTEGER PRIMARY KEY (rowid=?)`; after `SEARCH invoices USING INTEGER PRIMARY KEY (rowid=?)`.

## Password and cache benchmarks

Local Inspector sampling measured approximately 1.38s active CPU per synthetic probe round including native 100k + native 600k + Noble 600k. Noble alone took 1.23–1.34s local elapsed time over five rounds. Hosted native 600k rejected the request; Noble 600k passed five hosted Paid invocations under the 3s configured CPU ceiling. Hosted probe end-to-end times were approximately 1.89–2.43s including network and the other probe work. Hosted clocks freeze during CPU work, so their zero `elapsed_ms` readings are not presented as CPU results. Hosted staging then verified actual old/new logins and gradual rehash. [Crypto evidence](evidence/crypto.json).

Static asset test: about 95KB transferred on network loads, zero transfer bytes on the subsequent immutable-cache load. Full cache durations/bytes are in [static-cache.json](evidence/static-cache.json). No authenticated content is cached.

## Verification results

- Clean `npm ci`: passed.
- ESLint plus Prettier check: passed.
- API: **25 test groups passed, zero failed**. Includes six-request idempotency race, original-response replay, conflicting edits, legacy rehash, native hash reference vectors, negative route matrix, cookie/CSRF/session regressions, sanitized error logs and reference-model quantities.
- Browser: **one full workflow runner passed**, including immediate duplicate submit events generating one POST, stale-edit Arabic feedback in normal/long fixtures, HTML/API security headers, static-cache transfer checks, no CSP console violations, all master tabs and existing roles/receipt behavior. Mobile checks at **320, 390 and 768px** passed.
- Printing: **two PDF fixtures**, normal and long Arabic, one page each. Final verification artifacts have exact 220 × 190 mm page boxes, with unchanged content streams using the pre-existing page-box rounding utility. Native Chromium's approximately 0.13/0.16mm dimension rounding remains documented; this is not a new production export feature. Both renders visually inspected; no clipping/UI/blank pages, full logo upper-left and centered title. Physical acceptance confirmed by the client on 2026-11-23.
- Frontend and backend Worker production builds: passed. Main JS approximately 302KB / 95KB gzip versus baseline 299KB / 94KB; no speculative route splitting or receipt redesign.
- Production dependency audit: **zero vulnerabilities**. Full dependency audit also **zero** (433 total dependencies reported, including development/optional metadata).
- Hosted staging: old/new logins, Secure cookies, legacy rehash, six simultaneous submissions producing one invoice, competing edits, replay after edit, print permissions/totals, and security headers all passed. [Staging results](evidence/staging-smoke.json).
- Recovery: encrypted/decrypted synthetic export verified byte-for-byte, restored to separate local D1, counts/relationships matched, zero foreign-key errors, seven triggers retained, downstream quantity update tested. Down/up migration cycle passed. Small-fixture export/encrypt/restore/check cycle: approximately 11.61s; not a production-sized RTO. [Recovery results](evidence/recovery.json).
- Compatible rollback baseline: frontend built, **14 baseline API groups passed**, Worker dry-run passed, and upgraded-hash verification checked. Do not roll back to the unmodified old password verifier.

## Remaining operator tasks and limitations

- Install the supplied backup scheduler on a trusted client-controlled host; configure client GPG public key, offline private-key recovery, encrypted offsite destination and backup-freshness alert. The synthetic key drill does not provision the client's real key.
- Configure/verify Cloudflare notification recipients, error/CPU/D1/usage thresholds and available log retention. The repository enables sanitized logs but does not claim dashboard alerts were created.
- Verify ownership, MFA, account recovery, domain renewal and HTTPS behavior on the actual custom domain. Current deployed endpoint is workers.dev; do not assume a custom domain has been attached.
- No machinery/legacy integration, invoice deletion/cancellation, MFA module, password-reset email or forced temporary-password change was added.
- Print action still records before the browser dialog completes, so canceling may lock Admin editing. Native printing remains possible for Data Entry accounts authorized to see printable content. Changing either rule needs separate approval; neither was changed.
- Rotate previously shared provider tokens through the provider's secure credential flow. No token is committed or embedded in remotes/CI.
- First counts, contains-search, very large daily groups, growing audit/snapshot storage and distributed login abuse remain monitoring considerations. No million-record certification or 100% security claim.

## Files and migrations

- `.github/workflows/verify.yml`
- `README.md`
- `VERIFICATION.md`
- `client/src/api.js`
- `client/src/components/UI.jsx`
- `client/src/pages/AuditLogs.jsx`
- `client/src/pages/InvoiceForm.jsx`
- `client/src/pages/Invoices.jsx`
- `client/src/pages/Master.jsx`
- `client/src/pages/Users.jsx`
- `docs/evidence/crypto.json`
- `docs/evidence/performance.json`
- `docs/evidence/recovery.json`
- `docs/evidence/staging-smoke.json`
- `docs/evidence/static-cache.json`
- `docs/operations.md`
- `docs/optimization-baseline.md`
- `docs/optimization-report.md`
- `eslint.config.js`
- `migrations/0006_invoice_integrity.sql`
- `migrations/0007_query_performance.sql`
- `package-lock.json`
- `package.json`
- `rollbacks/0006_invoice_integrity.sql`
- `rollbacks/0007_query_performance.sql`
- `scripts/backup.js`
- `scripts/browser-test.js`
- `scripts/build-rollback-worker.js`
- `scripts/crypto-benchmark-worker.js`
- `scripts/crypto-benchmark.wrangler.jsonc`
- `scripts/performance-checks.js`
- `scripts/prepare-restore.py`
- `scripts/receipt-print-checks.js`
- `scripts/recovery-test.js`
- `scripts/staging-smoke.js`
- `scripts/wrangler-util.js`
- `server/app.js`
- `server/routes/audit.js`
- `server/routes/auth.js`
- `server/routes/invoices.js`
- `server/routes/master.js`
- `server/routes/users.js`
- `server/security.js`
- `server/services/crypto.js`
- `server/services/invoices.js`
- `server/services/pagination.js`
- `server/validation/index.js`
- `server/worker.js`
- `tests/api.test.js`
- `wrangler.jsonc`

- `scripts/staging-smoke.js`
- `docs/evidence/supporting-plans.json`
- `docs/evidence/production-smoke.json`
- `docs/evidence/production-integrity.json`

New migrations: `0006_invoice_integrity.sql` and `0007_query_performance.sql`. Matching down scripts are under `rollbacks/`; tested on disposable data. Production backup/bookmark/export/deployment evidence stays in private ignored storage. See [operations.md](operations.md) for deployment order, compatible Worker rollback, database down migration/Time Travel safety, client checklist and support boundaries.

## Deployment record

- Workers Paid confirmed by successful CPU-budget deployment and hosted password/application checks.
- Production: https://anbar-system.anbar-system.workers.dev
- Hardening release Worker version: `76085b30-c9d0-4c3e-a46e-82ac8cd8284b`.
- Compatible rollback Worker version: `9f97a91a-0f7d-4580-9f87-173adf85f634`.
- Both production migrations applied successfully after a private export and Time Travel bookmark. Offline comparison of pre/post exports verified all pre-existing business rows and original columns unchanged; zero foreign-key errors; seven triggers and seven migrations. No production test records or login sessions were created.
- Live HTML and SPA route HTTP 200, strict headers and HSTS verified; HTTP redirected 308; unauthenticated API returned 401/no-store; fingerprinted JS returned 200/immutable. [Live smoke](evidence/production-smoke.json), [integrity result](evidence/production-integrity.json).
- Hosted staging evidence retained as non-sensitive results; disposable staging resources are cleaned up after verification.
- Emergency compatible Worker rollback: `npx wrangler rollback 9f97a91a-0f7d-4580-9f87-173adf85f634`. Keep additive schema; refresh clients. See operations runbook before any database reversal. No actual production rollback was performed.
- Refresh existing browser tabs after this coordinated frontend/API release.
- `main` was not checked out, merged, modified or deployed as a Git branch. Rollback compatibility was prepared from an archived baseline inside ignored temporary storage, without changing main.
