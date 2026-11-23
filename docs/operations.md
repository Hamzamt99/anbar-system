# Production operations

## Ownership and deployment

The client's Cloudflare account, domain, D1 database and repository must remain client owned. Operator access should be least privilege, with MFA. Do not put credentials in Git, CLI arguments or support messages. Revoke any previously shared access tokens and replace them through the provider's secure credential mechanism.

Deploy only from `optimization` for this release. Do not merge main. Verify `git branch --show-current`, `npm ci`, `npm run lint`, `npm test`, `npm run test:browser`, `npm run test:recovery`, `npm run build:worker` and `npm audit --audit-level=high` before deployment. CI has no deployment job and no production credentials. JavaScript only: no TypeScript check applies.

**Workers Paid is required.** Hosted native PBKDF2 rejects 600k iterations although local workerd accepts them. The app uses Noble PBKDF2-SHA256 at 600k, with a 3,000ms invocation CPU budget. Local inspector measurements are recorded in the optimization report; verify the isolated synthetic probe on the hosted Paid account before deployment. Never remove the CPU budget just to bypass a Free-plan rejection. If the hosted probe exceeds budget, stop rollout and investigate; do not silently weaken password storage.

Before any migration/deployment:

1. Capture `git rev-parse HEAD`, current Worker deployment/version (`npx wrangler deployments list`), and a D1 bookmark (`npx wrangler d1 time-travel info anbar-db --json`). Store operator evidence privately; bookmarks/export URLs do not belong in public logs.
2. Run `npm run backup` with the encrypted-backup environment below. If the client has not provided a GPG public key, a one-time manual export may be kept only in a private 0700 directory, SQL mode 0600, on an encrypted operator disk; encrypt/move it offsite promptly. Do not publish Wrangler export output, which can contain signed download URLs.
3. Prepare the rollback bundle with `node scripts/build-rollback-worker.js`. It archives baseline 9b3d188 into ignored temporary storage and applies dual-hash verification, sanitized errors, current HTML headers and response privacy. It builds the matching baseline frontend and runs baseline API tests. It never checks out or merges main. Verify its Worker dry run.
4. After testing, deploy the compatible rollback bundle first (`npx wrangler deploy --config tmp/optimization/rollback-worker/wrangler.jsonc`) and privately record its version ID. This is the rollback point. The unmodified old Worker is NOT a valid authentication rollback after a 600k hash has been created.
5. Apply `npm run db:remote` once. Migrations 0006 and 0007 are additive controls/indexes and replace only the two quantity triggers. No records are reset. Check `PRAGMA foreign_key_check`, indexes, seven triggers and original table row counts before/after. A live client can add rows meanwhile; reconcile any differences rather than deleting them.
6. Run `npm run deploy` from optimization. Verify HTTPS HTML, API 401/no-store, CSP/HSTS, immutable assets and login with a client-owned account. Do not add test invoices or change real records to test production. Run writes against disposable databases only.

## Release verified on 2026-11-23

Workers Paid is active. Hardening release: `76085b30-c9d0-4c3e-a46e-82ac8cd8284b`. Latest deployment: `e768c4bb-5850-4b57-b05c-742e321e6adc` (mobile native-field containment); immediate rollback: `afd4c895-c1e1-4c6b-a934-a36ae5ff6a98` (same schema). Compatible rollback version: `9f97a91a-0f7d-4580-9f87-173adf85f634`. Original data was verified unchanged after migrations; physical printer acceptance was confirmed by the client. Configure the remaining notification/key/offsite/scheduler items below. Hosted staging smoke tests are reproducible with `node scripts/staging-smoke.js <isolated-config> <staging-url>`; it refuses the production database/name and requires an empty staging user table.

## Rollback

- Prefer **Worker rollback with the compatible version from step 4**, keeping the additive schema: `npx wrangler rollback <compatible-version-id>`. Refresh browsers to load the matching frontend. Worker versions include their static asset sets; old open tabs can request files from another version. If the platform version is no longer retained, rebuild and redeploy the compatible archived baseline rather than using an unmodified old password verifier. [Cloudflare rollback/version guidance](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/). Review the acknowledged temporary loss of optimized pagination/idempotency/version checks in that emergency baseline. Preserve export/bookmark first.
- Do not roll back to the unmodified main Worker after password upgrades: it only verifies 100k hashes and could lock upgraded users out. Never downgrade stored hashes.
- To reverse SQL, stop writes/announce maintenance, deploy compatible baseline, take a new export, then apply `rollbacks/0007_query_performance.sql` followed by `rollbacks/0006_invoice_integrity.sql` using private `--file` input. The down scripts preserve business records but remove new retry/version metadata and indexes. Test them on a copy first. Update D1 migration bookkeeping only after operator review; otherwise the next deployment could mistake reversed migrations for active ones.
- Time Travel is a whole-database recovery, not an ordinary migration undo. It discards legitimate changes after the recovery point. Obtain the client's decision and export current state before using it. Worker rollback does not roll back the database.

## Backups and retention

D1 Time Travel is automatically enabled: up to 30 days on Paid, seven on Free. See https://developers.cloudflare.com/d1/reference/time-travel/ .

- View recovery information: `npx wrangler d1 time-travel info anbar-db --json`.
- In an authorized incident, review the intended UTC timestamp, retrieve the appropriate bookmark using the CLI's documented info options, then `npx wrangler d1 time-travel restore anbar-db --bookmark <bookmark>`. Check `--help` for installed CLI syntax before an incident. Never run this as a test on production.
- Target RPO: minute-level through Time Travel while within retention; encrypted daily exports give a separate recovery point up to 24 hours old. These are operational targets, not a guarantee of zero loss.
- Target RTO: one to two hours for operator-led recovery. The small-fixture local drill does not establish a production-sized RTO.

