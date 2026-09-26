# Fleet operations

Migration validation now includes deterministic identity review, exact reconciliation and
disposable MySQL backup/restore acceptance. See [Retirement Readiness](RETIREMENT.md) for
commands, reusable review files and rollback boundaries. Passing checks never authorizes
archival of a source repository or migration of an unknown production installation.

A modular fleet and service-order application built from Trucks System, with the useful
Service Orders workflow integrated into Django and React. It manages vehicles, reviewed
customer records, generic or vehicle-linked service orders, deadlines, quoted values,
lifecycle history and independent FIPE reference valuations.

## Structure

- `apps/api`: Django 5.2 / Django REST Framework; Fleet, Customers, Service Orders,
  session authentication and reviewed imports.
- `apps/web`: React 18 / TypeScript / Vite; existing truck forms/table retained.
- MySQL 8.4 is the production database. SQLite profiles are explicitly local/test only.
- Django migrations remain in their owning apps. `SOURCE_PROVENANCE.md` records origin.

Service orders may have null customer/vehicle links and always retain their customer text
snapshot. Quoted amounts are decimal strings in the API and are not FIPE values, actual
costs, invoices or payments. No stock, telemetry, dispatch or accounting system is implied.

## Prerequisites and installation

Node 22.13+, npm and Python 3.11. Commands below are PowerShell, run from this monorepo root:

```powershell
python -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.lock.txt
npm run web:install
apps/api/.venv/Scripts/python.exe apps/api/manage.py migrate --settings=config.settings_local
apps/api/.venv/Scripts/python.exe apps/api/manage.py createsuperuser --settings=config.settings_local
npm run api:dev
```

In a second terminal at the root:

```powershell
npm run web:dev
```

Open `http://localhost:5173`. The web app proxies `/api` to Django on port 8000.
The explicit local profile uses `apps/api/local.sqlite3`, a development key and insecure
local cookies. It is not a production profile. On Linux/macOS, use the virtualenv's
`bin/python` in place of `Scripts/python.exe`.

## Verification and production preview

```powershell
npm run api:test
npm run web:check
npm --prefix apps/web run lint
npm run web:build
npm run web:preview
```

Preview still needs the API running. Browser tests start their own disposable SQLite backend
and preview server, so stop other listeners on ports 8000/5173 first:

```powershell
npm --prefix apps/web run test:browser
```

Locally this uses installed Chrome. The guarded smoke profile provisions only its fixture
account and writes `apps/api/.smoke.sqlite3`; it never points at a production database.
CI additionally configures MySQL tests. A configured CI job is not proof of a completed CI run.

## Authentication and permissions

Django sessions and CSRF protect writes, including login/logout. Production cookies are
Secure, HttpOnly for the session, and SameSite=Lax. There is no default production account.
Use Django users/groups/model permissions: view/add/change/delete on the relevant model.
Imports require a staff administrator. FIPE refresh requires vehicle change permission.
Operators can create service orders without calling FIPE.

Pending orders may become in-progress or cancelled; in-progress may become completed or
cancelled. Terminal states cannot reopen. Repeating the same status adds no duplicate
transition. Edits include the current version; stale changes are rejected. An unchanged
overdue deadline does not prevent an unrelated edit. Archives retain linked history.

## Production environment

Default settings require `SECRET_KEY` and use MySQL. Supply:

| Variable | Meaning |
|---|---|
| SECRET_KEY | Random, private Django signing key |
| DB_NAME / DB_USER / DB_PASSWORD | Production database and credentials |
| DB_HOST / DB_PORT | Database address; port defaults to 3306 |
| ALLOWED_HOSTS | Comma-separated public hostnames, without schemes |
| CSRF_TRUSTED_ORIGINS | Exact HTTPS origins, including scheme and optional port |
| DEBUG | Defaults false; keep false in production |
| MYSQL_ROOT_PASSWORD | Only for the included Compose database |

`requirements.lock.txt` pins the tested backend dependencies, including RSA support for
MySQL 8 authentication. Do not use local/test/smoke settings in production.

## Deployment

`compose.yaml` supplies persistent MySQL, Gunicorn and an Nginx static frontend/API proxy.
Set the listed environment values through your deployment secret mechanism or an ignored
root `.env`. Then, against a new empty target database:

```powershell
docker compose build
docker compose up -d db
docker compose run --rm api python manage.py migrate
docker compose run --rm api python manage.py createsuperuser
docker compose up -d
```

The web listener binds to `127.0.0.1:8089`; put it behind your HTTPS ingress. Secure session
cookies intentionally require HTTPS in production. No migrations or administrator creation
run automatically on every API boot. Keep the database volume and test backups/restoration;
do not remove populated volumes to redeploy.

Django's database-backed application cannot be hosted by GitHub Pages alone. The configured
path is a persistent container host; no Vercel serverless conversion is introduced.
The frontend proxy exposes the application API, not the Django admin site.

## Data migration

Never run the old Service Orders drop/populate/depopulate migrations or endpoints against
source data. Export consistent backups including archived rows. The target provides
administrator-only `POST /api/imports/preview/` and `POST /api/imports/apply/`, also available
in the Imports screen. The bundle is:

```json
{
  "version": 1,
  "source": "service-orders",
  "installation": "office",
  "rows": [{
    "id": "123",
    "cliente": "Original customer text",
    "descricao": "Historical job",
    "valor": "12.34",
    "prazo": "2020-01-01",
    "status": "concluido",
    "deleted_at": null
  }]
}
```

For `source: "trucks-system"`, rows use `id, license_plate, brand, model,
manufacturing_year, fipe_price, deleted_at`. Price/value fields must be decimal strings.
Optional created_at/updated_at/deleted_at timestamps require explicit offsets; deadlines
are plain calendar dates. Use 1–2000 rows and at most 2 MB per browser bundle.

Imports are atomic, preserve source identity/fingerprint/raw payload and skip identical
records. Changed identities and collisions require review. Customer/vehicle relationships
are never inferred from matching names. Imported completed jobs do not get invented
transition histories. Imports do not call FIPE.

Active vehicle plates have a MySQL-compatible unique field. The additive migration checks
existing active plates before schema changes and stops on invalid/duplicate plates. It
does not delete or merge them. Back up and rehearse restoration before any in-place upgrade.

## Known limitations and retirement gates

Local verification uses SQLite; real MySQL locking/DDL and container deployment require
the configured CI or a Docker/MySQL environment. FIPE tests mock the external service;
live availability, source code selections and vehicle/model-year correctness need review.
Old prices without metadata are shown as legacy references; vehicle edits do not silently
request or replace them.

The customer/vehicle suggestion lists show the first page; an explicit reviewed ID can
reference later records. Core list views preserve pagination. Historical sources, plate
reuse, organization ownership and quoted-value meaning still require reconciliation.
No legacy application, credential or production data has been removed or cut over.


Retirement scope and owner decisions (2026-09-26) are recorded in [RETIREMENT.md](RETIREMENT.md). Passing automated checks does not authorize deletion or archival of the source.
