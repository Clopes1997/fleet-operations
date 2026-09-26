# Retirement Readiness

## Fleet migration validation

Run from the repository root after installing the existing Python virtual environment,
frontend dependencies, Docker Compose and Playwright browser:

```bash
npm run migration:test
npm run api:test
npm run web:check
npm --prefix apps/web run lint
npm run web:build
npm --prefix apps/web run test:browser
npm run migration:rehearse -- --snapshot tools/migration/fixtures/fleet-source.json --currency BRL --kind synthetic --out migration-runs/rehearsal-01
node tools/migration/verify-rehearsal.mjs migration-runs/rehearsal-01/migration-report.json
```

The rehearsal returns 2 for incomplete/unapproved readiness, 1 for failure. Exit 2 alone
does not prove a pass: the verifier checks mandatory evidence. Use a new output directory
for each run. Local browser tests use installed Chrome; Linux CI installs Chromium with
`cd apps/web && npx playwright install --with-deps chromium`.

The runner creates unique MySQL 8.4 volumes, initializes the clean Django lineage, imports
twice, reconciles actual fields/IDs/decimal totals, runs dedicated retirement tests on MySQL,
and exercises production containers through temporary HTTPS. Secure cookies, CSRF, sessions
and model permissions remain enabled. It restarts the application, dumps the target,
restores into a second empty MySQL database, verifies fingerprints and browser acceptance,
then switches back and compares again. Generated volumes are removed; reports remain.
No legacy database URL is accepted.

### Input and identity review

Version-1 service-orders/trucks-system bundles remain supported. Version 2 supports customer,
vehicle, order and history rows; see tools/migration/fixtures/fleet-source.json. Identity is
(source, installation, type, source ID). order.customer/order.vehicle and history.order use
source IDs. Quotes and FIPE values require decimal strings with at most two places. Quote
currency is explicit; FIPE valuations are BRL. Deadlines are calendar dates. Instants need
explicit offsets: naive timestamps are rejected. ImportRecord.payload retains original rows.

Preflight classifies exact matches, new records, conflicts, possible duplicates and invalid
records. Equal names/plates only suggest candidates; nothing is fuzzy-merged. Active plate
collisions, archived/active collisions, changed prior imports, missing references and
unsupported values block import. History must form an unambiguous ordered chain ending
at the source order status. Missing history/actors are never fabricated. Customer names
without actual relationships remain snapshots. Vehicle ownership is not modeled: supplied
ownership fields require review rather than being silently discarded.

preflight.json provides source IDs and candidate target IDs/fingerprints. review-template.json
is reusable and bound to a canonical source fingerprint. Example decisions:

```json
{
  "sourceSha256": "copy the exact value from preflight.json",
  "decisions": {
    "customer:c1": {"action": "map", "targetId": 12, "targetSha256": "copy candidate fingerprint"},
    "vehicle:v1": {"action": "new"},
    "vehicle:old": {"action": "skip", "reason": "Owner chooses archival-only retention"},
    "order:o1": {"action": "defer"}
  }
}
```

map requires matching fields and target fingerprint; it never overwrites a differing target.
new acknowledges possible duplication but cannot bypass active-plate uniqueness. skip
preserves raw evidence without an active target and leaves reconciliation REQUIRES_REVIEW;
references to skipped records block dependent imports. defer blocks import. Reruns require
the same decisions; changed sources or decisions are rejected.

Supply `--decisions path/to/review.json` to the root runner. It always starts empty.
Mapping to existing targets therefore requires a separately restored disposable target copy;
run the underlying commands inside apps/api with its configured virtual environment:

```bash
python manage.py migration_rehearsal preflight --snapshot /private/source.json --out /private/preflight.json
python manage.py migration_rehearsal import --snapshot /private/source.json --decisions /private/review.json --out /private/import.json
python manage.py migration_rehearsal reconcile --snapshot /private/source.json --out /private/reconciliation.json
```

These commands refuse databases unless FLEET_MIGRATION_DISPOSABLE=1 and DB_NAME starts with
rehearsal_. Never rename/reuse a live database to satisfy this safeguard; restore a copy.
Keep that disposable target stable while reviewing fingerprints. Review files are private
evidence, not public source code.

### Controlled FIPE verification

Offline tests cover exact decimal quotes/metadata, unavailable service, ambiguous year
selection and malformed responses. The read-only live probe follows service-provided catalog
codes, preserves metadata and never matches/values a local vehicle:

```powershell
apps/api/.venv/Scripts/python.exe tools/migration/fipe-live.py --live --out migration-runs/fipe-live.json
```

On Linux use apps/api/.venv/bin/python. Create the output parent first. Failure reports
REQUIRES_REVIEW; ordinary vehicle CRUD remains independent. The controlled probe passed
locally on 2026-09-25; future service availability is not guaranteed.

### Backup and rollback

