# شركة العنبر للخرسانة

Complete Arabic RTL concrete delivery invoice application. React + Vite (JavaScript), React Router, Express on Cloudflare Workers, Cloudflare D1, and self-hosted Arabic fonts. The six approved PDF pages inform the login, master data, invoice form, list, user management, and custom-size receipt.

## Prerequisites

- Node.js 22.12+ (tested on 22.18), npm, and a Cloudflare account with Workers and D1 enabled.
- Chromium for browser checks: `npx playwright install chromium` (Linux may also need `npx playwright install-deps chromium`).

## Installation and local development

```bash
npm ci
npm run build
npm run db:local
npm run admin
npm run dev:api
```

Open **http://localhost:8787**. Wrangler serves both the built frontend and the real Express API with locally persisted D1. No sample users or business records are installed. The interactive admin command asks for your chosen email and a hidden password of at least 12 characters. It creates a Super Admin and fails if the email already exists.

For frontend hot reload, keep the API running and use a second terminal:

```bash
npm run dev
```

Open **http://localhost:5173**; Vite proxies `/api` to port 8787. Rebuild with `npm run build` when testing the single-origin Wrangler deployment.

Local D1 data lives in `.wrangler/state` and is ignored by Git. `npm run db:local` is repeatable; Wrangler tracks applied migrations. Local development never connects to production D1.

## Configuration and secrets

`wrangler.jsonc` defines the Worker, compatibility date, `nodejs_compat`, `DB` binding, and SPA assets. `.env.example` documents optional local `.dev.vars` settings. There are no frontend secrets, hardcoded credentials, external font requests, or required session signing secrets. Session identifiers are 32 random bytes; only SHA-256 token digests are stored in D1.

Production uses HTTPS and HttpOnly, SameSite=Strict cookies; secure cookies are set on HTTPS requests. Local HTTP permits development cookies. Sessions expire after eight hours. Password hashes use Web Crypto PBKDF2-SHA256, 100,000 iterations (Workers Web Crypto supported limit), random 128-bit salts, and a 256-bit result. Login throttles each IP/email pair to ten attempts per 15 minutes. Password resets revoke all sessions for that user; role changes revoke their other sessions. Destructive actions have a confirmation dialog, and Super Admin accounts cannot be deleted or demoted through the application or API. Super Admins can edit their own email and password; other Super Admins cannot modify those accounts.

## Cloudflare setup and deployment

```bash
npx wrangler login
npx wrangler d1 create anbar-db
```

Copy the returned `database_id` into the `DB` entry in `wrangler.jsonc`, replacing the all-zero **local development placeholder**. Keep `binding: "DB"`, `database_name: "anbar-db"`, and `migrations_dir: "migrations"`.

```bash
npm run db:remote
npm run admin -- --remote
npm run deploy
```

The remote admin command asks for credentials interactively, hashes the password locally, and sends only the resulting hash to D1. It uses a private, temporary SQL file and removes it after execution. Do not place passwords in shell arguments, commit `.dev.vars`, or use the test fixture accounts in production. Application queries use bound prepared statements; bootstrap SQL escapes the validated email and hash because Wrangler's SQL-file CLI has no bind-parameter interface.

`npm run deploy` builds the frontend and deploys the Express Worker with static assets. Use the workers.dev URL Wrangler returns, or add your own Worker custom domain in Cloudflare. Both API and frontend use one origin, so no CORS configuration is needed. No permanent invoice PDFs or external storage services are required.

## Application workflows

- Sign in as Super Admin, add users with exactly one of `DATA_ENTRY`, `ADMIN`, `SUPER_ADMIN`.
- Add customers, drivers, mix types, vehicles, and pumps through the five master-data tabs.
- Create invoices with searchable reference selectors, manual pour-location/chemical fields, quantities, times, and receiver. Quantities accept up to three decimal places and a maximum of 999999.999 per invoice.
- Each invoice has a unique, permanent serial number such as `INV-000001`. The same number appears in the invoice list, audit history, preview, and printed receipt; edits and reprints retain it.
- Saving opens the invoice details. “معاينة الطباعة” saves the current form and opens its printable receipt without marking it printed. Viewing an existing preview performs no writes.
- Admin and Super Admin can filter invoices by customer, driver, and date range. Results paginate in groups of 20. Data Entry can view the list and details and preview receipts, without filtering, editing, or recording a print action.
- “طباعة” records the first printed timestamp and invokes the browser print dialog. Canceling that dialog does not undo the recorded print action. Admin cannot edit the invoice afterward; Super Admin can.
- Print the receipt on custom **220 × 190 mm** landscape paper at **100% scale**. `@page` sets `size: 22cm 19cm` and `margin: 0.5cm`; do not select A4 or Fit to page. Configure this custom paper size in the printer driver and turn browser header/footer printing off. The signature line is left blank for manual signing.

