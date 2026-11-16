# شركة العنبر للخرسانة

Complete Arabic RTL concrete delivery invoice application. React + Vite (JavaScript), React Router, Express on Cloudflare Workers, Cloudflare D1, and self-hosted Arabic fonts. The six approved PDF pages inform the login, master data, invoice form, list, user management, and A4 receipt.

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

Production uses HTTPS and HttpOnly, SameSite=Strict cookies; secure cookies are set on HTTPS requests. Local HTTP permits development cookies. Sessions expire after eight hours. Password hashes use Web Crypto PBKDF2-SHA256, 100,000 iterations (Workers Web Crypto supported limit), random 128-bit salts, and a 256-bit result. Login throttles each IP/email pair to ten attempts per 15 minutes. Password resets revoke all sessions for that user; role changes revoke their other sessions. Destructive actions have a confirmation dialog, and a Super Admin cannot delete or demote their currently signed-in account.

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
- Add customers, drivers, mix types, vehicles, and optional pumps through the five master-data tabs.
- Create invoices with searchable reference selectors, manual pour-location/chemical fields, quantities, times, and receiver. Quantities accept up to three decimal places and a maximum of 999999.999 per invoice.
- Each invoice has a unique, permanent serial number such as `INV-000001`. The same number appears in the invoice list, audit history, preview, and printed receipt; edits and reprints retain it.
- Saving opens the invoice details. “معاينة الطباعة” saves the current form and opens its printable receipt without marking it printed. Viewing an existing preview performs no writes.
- Admin and Super Admin can filter invoices by customer, driver, and date range. Results paginate in groups of 20. Data Entry can view the list and details and preview receipts, without filtering, editing, or recording a print action.
- “طباعة” records the first printed timestamp and invokes the browser print dialog. Canceling that dialog does not undo the recorded print action. Admin cannot edit the invoice afterward; Super Admin can.
- Print the receipt on A4 portrait at 100% scale. The stylesheet sets `@page` to A4 with zero browser margins and internal receipt margins. Turn browser header/footer printing off. The signature line is left blank for manual signing.

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

`npm test` uses an isolated Miniflare D1 database with the real migrations and Express routes; it does not substitute a SQLite file or mock database. Ten test groups cover authentication, cookies, CSRF, role permissions, master-data constraints, integer decimal quantities, customer/date resets, concurrent creation, old/new group recalculation, snapshot history, print locks, input validation, filtering, user lifecycle, logout, and session revocation.

`npm run test:browser` builds the app, applies migrations to a disposable local D1, generates a random temporary test credential, and runs Chromium against a real Wrangler Worker on port 8788. It exercises all master tabs, invoice creation and preview, user creation, list filters, role route protection, mobile width, and print styles. Screenshots of all screens go to ignored `tmp/screenshots`. Invoice filter selectors include deleted customers and drivers for historical searches; new-invoice selectors show active records only. The test removes its disposable D1 state and credentials afterward; normal local and remote data remain untouched.

`npm run format` formats maintainable source files. Dependency versions are locked in `package-lock.json`.

## Deployment status

Local migration, all ten API test groups, the full browser workflow, the production build, and the Worker deployment dry run have passed. See [VERIFICATION.md](VERIFICATION.md) for the execution report.

Production D1 migrations and Worker deployment have now completed with database `04b6d257-131e-4b69-9502-fd016f55ee0d`. Application URL: https://anbar-system.anbar-system.workers.dev. Create the first production Super Admin with `npm run admin -- --remote`.

Official integration reference: [Deploy an Express.js application on Cloudflare Workers](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/).

## Invoice audit history

Super Admins can open **سجل العمليات** from the navigation or from an invoice receipt. The read-only table records invoice creation, actual edits, and every print action with the authenticated user's email, invoice ID, and timestamp. Details show field values before and after changes. Filters support invoice ID, email, action, and date range, with 20 entries per page. Times and date filters use Asia/Amman.

Migration `0002_invoice_audit.sql` adds the `audit_logs` table and invoice audit actor columns. Database triggers write each event atomically with the invoice mutation, so a failed audit insert also rolls back that invoice change. Actor emails are preserved independently of user accounts, and audit rows reject UPDATE and DELETE. Automatic quantity recalculation does not create misleading manual-edit events. Passwords and session tokens are never part of the invoice snapshots.

Tracking begins when this migration and application update are installed. Historical edits made before audit logging existed cannot be reconstructed. Apply `npm run db:local` locally and `npm run db:remote` before deploying the update.
