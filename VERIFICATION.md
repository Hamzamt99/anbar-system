# Verification — 16 November 2026

Implemented and validated in `/home/hamza/anbar-system`.

| Command / check | Result |
| --- | --- |
| `npm install` | Dependencies installed; lockfile recorded |
| Inspect and render all six design PDF pages | Completed before UI implementation |
| `npm run db:local` | Initial migration applied; 22 D1 commands successful |
| `npm run dev:api` | Express Worker and frontend running on localhost:8787 |
| `npm test` | 9 integration test groups passed, 0 failures |
| `npm run test:browser` | Passed against actual Wrangler Worker and disposable D1 |
| `npm run build` | Production Vite build passed |
| `npx wrangler deploy --dry-run --outdir tmp/worker-build` | Worker bundle and asset configuration accepted |
| `npm audit` | 0 vulnerabilities after dependency updates |
| `npm run format` | Source formatted |
| `npx wrangler whoami` | Cloudflare login unavailable: stored token could not be refreshed |

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
