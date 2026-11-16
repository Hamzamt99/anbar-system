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
