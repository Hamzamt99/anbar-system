# Website action performance review — 2026-11-23

Audited the existing application on `optimization`; no redesign, schema migration or business-rule changes. Tests use disposable synthetic local databases, never production business records.

## Changes

- Invoice reference validation now sends the selected master lookups in one D1 batch instead of up to six sequential database calls. Unchanged historical snapshots, optional references, missing/deleted-record rejection and parameterized queries remain intact.
- Login's atomic attempt-counter update returns its count directly, eliminating a separate read while retaining the rate limit and password verification.
- Printing returns the updated invoice directly from the update statement, eliminating a separate read. Audit triggers still run, printed-invoice locks and version increments remain, and printing does not create invoices or change quantities.
- Invoice edit/detail/quantity reads cancel on navigation or when replaced. Users pagination cancels superseded reads, rejects late responses and disables pagination during loading.
- Retained the preceding dropdown prefetch/bounded private cache work. Master mutations still reload their ordered page so creates, renames, deletions and pagination stay correct.

## Browser measurements

`npm run test:browser` now includes 61 measured UI actions and 117 completed API requests in a separate local Chromium session. This covers navigation; all six master tabs, modal focus, create/edit/search/delete; user create/edit/password reset/delete; daily quantities; invoice save/edit/view/preview; print readiness; audit filters/details; invoice customer filtering; invoice/audit cursor pagination; logout. Existing tests separately cover all roles, protected Super Admins, retry/version conflicts, mobile Chromium and WebKit, large master dropdowns and receipts.

These are single action samples including browser automation and local HTTP/rendering. They are not hosted latency guarantees or a before/after speedup percentage. Login also warms the new form; the printer-dialog opening time is excluded because `window.print` is stubbed.

| Action | Local elapsed time |
| --- | ---: |
| Navigate to master data / users / invoice form / invoices | 12 / 105 / 44 / 114 ms |
| Master add modal and automatic focus | 26–51 ms |
| Master create/edit/delete | 48–107 ms |
| Typed master search | 197–203 ms, including intentional 180 ms debounce |
| Daily quantity refresh | 19 ms |
| Invoice save → receipt / edit save → receipt | 112 / 116 ms |
| Open invoice edit / view / preview | 97 / 109 / 40 ms |
| Receipt print readiness | 60 ms |
| Audit details modal / filter | 28 / 48 ms |
| Invoice/audit next/previous page | 50–117 ms |
| User edit/delete | 56 / 114 ms |
| Logout | 39 ms |
| Login → ready form | 1.32 s |
| User creation / password reset | 1.32 / 1.32 s |

Password-related actions deliberately retain PBKDF2-SHA256 at 600,000 iterations. They should not be made superficially faster by weakening hashing or bypassing current session/role checks.

## Growth checks

Re-ran `npm run test:performance` against 10,000 and 100,000 synthetic invoices, with 25 samples per measured endpoint. At 100,000, current local HTTP p95 was 15–21 ms for the sampled invoice list/filter/detail/quantity/audit endpoints and 48 ms for creation, including authorization and save safeguards. API read benchmarks explicitly request `count=0`; initial exact counts are measured separately in the evidence.

Existing indexes cover invoice order, customer/date, driver/date, combined filters, quantity order, audit and active master names. Invoice/audit lists return 20 rows and forward traversal uses cursors; master pickers request 50 records. None of these list actions downloads the complete invoice history.

Remaining scaling limits: exact first-page counts, arbitrary contains searches and edits that recalculate many later invoices in the same customer/day can grow with matching data. User pagination uses bounded offsets for a small internal user population. Network distance, connection quality, device speed, Worker CPU and D1 contention still affect real latency. This test is not a million-invoice capacity or concurrent-load guarantee.

## Verification

Lint, all 25 API groups, full browser suite, Chromium/WebKit mobile checks, Worker dry run, dependency audit (zero vulnerabilities) and encrypted export/restore plus migration reversal/reapply checks passed. Normal and long Arabic receipt PDFs passed the existing page-box verifier (220 × 190 mm, one page, content unchanged), and rendered pages were visually inspected without clipping. Native Chromium's rounded page boxes are recorded separately by the verifier; print CSS is unchanged.

Evidence: [UI action/request samples](evidence/action-responsiveness.json), [scale benchmark and plans](evidence/action-scale-benchmark.json). Production rollout and rollback version are recorded in the operations runbook.

## Follow-up: master-tab request reuse

The original timings above included network reads on master tab switches. The follow-up now caches master table pages in an account/role-scoped in-memory provider that survives route changes. Tab switches do not revalidate. First pages prefetch once, search/cursor cache entries are bounded, and successful master writes invalidate the affected type in the same browser and other open tabs through metadata-only BroadcastChannel messages. Full reload/logout/account changes discard the cache. External-browser/direct database changes require a refresh.

The focused test warmed all six pages with six requests, then blocked master reads and switched tabs 18 times plus left/returned to the page: zero further requests, with 29–36 ms local switches. Same-tab/cross-tab mutation invalidation and reload passed. The latest full action scenario made 109 completed API requests; the original sample table/evidence above is retained as the earlier review. [Cache regression evidence](evidence/master-tab-cache.json).