## Data integrity and architecture

```text
client/src/
  components/   accessible controls, dialogs, branding, Arabic quantity words
  pages/        master data, invoice form/list, receipt, users
server/
  middleware/   session authentication and role authorization
  routes/       auth, users, master data, invoices
  services/     Web Crypto and invoice snapshots/serialization
  validation/   Zod schemas and Arabic errors
  app.js        Express middleware and route composition
  worker.js     official Cloudflare httpServerHandler integration
migrations/     D1 schema, indexes, transactional quantity triggers
scripts/        secure initial admin and isolated browser validation
tests/         API and D1 integration tests
```

Every invoice stores the selected master record IDs and original display names. Renames do not change historical invoices. Master-data deletion is a soft delete; historical references remain valid, and removed options cannot be selected for new invoices. Editing an invoice preserves its original snapshots unless a reference is explicitly changed.

Quantities are stored as integer thousandths. Database triggers calculate previous and cumulative quantities in the same transaction as every insert or relevant update. Groups use customer ID and invoice date; ordering uses immutable creation timestamp then invoice ID. Editing an older invoice recalculates subsequent rows, including printed rows, as required. Moving an invoice between customer/date groups recalculates both groups. Reads submitted as previous/cumulative values are rejected; the client never controls those database fields. Concurrent writes serialize in D1, with no application read-then-write totals race. Print locking is also checked in the atomic UPDATE condition to prevent a concurrent print from bypassing the Admin edit restriction.

## Testing and verification

```bash
npm test
npm run test:browser
npm run build
npx wrangler deploy --dry-run --outdir tmp/worker-build
npm audit
```

`npm test` uses an isolated Miniflare D1 database with the real migrations and Express routes; it does not substitute a SQLite file or mock database. Twenty-five test groups cover authentication, cookies, CSRF, role permissions, master-data constraints, integer decimal quantities, customer/date resets, concurrent creation, old/new group recalculation, snapshot history, print locks, input validation, filtering, user lifecycle, logout, and session revocation.

`npm run test:browser` builds the app, applies migrations to a disposable local D1, generates a random temporary test credential, and runs Chromium against a real Wrangler Worker on port 8788. It exercises all master tabs, invoice creation and preview, user creation, list filters, role route protection, mobile width, and print styles. Screenshots of all screens go to ignored `tmp/screenshots`. Invoice filter selectors include deleted customers and drivers for historical searches; new-invoice selectors show active records only. The test removes its disposable D1 state and credentials afterward; normal local and remote data remain untouched.

`npm run format` formats maintainable source files. Dependency versions are locked in `package-lock.json`.

## Deployment status

Local migration, all 25 API test groups, the full browser workflow, the production build, and the Worker deployment dry run have passed. See [VERIFICATION.md](VERIFICATION.md) for the execution report.

Production D1 migrations and Worker deployment have now completed with database `04b6d257-131e-4b69-9502-fd016f55ee0d`. Application URL: https://anbar-system.anbar-system.workers.dev. Create the first production Super Admin with `npm run admin -- --remote`.

Official integration reference: [Deploy an Express.js application on Cloudflare Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/).

## Invoice audit history

Super Admins can open **سجل العمليات** from the navigation or from an invoice receipt. The read-only table records invoice creation, actual edits, and every print action with the authenticated user's email, invoice ID, and timestamp. Details show field values before and after changes. Filters support invoice ID, email, action, and date range, with 20 entries per page. Times and date filters use Asia/Amman.