`npm run backup` exports privately, encrypts with GPG, deletes temporary plaintext in `finally`, and retains only matching encrypted backups for 30 days. Set outside Git:

```
ANBAR_BACKUP_DIR=/private/offsite-synced/anbar
ANBAR_BACKUP_RECIPIENT=<client-GPG-public-key-fingerprint>
```

Import the client's public encryption key on a trusted operator machine. Keep its private decryption key offline and separately recoverable. Use a dedicated encrypted host/disk and a client-controlled offsite destination; local-only exports do not cover host loss. Provide a scoped Cloudflare credential using the host's secret store/environment. The script has no plaintext fallback. It suppresses Wrangler output to protect signed export URLs.

Daily scheduler template (install on that trusted host, not inside the application Worker):

```
0 2 * * * cd /path/to/anbar-system && /path/to/node scripts/backup.js >> /private/anbar-backup-status.log 2>&1
```

Ensure the scheduler has the required environment and correct Node/GPG paths. Alert if no encrypted backup is younger than 26 hours. The repository supplies the job/script; host installation, client public key, offsite storage and alert recipient require operator configuration. No extra Redis/KV/R2 service is needed for this small system.

## Restore drill and real restoration

`npm run test:recovery` creates separate synthetic local D1 source/target directories, applies actual migrations, exports source, imports into the empty target, compares counts and foreign keys, and verifies restored downstream quantity recalculation. It removes both databases afterwards and writes non-sensitive results to `tmp/optimization/recovery.json`.

D1 exports may list a referencing table before a later-added referenced master table. Before import into an EMPTY target, run:

```
python3 scripts/prepare-restore.py /private/export.sql /private/ordered-restore.sql
```

The preparer leaves the original export untouched, orders table creation before inserts and triggers, and enables deferred foreign keys. It rejects unfamiliar statement kinds rather than executing them. It does not log SQL. Review unknown export formats privately before extending it. Then import the prepared file into a dedicated recovery database (`wrangler d1 execute <recovery-name> --remote --file /private/ordered-restore.sql`). Never use the production name for a drill. Check counts, `PRAGMA foreign_key_check`, seven triggers, account roles, quantity groups, audit history, and print permissions before switching a binding. Decrypt an encrypted backup only in a private directory and remove plaintext after verification. Test decryption/key recovery periodically, separately from SQL restore.

## Monitoring and privacy

Committed configuration:

- Worker observability/logs enabled, head sampling 1, automatic invocation logs disabled to avoid capturing business URLs/query strings.
- API rejection/error events contain only a fixed event name, status and random request ID. No request bodies, IP/email, cookies, passwords, tokens, SQL or exception messages/stacks are logged. D1/internal failures are separate fixed events. Do not add `console.error(error)` back.
- API responses always no-store. Static cache contains only fingerprinted frontend assets; master data remains uncached.

Manual Cloudflare/dashboard steps (not claimed configured by source code):

1. Upgrade Workers Paid and confirm the 3s CPU setting, D1 storage/query usage and billing ownership.
2. Confirm logs ingestion and available retention in Workers Observability. Current Paid Workers Logs retention is seven days; verify current plan/product limits when enabling. Do not export logs containing full request metadata.
3. Configure an error/limit alert and verified client/operator email recipients in Notifications where the account supports it. Watch `api_failure`, `d1_failure`, `internal_error`, `login_failure`, 429, Worker exceptions/CPU-limit outcomes, and D1 reads/writes/storage. Proposed thresholds: >5% 5xx over five minutes (minimum 20 requests), any sustained D1/CPU-limit failure, or >20 failed logins in 15 minutes. Small traffic makes percentages noisy; tune after observing a week.
4. Configure usage/billing notifications before 80% of relevant allowances/budget. Prefer alerts to a hard spending cutoff that would unexpectedly stop invoice entry. If this plan does not expose a desired notification, document manual daily dashboard checks or use its supported monitoring API; do not claim a rule exists.
5. Verify HTTPS redirects/HSTS on the actual custom domain, DNS and expiry, MFA/account recovery, and ownership. HSTS deliberately omits includeSubDomains/preload.
6. Check encrypted-backup freshness daily and perform a monthly restore drill. Dashboard alert recipients, notification availability, scheduler and GPG key are manual prerequisites, not repository-managed resources.

Incident checklist: acknowledge → note UTC time/request IDs and scope without copying business data into chat → inspect fixed events and resource usage → contain (pause deployment/disable compromised credential) → export/bookmark → compatible Worker rollback or approved recovery → verify counts/relationships/login/print status → notify client → record root cause and preventive fix. Restore actions affecting live data require incident-specific approval.

## Printing and business boundaries

Use 220 × 190 mm custom paper, landscape dimensions, 100% scale, margins from receipt CSS, no Fit to page, and browser headers/footers OFF. Keep the original PNG. Operator confirmed on 2026-11-23 that long-value receipts print readably on one page without clipping on the actual factory printer. This is client-provided physical acceptance, not a printer observed remotely by the agent. Browser checks separately verify layout and quantities.

Printing records the application action before the dialog; canceling can still lock Admin edits. Keep this rule. Native browser printing cannot be proven or prohibited for an account allowed to view printable data. Current Data Entry receipt visibility is intentional existing behavior and unchanged. A new confirmation flow or restricted visibility needs a separate business decision.

Support: bug fixes mean failures of agreed behavior. One-month small changes should have a written time allowance. New modules, integrations, printer replacement, major changes, 24/7 response and third-party outages are not automatically included. No million-record capacity promise: use the measured local benchmark and monitor real deployment behavior.