Back up the full MySQL target, identity mappings, users/history, immutable source copies,
review decisions, application commit/image and deployment configuration. Store secrets
separately, outside reports and Git. target-backup.sql contains private records/password
hashes. SHA-256 checks identity; actual restoration and record comparison check usability.
Share only reviewed migration-report.json and migration-report.md. Raw source, SQL, review
files and temporary TLS private keys remain in the ignored rehearsal directory.

Automated rollback switches database routing at the same application commit. Actual version
rollback needs the previous application image and a compatible database snapshot. Stop writes
before the final snapshot/cutover, compare restored data and agree a write-free acceptance
window. Restoring an older snapshot after new writes loses those writes unless separately
reconciled. Do not run backward schema migrations on live data. For these legacy proof-of-concept sources, historical version rollback is N/A. Future production deployments must define their own version, downtime and consistency boundaries.


Source → Backup → Isolated restore → Preflight → Migration → Reconciliation → Acceptance tests → Restore/rollback test → Human review → Cutover approval → Source archival

**Passing automated checks does not authorize deletion or archival of the source.**

## Owner scope decision — 2026-09-26

The superseded legacy sources were proof-of-concept/development applications only.
No production data or production deployment existed. Therefore **real_source is N/A —
no production data existed**. Zero-byte database placeholders require no migration.
No further search for a production export is required.

**legacyVersionRollback is N/A — no legacy production data/deployment required
cross-version rollback**. This is separate from the mandatory rollback gate: the
consolidated application's same-version database routing, backup creation, isolated
restore, restart and observed-state comparison must still PASS. Synthetic fixtures test
migration machinery; they do not represent historical production data.

The scoped decision is recorded by applyProofOfConceptDecision in the report contract,
only for Inventory/Fleet synthetic rehearsals. It cannot exempt failed tests, restore
or any other automated gate. Future real imports require their own evidence and review.
Final owner acceptance and repository archival approval remain outstanding.

## Report contract

All projects use version 1 of tools/migration/report.mjs with migration-report.json and migration-report.md outputs. Copies live in each independent monorepo without a cross-repository runtime dependency.

PASS requires evidence. FAIL means a proven failure. REQUIRES_REVIEW means an unresolved semantic decision. NOT_RUN means absent execution evidence. Every applicable mandatory gate must pass before READY_FOR_OWNER_ACCEPTANCE. Synthetic fixtures never count as a successful real-source migration. N/A requires the explicit scoped owner decision below; it is neither PASS nor missing evidence. Generic inspection cannot grant exemptions. Owner acceptance and archival authorization are never inferred. Dirty code blocks readiness.

The snapshot command only fingerprints/parses JSON and records unexecuted gates. It is not an import or restore test:

~~~powershell
npm run migration:inspect -- --snapshot C:\Backups\export.json --application legacy-app --installation local-copy --kind real --out migration-runs\run-001
npm run migration:test
~~~

Use --kind synthetic for generated samples. Choose a new output directory for each run. Reports are never overwritten. Exit 1 indicates command/snapshot failure; 2 means inspection finished but readiness is incomplete.

Reports record source identity/hash, target commit/dirty state, timestamp, counts/totals, integrity, discrepancies, mapping policy, manual reviews, automated tests and restore/rollback evidence. Use safe identifiers and evidence labels, never credentials or raw record contents. Retain immutable raw exports separately in operator-controlled storage; do not commit real data or private reports.

## Operator boundaries

Read source copies only. Use a separate disposable target and unique database name/credentials. Never run a new lineage against a legacy database. Hash snapshots before/after. Reconcile exclusions explicitly. Backup creation is not proof: restore into a second empty target and compare counts, exact totals, references and acceptance behavior.

Rollback freezes writes and restores the compatible database and application version before reopening access. Do not run old code against a new schema. Post-cutover writes require explicit reconciliation; rollback may require downtime and must not silently discard them. Personal rollback uses browser backup restore and revision/stale-tab checks.

Adapters must record currency, units, timestamp interpretation and identity decisions. Never guess timezones, round silently or fuzzy-merge. Unresolved real-source requirements remain NOT_RUN. The owner-confirmed Inventory/Fleet proof-of-concept sources are explicitly exempt; generated fixtures remain labeled synthetic.

## Verified owner-decision rehearsal

Full candidate [CI 36225460938](https://github.com/Clopes1997/fleet-operations/actions/runs/36225460938) passed for 7286f3e on 2026-09-26.
The safe synthetic report is migration-runs/ci-7286f3e/migration-report.json (and .md): all applicable automated gates PASS, real_source and historical version rollback are explicitly N/A, and same-version routing rollback PASS is retained. Readiness is READY_FOR_OWNER_ACCEPTANCE; ownerAcceptance remains NOT_RUN and sourceArchivalAuthorized is false. This is technical eligibility to request archival approval, not an archival action.