Migration `0002_invoice_audit.sql` adds the `audit_logs` table and invoice audit actor columns. Database triggers write each event atomically with the invoice mutation, so a failed audit insert also rolls back that invoice change. Actor emails are preserved independently of user accounts, and audit rows reject UPDATE and DELETE. Automatic quantity recalculation does not create misleading manual-edit events. Passwords and session tokens are never part of the invoice snapshots.

Tracking begins when this migration and application update are installed. Historical edits made before audit logging existed cannot be reconstructed. Apply `npm run db:local` locally and `npm run db:remote` before deploying the update.

## Required fields and departure time

Only customer, pour location, date, driver, vehicle, pump, requested quantity, truck load, factory departure entry, and mix type are mandatory. Arrival time, unloading completion, chemicals, added water, and receiver name can be omitted. Previous and cumulative quantities remain automatic.

The factory departure time saved and printed is the entered time **plus 15 minutes**, including midnight rollover (`23:50` becomes `00:05`). Arrival time stays optional and independent. The form displays the final departure underneath the input. The server enforces the adjustment and stores `departure_input` separately; edits reload the original entry, so saving or printing repeatedly does not add further offsets. Invoice dates remain the dates entered.

Apply migration `0003_departure_input.sql` before deploying. Existing recorded departure times are preserved on unrelated edits; explicitly changing a legacy invoice's departure entry applies the new rule.

## Mobile layout

The phone and tablet layouts use a collapsible, keyboard-accessible navigation menu, larger form controls, readable single-column forms on narrow phones, and labelled cards for invoice, master-data, user, and audit tables. Searchable selectors, action buttons, confirmation dialogs, and long emails fit narrow viewports. Receipt details stack vertically on phones while custom-paper print styles keep the factory receipt layout.

`npm run test:browser` includes checks for every page at 320px, 390px, and 768px, with screenshots named `tmp/screenshots/mobile-<width>-<page>.png`. These checks cover document/table overflow, touch control sizes, navigation expansion and Escape handling, user/audit dialogs, master-data confirmation, mobile login, and searchable selections. Desktop workflow, permissions, invoice calculations, and custom-paper print checks remain included.

## Custom factory receipt and factory-arrival time

The receipt uses `client/src/receipt-print.css` for 220 × 190 mm landscape paper with 5 mm page margins and an additional 2 mm internal safe inset. The full, uncropped transparent PNG appears upper-left, with a text fallback on image failure. The certificate title stays centered; the invoice number is discreetly placed in the header. Dotted lines, RTL data, quantities, shipment times, chemicals, water, declaration, receiver, and manual signature retain the factory receipt structure.

Migration `0004_factory_arrival.sql` adds nullable `invoices.factory_arrival` and extends the existing audit snapshots to include it. Existing invoice data is not rewritten. The optional **ساعة الوصول إلى المصنع** input validates HH:mm like the other optional time fields, persists on create/edit, and appears on details and print. Other departure-offset rules, role permissions, printed locks, and quantity calculations remain unchanged.

`npm run test:browser` creates full-field and long-value verification invoices only in its disposable local D1 database. It saves native Chromium print PDFs under ignored `output/pdf/` at scale 1, checks all four time fields, logo failure, print permissions, and unchanged totals after reprinting. For exact PDF geometry and font-boundary checks:

```bash
python3 -m venv tmp/pdf-venv
tmp/pdf-venv/bin/pip install pypdf pdfplumber
tmp/pdf-venv/bin/python scripts/verify-receipt-pdfs.py
```

Chromium's native export in the tested build rounds the PDF bounds to approximately 220.133 × 190.161 mm despite the exact CSS paper size. The verification script changes only the sample PDFs' page boxes to exactly 220 × 190 mm, preserving their content streams byte-for-byte (no scaling or Fit to page). It then verifies one page, safe text margins, the upper-left logo, the centered title, and all four time values. This is a local verification utility, not a new application PDF storage or export feature.

## Protected Super Admin accounts

