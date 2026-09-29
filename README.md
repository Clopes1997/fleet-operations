# Fleet operations

A fleet and service-order application for vehicles, customers, deadlines, quoted values, lifecycle history and FIPE reference valuations.

## Structure

- `apps/api`: Django 5.2 / Django REST Framework; Fleet, Customers, Service Orders,
  session authentication.
- `apps/web`: React 18 / TypeScript / Vite; existing truck forms/table retained.
- MySQL 8.4 is the production database. SQLite profiles are explicitly local/test only.
- Django migrations remain in their owning apps.

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

## Public demo (GitHub Pages)

Demo URL after activation: [Fleet Operations](https://clopes1997.github.io/fleet-operations/). Pages was disabled when checked on 2026-09-29; this URL is not yet verified live.

Deploy from `main` using GitHub Actions. No separate demo branch or duplicated application is needed. The existing React UI uses a read-only local Axios adapter only in Vite demo mode; normal development and production builds retain the real API.

From the repository root:

```sh
npm --prefix apps/web ci
npm --prefix apps/web run build:demo
npm --prefix apps/web run preview
```

Use `npm --prefix apps/web run dev:demo` for local demo development and `npm --prefix apps/web run test:demo` for adapter contract checks. Output: `apps/web/dist`. No demo secrets or environment variables are required. The build command selects `--mode demo`; never put backend credentials in Vite variables.

Activation: commit and push these changes to main, choose **Settings → Pages → Source → GitHub Actions**, then run the Deploy public demo workflow on main. Subsequent main pushes deploy automatically; pull requests only verify. Confirm the successful deployment URL before marking the project Preview on the portfolio.

Maintenance: Read-only fictional fixtures; writes and real integrations require the existing backend. Keep fixtures aligned with API response types when screens change. Unsupported requests fail locally instead of falling through to a server. Demo fixture code is omitted from normal production bundles. The existing container deployment remains the full-app production path. No server-side routing fallback is required. Relative demo assets work under the repository subpath.
