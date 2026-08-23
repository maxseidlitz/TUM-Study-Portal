# Self-hosted backend

The CommonJS server implements the `/api/v1` contract used by
`src/api/httpApi.js`. It does not load Electron. SQLite migrations run before
the server starts, and all destructive imports run in one database
transaction.

## Configuration

Copy `.env.server.example` into the environment of the process manager. The
server intentionally does not read dotenv files itself.

Required values:

- `PUBLIC_ORIGIN`: exact HTTPS browser origin;
- `APP_PASSWORD_HASH`, or `APP_PASSWORD` for bootstrap mode;
- independent `SESSION_SECRET` and `CSRF_SECRET` values of at least 32
  characters;
- `SETTINGS_ENCRYPTION_KEY` for write-only Gemini keys;
- `BACKUP_KEY` before backup import can overwrite data;
- `ICAL_ALLOWED_HOSTS`: exact calendar hostnames accepted by the SSRF guard.

Operational limits default to 7 retained backups, 3 imports/hour, 5 concurrent
SSE setup streams, 10 MiB per import and 64 KiB of server-generated AI context.
Override them with `BACKUP_RETENTION`, `IMPORT_RATE_LIMIT`,
`MAX_SSE_CONNECTIONS`, `MAX_IMPORT_BYTES` and `MAX_AI_CONTEXT_BYTES`.
Collection quotas use `IMPORT_MAX_EXAMS`, `IMPORT_MAX_LECTURES`,
`IMPORT_MAX_TODOS`, `IMPORT_MAX_MOODLE_COURSES`, `IMPORT_MAX_MODULES`,
`IMPORT_MAX_STUDY_LOGS` and `IMPORT_MAX_CHATS`.

An Argon2id hash can be generated without storing the password in the
repository:

```bash
node -e "require('argon2').hash(process.argv[1],{type:require('argon2').argon2id}).then(console.log)" 'temporary-password'
```

Avoid leaving the cleartext argument in shell history. A secret manager or an
interactive administrative wrapper is preferable.

## Start and TLS

Build the existing React application first, then start the server:

```bash
npm run build
npm run server
```

For direct TLS, configure `TLS_CERT_PATH` and `TLS_KEY_PATH`. In the usual
deployment, bind the Node process to loopback and terminate HTTPS at a reverse
proxy. The proxy must preserve `Host` and `Origin`; set `TRUST_PROXY=true` only
for a trusted, directly connected proxy. Production session cookies are Secure,
HttpOnly, SameSite=Strict and use the `__Host-` prefix. When
`SECURE_COOKIES=false` is explicitly selected for local HTTP development, the
server uses unprefixed cookies because browsers reject `__Host-` cookies without
HTTPS. It also disables HSTS and CSP request upgrades for that local mode.
Startup rejects this setting in production and, in development/test, unless
`PUBLIC_ORIGIN` is HTTP on exactly `localhost`, `127.0.0.1`, or `[::1]`.

The server provides:

- `/healthz` for process liveness;
- `/readyz` for SQLite readiness;
- `/login` and `/logout`;
- authenticated `/api/v1/*`;
- an authenticated SSE stream at `/api/v1/ollama/setup/events`.

The SPA HTML is served dynamically after login so the current session CSRF
token can be injected. HTML and API responses are `no-store`; hashed static
assets are immutable.

## Data and migrations

`DATABASE_PATH` defaults to `data/study-portal.sqlite`. Migration files live in
`server/db/migrations` and are recorded in `schema_migrations`. The connection
uses foreign keys, WAL mode and a busy timeout.