Every `SUPER_ADMIN` account is protected from application/API deletion, including deletion by a different Super Admin. Its existing role cannot be downgraded through the application, preventing a downgrade-then-delete bypass. The users table hides Delete for every Super Admin, and editing an existing Super Admin keeps its role selector locked. Email edits and password changes are allowed only for that Super Admin account’s owner. Other Super Admin accounts appear read-only with no edit, password-reset, or delete actions. Denied requests do not revoke their sessions. Regular accounts can still change roles or be deleted, and promoting an account to Super Admin makes it protected. Removing or downgrading a Super Admin requires direct, authorized database access; there is no application endpoint for this operation. No schema migration is required.

## Mixer numbers

Manage mixer numbers under **البيانات الأساسية → المكسر**. The optional searchable **رقم المكسر** selector appears beside **رقم المضخة** in invoice creation and editing, with the date on the following row below the customer, and the saved value appears on the receipt and in invoice audit snapshots. Migration `0005_mixers.sql` adds the master table and nullable invoice reference with a name snapshot, preserving older invoices and historical selections after master rename or soft deletion.

## Production hardening

See [optimization report](docs/optimization-report.md) for the baseline, changes, measured results and deployment record, and [operations runbook](docs/operations.md) for backups, recovery, rollback, monitoring, printer settings and support boundaries. New invoice creation requires an `Idempotency-Key` header; edits require the current integer `version`. The supplied frontend handles both. Refresh open application tabs after this coordinated release.

Run `npm run lint`, `npm test`, `npm run test:browser`, `npm run test:recovery`, `npm run build:worker` and `npm audit --audit-level=high`. Recovery verification requires Python 3 and GPG. `npm run test:performance` uses synthetic local D1 only. CI uses Node 22 and no production credentials.

## Company logo

Header, login and receipt use the supplied transparent triangular PNG with its built-in company name. There is no additional visible company-name caption next to the healthy logo. Full artwork and aspect ratio are preserved; image alt text supplies accessible names. Receipt text fallback appears only if the image fails.

Mobile browser verification includes WebKit/iPhone emulation for date/time inputs in the invoice form, invoice date filters and audit filters. Install both test engines with `npx playwright install --with-deps chromium webkit`. The checks assert controls stay inside their labels and panel content, including empty and populated native inputs at 320, 375, 390, 402, 430 and 768px. Local HTTP-only WebKit fixtures relax the fixture cookie after checking its production Secure flag; deployed cookie settings are unchanged.

Master selections prefetch up to 50 options per picker. Mounted pickers keep a bounded private memory cache, show warm results during background refresh, and revalidate on opening, searching and returning to the tab. Successful master-data writes invalidate the relevant picker caches in the current tab and other tabs through BroadcastChannel where available. Records are never persisted in browser storage or a shared response cache. Initial network latency still applies. All six master tables have active-name indexes; contains searches may still scan candidate names. Invoice history is not loaded by these pickers.

See the [website action performance review](docs/action-performance-review.md) for the full action audit, local browser measurements, 10k/100k invoice benchmarks and remaining scaling limits.

The six master-data management tabs now prefetch their first bounded page once and retain it in memory for the authenticated application lifetime. Switching tabs or leaving the page and returning does not re-fetch cached results. Successful master writes invalidate the affected type in this browser and other open tabs via BroadcastChannel where supported. A full browser refresh, logout or account/role change clears the cache; changes made from a different browser or directly in D1 require a refresh. Initial network latency remains. Cached search/cursor pages are bounded to eight per type in addition to the six initial pages; no records are stored in localStorage/sessionStorage or a cross-account cache.

Invoice, user and audit lists now use account/role-scoped memory caching too: first pages preload after authentication (users/audit only for Super Admin), and revisiting cached pages or filters issues no list request. The invoice customer/driver filter option pages also preload for authorized managers and persist across navigation. Invoice saves/edits/prints invalidate invoice and audit variants; user writes invalidate user variants; master writes invalidate the corresponding filter options. Visible lists reset to the first page after invalidation, and matching counts refresh. Each resource retains its default first page plus eight additional query/cursor pages; list pages remain 20 rows and option pages 50. Logout/full reload discards memory, and cross-tab login/logout reloads other tabs via metadata-only BroadcastChannel where available. Changes from another browser/direct D1 still require refresh. Receipt/edit details and quantity requests remain live server reads.
