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