The JSON backup endpoint remains compatible with the desktop export. New
exports carry `format: "tum-study-portal-backup"` and `formatVersion: 1`; a
versioned import must contain every defined array collection. Formatless
desktop backups remain accepted only when at least one recognized collection
contains a domain element, so `{}`, unrelated JSON and `todos: []` can never
mean “replace with empty”. Format validation occurs before the safety backup or any deletion.
Backups never export sessions, password material or Gemini keys. Before strict validation,
import normalizes legacy `text`/`dueDate`/`examId` Todos and migrates pre-module
desktop exports. Legacy module, slot and standalone-lecture IDs containing the
reserved `::` composite separator are deterministically remapped; module
references are rewritten to the same IDs. The validated data then replaces the
domain transactionally. Per-entity quotas, a dedicated hourly rate limit and
`MAX_IMPORT_BYTES` bound this destructive operation.

Safety backups are SQLite online backups encrypted with AES-256-GCM. Restore
while the server is stopped:

```bash
BACKUP_KEY=... DATABASE_PATH=... npm run server:restore -- /path/backup.enc
```

Restore verifies SQLite integrity and foreign keys and invalidates all restored
sessions. The previous database is retained with a timestamped
`.before-restore-*` suffix.
Backups are pruned to `BACKUP_RETENTION` newest encrypted files. Restore first
migrates and validates the temporary database and checkpoints both restored and
current WAL state. It fsyncs the prepared database and a verified hard-linked
(or copied) Previous file, removes checkpointed WAL/SHM sidecars, and performs
one same-directory atomic rename-over-existing. `DATABASE_PATH` therefore never
passes through an intentionally missing state. Run restore only while the
server is stopped and on a filesystem providing atomic same-directory rename.

## Network security

iCal accepts HTTPS only, exact allowlisted hosts, no credentials or custom
ports. Every redirect is revalidated. DNS answers containing private,
loopback, link-local, multicast or reserved addresses are rejected, and the
approved address is pinned into the TLS connection.

Mensa requests use the fixed OpenMensa hostname and an explicit canteen-ID
allowlist. Ollama's URL comes only from `OLLAMA_BASE_URL`; `ollamaUrl` received
from browser settings is ignored. Gemini always uses Google's fixed API host,
and API keys are neither returned nor included in request logs.
Ollama URL and model are server-owned and exposed read-only to the browser, so
setup checks and inference always use the same `OLLAMA_MODEL`.

`POST /api/v1/ical/replace` validates and regroups calendar items, deletes only
prior iCal-owned lectures/modules and inserts the replacement in one SQLite
transaction. Browser refresh uses this route. Electron retains its sequential
fail-fast JSON-store workflow.
Lecture PUT/DELETE validates the optional third composite-ID segment as a real
ISO calendar date before touching a slot override.

## Tests

```bash
npm run test:server
npm test
npm run build
```

Server tests use a temporary SQLite database and cover authentication, CSRF,
CRUD, nested modules, lecture overrides, settings secrets, chats, result
envelopes, atomic calendar replacement, current/legacy desktop backup fixtures,
reference-safe ID migration, crash-atomic restore ordering/failures, migration
repair, DNS/redirect policy, private-address rejection, and mocked Ollama/Gemini
Todo tool calls including validation, duplicate/action limits, and fallback.

## Deliberate fail-closed limitations

- Ollama is externally managed. Retry checks reachability and whether the
  configured model exists; it does not spawn binaries or pull multi-gigabyte
  models.
- AI chat sends a bounded, server-generated full-context snapshot and exactly
  one write tool, `create_todo`, to Ollama or Gemini. Tool arguments are strict,
  IDs are generated on the server, module references are checked, writes use
  the Todo domain validation and a SQLite transaction, and only confirmed
  writes appear in `todoActions`. Duplicate calls, unknown tools, invalid
  arguments, excessive iterations, and excessive actions fail closed. Models
  without tool support retain the read-only full-context fallback; free-form
  text or JSON is never interpreted as a write.
- Electron iCal replacement remains sequential and fail-fast because the
  desktop JSON store has no transaction primitive. Browser replacement is
  atomic.
- `APP_PASSWORD` is hashed in memory at each bootstrap start. Persistent
  deployments should replace it with `APP_PASSWORD_HASH`.
