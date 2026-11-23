# Verification — 16 November 2026

Implemented and validated in `/home/hamza/anbar-system`.

| Command / check                                           | Result                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm install`                                             | Dependencies installed; lockfile recorded                         |
| Inspect and render all six design PDF pages               | Completed before UI implementation                                |
| `npm run db:local`                                        | Initial migration applied; 22 D1 commands successful              |
| `npm run dev:api`                                         | Express Worker and frontend running on localhost:8787             |
| `npm test`                                                | 9 integration test groups passed, 0 failures                      |
| `npm run test:browser`                                    | Passed against actual Wrangler Worker and disposable D1           |
| `npm run build`                                           | Production Vite build passed                                      |
| `npx wrangler deploy --dry-run --outdir tmp/worker-build` | Worker bundle and asset configuration accepted                    |
| `npm audit`                                               | 0 vulnerabilities after dependency updates                        |
| `npm run format`                                          | Source formatted                                                  |
| `npx wrangler whoami`                                     | Cloudflare login unavailable: stored token could not be refreshed |

Browser validation covered sign-in, all five master tabs, invoice form submission, previews that preserve an empty printed timestamp, invoice lists and filters, user creation, role-protected routes, logout, mobile navigation, A4 dimensions, and Admin locking after an actual print-status API action. Screenshots in `tmp/screenshots` were visually inspected against every reference screen. Test credentials were random and the disposable browser database was removed afterward.

The application contains no installed sample users or business data. Create your real initial Super Admin with `npm run admin` for local D1, or `npm run admin -- --remote` after configuring production D1.

Production migration/deployment was not performed: a valid Cloudflare login and a real D1 database ID are still required. The complete commands are in README.md. Physical printer output depends on the browser/printer settings; A4 browser print rendering has been verified.

## Production deployment update

Production D1 `04b6d257-131e-4b69-9502-fd016f55ee0d` was configured with binding `DB`. `npm run db:remote` successfully applied all 22 initial schema commands. `npm run deploy` uploaded the frontend and deployed Worker version `584e2afc-99bd-4675-abd9-44357b396995`.

Deployed URL: https://anbar-system.anbar-system.workers.dev

Initial live HTTP verification from this environment encountered a connection reset before receiving an HTTP response. The first production Super Admin still needs to be created privately through `npm run admin -- --remote`.

## Invoice audit history update

- Added migration `0002_invoice_audit.sql`; all 12 commands applied successfully to local and production D1.
- All 10 API integration test groups passed, including atomic audit writes/rollback, authenticated email attribution, create/edit/print history, historical actor preservation, pagination/filter validation, denied role access, and append-only enforcement.
- Chromium workflow passed, including an actual invoice edit and its before/after values in the audit details dialog. Reviewed `tmp/screenshots/09-audit-logs.png` for layout.
- Production build and deployment succeeded. Worker version: `aa47872f-760f-468a-a573-ef5888ee1b5c`.
- Live homepage returned HTTP 200; unauthenticated audit endpoint is protected.
- Audit history starts at this update; prior edits cannot be reconstructed.

## Required fields and departure offset update

- Made only the ten requested invoice fields required, including pump number. Arrival, finish, receiver, chemicals, and added water can be omitted.
- Factory departure is calculated on the server as entered time plus 15 minutes; arrival is independent. Stored the original entry separately to prevent repeated adjustments on edits/reprints. Legacy recorded times remain unchanged on unrelated edits.
- All 11 API test groups passed. Added coverage for omitted optional fields, each missing required field, departure offset, midnight rollover, repeated saves, legacy records, and invalid optional times.
- Full Chromium workflow passed with empty finish/receiver fields, required pump accessibility, displayed/printed adjusted time, and editing without an additional offset. Visual form review passed.
- Migration `0003_departure_input.sql` applied to local and production D1.
- Production build and deployment passed; version `ec1116ca-80fa-4256-a4f9-16e842d551ff`.

## Mobile layout update — 20 November 2026

- Fixed phone/tablet navigation with a collapsible menu, route-selection closing, Escape handling, and focus returning to the menu button.
- Added labelled responsive cards for invoice, master-data, users, and audit rows. Kept all row actions visible without horizontal table scrolling on small screens.
- Improved phone form columns, time/date fields, touch controls, searchable selectors, long email/company wrapping, master tabs, dialogs, and login spacing.
- Stacked receipt details and long timing labels for phone reading; retained the A4 print layout through screen-only responsive styles.
- `npm run test:browser` passed the desktop workflow and additional checks at 320px, 390px, and 768px on every page, including dialogs, confirmation, searchable selection, navigation, tap sizes, mobile login, and overflow checks. Reviewed mobile screenshots and the A4 print screenshot.
- `npm test`: all 11 API integration test groups passed.
- Production build and deployment succeeded. Worker version: `65ff8077-e3d7-40d1-bf26-46018f7bf8d9`.
- Live homepage and updated mobile stylesheet returned HTTP 200.

## Custom factory receipt — 20 November 2026

The current receipt requests **220 × 190 mm landscape paper**, `@page margin: 0.5cm`, and 100% scale. There is no A4 print rule. Receipt content has a further 2 mm internal safe inset; print colors are preserved where supported. Application screens are unchanged apart from adding the requested optional factory-arrival field to the existing time section.

### Files changed

- `client/src/receipt-print.css` — authoritative custom-paper styles, RTL factory structure, safe wrapping, print-only visibility and margins.
- `client/src/pages/Receipt.jsx` — full uncropped PNG upper-left, centered title, discreet invoice number, four shipment times and printable logo-load fallback.
- `client/src/style.css`, `client/src/branding.css`, `client/src/main.jsx` — remove obsolete A4/receipt logo overrides and load receipt-only styles.
- `client/src/pages/InvoiceForm.jsx` — optional `ساعة الوصول إلى المصنع` time input.
- `server/validation/index.js`, `server/services/invoices.js` — optional HH:mm validation and prepared create/update column binding.
- `migrations/0004_factory_arrival.sql` — add nullable `factory_arrival`, preserve old rows, and extend the existing atomic audit snapshots.
- `client/src/pages/AuditLogs.jsx` — display the new field in audit details.
- `tests/api.test.js` — creation, reading, editing, invalid times, optional/null legacy values and audit coverage for the new field.
- `scripts/browser-test.js`, `scripts/receipt-print-checks.js` — generate full-field and long-value receipts and exercise form persistence, print layout, logo fallback, totals and printed permissions.
- `scripts/verify-receipt-pdfs.py` — inspect exact page geometry, page count, safe glyph bounds, logo/title positioning and all four time values.
- `.gitignore`, `README.md`, `VERIFICATION.md` — ignore generated verification PDFs and document setup, paper selection and verification.

### Results

- `npm test`: **12 test groups passed**, including existing authentication, role permissions, daily quantity resets, concurrent totals, editing/recalculation, audit history and printed-invoice restrictions.
- `npm run test:browser`: passed desktop and mobile workflows, plus full-field creation and editing of factory arrival from `17:20` to `17:35`, subsequent reading and printing.
- Standard receipt: **1 page, exactly 220 × 190 mm** in the final verification PDF.
- Long receipt: **1 page, exactly 220 × 190 mm**, with a **197-character Arabic customer name** and **199-character Arabic location**. DOM overflow and clipping checks passed.
- Both final PDFs were re-rendered and visually inspected at the custom paper aspect ratio. The logo is upper-left, title centered, all four times present, no navigation/buttons visible, and all text/lines/signatures fit inside the paper. A grayscale render was also inspected; the original logo remains recognizable.
- Logo-failure check: blocked the PNG in a separate local browser context; the company-name fallback remained printable and did not prevent printing.
- Repeated print actions preserved invoice counts and previous/current/cumulative quantities. ADMIN still received HTTP 403 when attempting to edit a printed invoice.
- Existing production table counts were unchanged by migration, all seven triggers were preserved, and the foreign-key check was clean. A private local backup was taken before applying the migration. Verification records existed only in a disposable local D1 database; no test invoices were added to production.
- Local and production migration `0004_factory_arrival.sql` succeeded. Production build and deployment succeeded; version **a874c137-6c14-405a-a9b1-8f57b03217fd**. The live homepage and custom-size stylesheet returned HTTP 200.

### PDF precision and browser verification limits

The tested Chromium build natively exported PDF bounds of approximately **220.133 × 190.161 mm** despite `@page { size: 22cm 19cm; margin: 0.5cm; }`, `scale: 1`, and no Fit to page. The final sample PDFs' MediaBox/CropBox/TrimBox/BleedBox/ArtBox were normalized to exactly 220 × 190 mm. Their content streams were verified byte-for-byte unchanged: **no scaling, reflow, rasterization or content edits** were applied. These PDFs were then rendered and visually inspected again. Raw native exports are retained under ignored `tmp/pdfs/`.

Application printing remains native HTML/browser printing with the exact CSS custom paper request. This normalization is only a local verification-artifact step, not a new production PDF-generation feature. Chromium's engine was exercised; a separate Edge binary and a physical printer were not used. Set the physical printer driver to 220 × 190 mm, 100% scale, and disable browser headers/footers.

Final verification artifacts (generated, not committed):

- `output/pdf/anbar-receipt-normal-220x190.pdf`
- `output/pdf/anbar-receipt-long-220x190.pdf`
- `tmp/receipt-print-verification.json` — browser geometry and fixture lengths.
- `tmp/receipt-pdf-verification.json` — exact final PDF dimensions and content-stream checks.

## Protected Super Admin accounts — 20 November 2026

- All `SUPER_ADMIN` rows hide the Delete action, including a different Super Admin's account. Ordinary-user deletion remains available.
- The backend atomically excludes `SUPER_ADMIN` targets from DELETE. Existing Super Admins cannot be downgraded through PUT, preventing downgrade-then-delete bypasses; the role selector is locked for those accounts.
- Rejected downgrades preserve the target's active sessions. Allowed email edits, password resets, and promotion of ordinary users still work. Direct database administration is unchanged; no migration or production account changes were performed.
- `npm test`: all **13 API test groups** passed. New checks cover deletion and demotion by another Super Admin, session preservation, email/password maintenance, promotion protection, and nonexistent users. Existing auth, audit, invoice totals, print permissions, and factory-arrival tests pass.
- `npm run test:browser`: passed desktop/mobile checks; verified no Delete action and a disabled role selector on both the signed-in and another Super Admin's row. Ordinary-user Delete remains visible.
- Production build/deployment succeeded: version `72556dfb-9c2c-4304-b969-73f73e35901a`.

## Self-managed Super Admin accounts — 20 November 2026

- Super Admins can edit only their own Super Admin profile/email and password. Other Super Admin rows are read-only and show no edit, password-reset, or delete buttons. Ordinary-user management remains available.
- Both email/role updates and password changes use atomic SQL predicates checking the target's current role and authenticated account ID. Another Super Admin cannot modify the account, even through a direct API request or a no-op edit.
- Session revocation is gated by the successful preceding UPDATE within the same D1 batch. Rejected modifications leave the target's sessions untouched; ordinary role changes/promotions still revoke old sessions, and successful own-password changes revoke that account's sessions.
- Deletion and demotion protection remains unchanged. No migration or production account mutation was required.
- `npm test`: all **13 test groups passed**, including reciprocal cross-account denial, unchanged password/session on denial, own-email and own-password changes, promotion/session invalidation, and existing application regressions.
- `npm run test:browser`: passed desktop/mobile checks. Confirmed the signed-in Super Admin retains edit controls and another Super Admin has no action buttons. Receipt-print and invoice permission checks also pass.
- Production build/deployment succeeded: version `030024f2-ffe3-4adf-b481-b3dda8ecee6e`.

## Mixer master data — 2026-11-22

- Added optional searchable رقم المكسر immediately below رقم المضخة, managed through البيانات الأساسية → المكسر. Invoice create/edit/read/receipt and audit snapshots retain the selection; renamed/deleted master records do not rewrite historical invoice values.
- Additive migration `0005_mixers.sql` applied locally and remotely after a private production backup. Existing table row counts verified unchanged.
- `npm test`: 14 groups passed, including mixer permissions, invalid/deleted references, edit/clear, historical snapshots and audit data. Full browser workflow passed with all six master tabs, plus mobile checks at 320/390/768px and existing quantity/permission/print-lock checks.
- Normal and long Arabic receipt PDFs verified as one exact 220 × 190 mm page using the existing page-box normalization utility, content streams unchanged. Long receipt rendered and visually inspected: upper-left logo, centered title, mixer below pump, safe text/signature margins, no clipping or browser controls. Slightly reduced receipt row/time/signature spacing to accommodate the additional row without changing paper size or font size.
- Deployed production Worker version `4a5bec3a-6860-4a49-8243-4cae9f110076`; homepage and assets checked over HTTP.

## Invoice form placement correction — 2026-11-22

The mixer selector is a normal grid field beside the pump selector. All six selectors occupy the desktop first row, placing the date on the next row below the customer name. Removed the pump/mixer wrapper and its unused styles. The receipt continues to show mixer below pump. Visually inspected the 1440px form screenshot; the full browser workflow, mobile checks at 320/390/768px, and custom receipt checks passed. No API, database or receipt layout changes were needed.

## Production hardening on optimization — 2026-11-23

- Baseline: 14 API groups, existing browser/mobile/receipt runner passed, zero reported dependency vulnerabilities. Confirmed remaining gaps before changing source; existing roles/design/print rules preserved.
- Final: 25 API test groups passed with zero failures; ESLint/Prettier, clean npm installation, browser workflow (including duplicate submit events and Arabic stale-edit feedback), mobile 320/390/768, frontend/Worker builds, two one-page receipt PDF fixtures and zero-vulnerability dependency audit passed. Receipt renders visually inspected; factory printer settings/long-value acceptance confirmed by the client.
- Synthetic local D1 performance measured at 10,000 and 100,000 invoices, 25 observations per query/endpoint/phase. Full p50/p95, query plans and rows-read/written evidence: [optimization report](docs/optimization-report.md). No million-record claim.
- Encrypted synthetic export/decrypt/restore drill passed in isolated local D1, preserving counts/relationships and seven triggers, with zero FK errors and successful downstream recalculation. Down/up migrations tested. Compatible archived rollback build passed 14 baseline API groups and upgraded-hash verification.
- Workers Paid confirmed. Hosted native PBKDF2 rejected 600k; Noble 600k passed five hosted probes within the configured CPU ceiling. Isolated hosted staging verified actual legacy rehash/new logins, Secure cookies, six-way retry uniqueness, edit conflicts, original-response replay and print permissions/totals.
- Production migrations 0006/0007 applied after private backup/bookmark; pre/post export comparison confirmed every pre-existing business column and row unchanged. Seven migrations/seven triggers and clean FK check. No production fixtures or test login sessions created.
- Deployed Worker `76085b30-c9d0-4c3e-a46e-82ac8cd8284b`; compatible rollback Worker `9f97a91a-0f7d-4580-9f87-173adf85f634`. Live HTTPS/CSP/HSTS/no-store/static-cache/SPA checks passed. Main remains `9b3d188`; work stays on optimization.
- Remaining manual operations: client GPG/offsite destination and scheduled-job installation, backup freshness alerts, Cloudflare notification recipients/thresholds and domain/account ownership checks. See [operations runbook](docs/operations.md). Print-cancel locking and Data Entry native-print limitations remain unchanged and documented.

## Supplied triangular logo — 2026-11-23

- Both supplied PNGs were byte-identical. Replaced `client/src/assets/anbar-logo.png` with the original 1774 × 887 transparent artwork, without raster edits, stretching or cropping.
- Header and login display the complete PNG with its built-in Arabic/English name; removed duplicated visible company-name text. The login heading retains an accessible name through image alt text. Header keeps a white backing for contrast with black lettering. Receipt uses the same full asset, preserves its top-left placement and image-failure fallback.
- ESLint/format checks and the complete browser workflow passed, including mobile 320/390/768 and normal/long receipt checks. Visually inspected desktop login/header, mobile form/header and long receipt render. Both verification PDFs are one exact 220 × 190 mm page after the existing page-box normalization, with unchanged content streams. Source pixel dimensions are checked; placement allows one CSS pixel of Chromium rounding.
- Private pre-deployment export/bookmark captured. No database migration or business-data changes. Deployed from optimization as Worker `afd4c895-c1e1-4c6b-a934-a36ae5ff6a98`. Immediate branding rollback: `76085b30-c9d0-4c3e-a46e-82ac8cd8284b`. Main untouched.

## Mobile native date/time containment — 2026-11-23

- Applied a mobile/tablet-only grid wrapper and explicit native date/time appearance, border-box sizing and physical/logical width bounds. Kept native input types, values, RTL labels and existing time/date validation. No parent overflow clipping, app redesign or print-style changes.
- Extended Chromium mobile checks to test each input against its label and panel content rather than checking only whole-page width. Added WebKit/iPhone emulation for creation, invoice filters and audit filters: **36 combinations** across 320/375/390/402/430/768px, with empty and populated date/time values. All passed, along with the complete existing Chromium workflow, mobile checks and one-page receipt checks. ESLint/Prettier passed. CI now installs WebKit as well as Chromium.
- Visually inspected the WebKit 402px invoice-filter screenshot; controls are inset inside panel borders. WebKit tests use the Linux engine with iPhone emulation, not a physical iPhone. Test setup isolates incompatible IDE GTK/GIO plug-ins and permits only the disposable HTTP-localhost fixture cookie after asserting the server's Secure flag; production authentication is unchanged.
- Evidence: `docs/evidence/mobile-native-field-containment.json`. Native inputs retained entered ISO date/time values during testing. Receipt artifacts reverified with existing PDF utility.
- Private backup and bookmark captured before deployment. No migrations or business-data changes. Deployed optimization Worker `e768c4bb-5850-4b57-b05c-742e321e6adc` and verified its live CSS over HTTPS. Immediate rollback: `afd4c895-c1e1-4c6b-a934-a36ae5ff6a98`. Main remains untouched.
