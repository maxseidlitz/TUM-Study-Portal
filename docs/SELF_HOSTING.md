# Self-hosted deployment

## Prerequisites and security model

Use Docker Engine with Compose v2 on a Linux host. The image pins Node.js
22.14.0 on Debian Bookworm by its multi-platform registry digest; its build
stages include Python 3, `make` and `g++` so `better-sqlite3` and `argon2` can
install native binaries. The runtime contains neither that toolchain nor source
secrets and runs as the unprivileged `node` user.

Keep the service private with Tailscale whenever possible. In every topology,
use HTTPS, retain the application login, and expose only the reverse proxy.
The Compose example binds Node to host loopback.

## Configuration

Copy `.env.server.example` to `.env.server`, set mode `0600`, and replace every
placeholder. Compose reads this file at runtime; Docker does not copy it into
the image. `.env`, `.env.server`, and every other `.env.*` runtime file are
ignored by Git; only files ending in `.example` may be tracked. CI rejects
tracked runtime env files and common private-key formats.

Generate independent secrets:

```sh
openssl rand -base64 48 # SESSION_SECRET, then again for CSRF_SECRET
openssl rand -base64 32 # SETTINGS_ENCRYPTION_KEY, then again for BACKUP_KEY
```

Generate `APP_PASSWORD_HASH` interactively so the cleartext password is not
stored in the environment or shell history:

```sh
read -rsp 'Password: ' PW; printf '\n'
export PW
docker compose run --rm --no-deps -e PW app \
  node -e "require('argon2').hash(process.env.PW,{type:require('argon2').argon2id}).then(console.log)"
unset PW
```

The second command prints the hash. Put only that value in `.env.server` and
remove `APP_PASSWORD`. Alternatively, use the documented Node command in
`server/README.md` on a trusted machine with dependencies installed.

### Environment reference

| Variable | Required/default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Compose: `production` | Enables production validation. |
| `PUBLIC_ORIGIN` | required; HTTPS in production | Exact external origin, without a path. Must match browser `Origin`. |
| `HOST` | `127.0.0.1`; Compose: `0.0.0.0` | Node listen address. |
| `PORT` | `3443` | Node listen port. |
| `BUILD_DIR` | `./build`; image: `/app/build` | Built React files. |
| `DATABASE_PATH` | `./data/study-portal.sqlite` | SQLite database path. |
| `BACKUP_DIR` | `./data/backups` | Encrypted safety-backup directory. |
| `APP_PASSWORD_HASH` | this or `APP_PASSWORD` required | Argon2id application-login hash. |
| `APP_PASSWORD` | bootstrap only | Cleartext bootstrap password; do not use for steady-state deployment. |
| `SESSION_SECRET` | required, at least 32 chars | Session-cookie signing secret. |
| `CSRF_SECRET` | required, at least 32 chars | Independent CSRF signing secret. |
| `SESSION_TTL_MS` | `604800000` | Session lifetime in milliseconds. |
| `SECURE_COOKIES` | `true` | `false` is rejected in production. Development/test permits it only with an HTTP origin on exactly `localhost`, `127.0.0.1`, or `[::1]`; LAN/public origins fail startup. |
| `TRUST_PROXY` | `false` | Set true only behind the directly connected trusted proxy. |
| `SETTINGS_ENCRYPTION_KEY` | required, base64 32 bytes | Encrypts stored provider settings. |
| `BACKUP_KEY` | required, base64 32 bytes | Encrypts and authenticates `.enc` safety backups. Losing it makes them unrestorable. |
| `BACKUP_RETENTION` | `7` | Number of newest safety backups retained. |
| `ICAL_ALLOWED_HOSTS` | empty | Comma-separated exact HTTPS calendar host allowlist. |
| `MENSA_CANTEEN_IDS` | `421,422,423,530` | Allowed OpenMensa canteen IDs. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Server-owned Ollama endpoint; use `http://ollama:11434` with the Compose profile. |
| `OLLAMA_MODEL` | `qwen3:4b-instruct` | Server-owned model name. Pull it before first use. |
| `GEMINI_API_KEY` | empty | Optional server-owned Gemini key. Prefer a secrets manager. |
| `MAX_JSON_BYTES` | `1048576` | Maximum normal API JSON body size. |
| `MAX_IMPORT_BYTES` | `10485760` | Maximum backup-import body size. |
| `MAX_AI_CONTEXT_BYTES` | `65536` | Maximum serialized AI context. |
| `IMPORT_RATE_LIMIT` | `3` | Backup imports per hour. |
| `MAX_SSE_CONNECTIONS` | `5` | Concurrent Ollama progress streams. |
| `IMPORT_MAX_EXAMS` | `10000` | Import quota for exams. |
| `IMPORT_MAX_LECTURES` | `50000` | Import quota for lectures. |
| `IMPORT_MAX_TODOS` | `50000` | Import quota for tasks. |
| `IMPORT_MAX_MOODLE_COURSES` | `10000` | Import quota for legacy Moodle courses. |
| `IMPORT_MAX_MODULES` | `10000` | Import quota for modules. |
| `IMPORT_MAX_STUDY_LOGS` | `100000` | Import quota for study logs. |
| `IMPORT_MAX_CHATS` | `5000` | Import quota for chats. |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | both empty | Optional direct TLS pair. Prefer proxy TLS; configure both or neither. |
| `LOG_LEVEL` | `info` | Pino log level such as `debug`, `info`, `warn`, or `error`. |
| `VITE_API_BASE_URL` | build default `/api/v1` | Optional frontend build-time API base. Do not put secrets in any `VITE_*` value. |

## Start and update

```sh
cp .env.server.example .env.server
chmod 600 .env.server
# edit .env.server
docker compose build --pull app
docker compose up -d app
docker compose ps
curl --fail http://127.0.0.1:3443/healthz
```

For Ollama, set `OLLAMA_BASE_URL=http://ollama:11434`, then:

```sh
docker compose --profile ollama up -d
docker compose exec ollama ollama pull qwen3:4b-instruct
```

Both Compose services set `no-new-privileges:true` and drop all Linux
capabilities. Ollama remains writable only through its named model volume; do
not add capabilities to work around host-device/GPU configuration errors.

To update, first take a backup, fetch the reviewed source revision, then run:

```sh
docker compose build --pull app
docker compose up -d --no-deps app
docker compose ps
```

Keep the prior source revision/image tag until health and login checks pass.
Rolling back means checking out that revision, rebuilding, and running the same
`up` command. Database migrations are forward-only, so preserve the pre-update
backup for a data rollback.

The Compose project is explicitly named `tum-study-portal`; persistent volumes
are therefore always `tum-study-portal-data` and
`tum-study-portal-ollama`, independent of checkout-directory names.

### Updating pinned upstream artifacts

`Dockerfile` and `docker-compose.yml` pin Node and Ollama as `tag@sha256`.
Resolve a new multi-platform digest from the registry, update both the
human-readable tag and digest, and let CI build and start the result:

```sh
docker buildx imagetools inspect node:22.14.0-bookworm-slim
docker buildx imagetools inspect ollama/ollama:0.24.0
```

Use the manifest-list/index digest shown by these commands, never a digest from
an unrelated architecture. GitHub Actions are pinned to full commit SHAs.
Desktop Ollama downloads are pinned to v0.24.0 and checked against SHA-256
digests published on that GitHub release. Dependency updates must update those
pins explicitly; CI verifies the pin format, Compose config, Caddy config,
non-root runtime, healthcheck, and persistent-volume write access.

## HTTPS with a domain and Caddy

Point an A/AAAA record at the host, allow inbound TCP 80/443, and keep port
3443 private. Install Caddy on the host and use `deploy/Caddyfile`:

```sh
export APP_DOMAIN=study.example.com
export APP_UPSTREAM=127.0.0.1:3443
export ACME_EMAIL=admin@example.com
caddy validate --config ./deploy/Caddyfile
sudo --preserve-env=APP_DOMAIN,APP_UPSTREAM,ACME_EMAIL \
  caddy run --config "$PWD/deploy/Caddyfile"
```

For a system service, place those values in Caddy's protected environment
file. Set `PUBLIC_ORIGIN=https://study.example.com` and `TRUST_PROXY=true`.
Caddy obtains and renews public certificates automatically. Do not place TLS
private keys or environment files in the image.

## Private Tailscale deployment

Install Tailscale on the host, enable MagicDNS, and do not open public firewall
ports. A simple HTTPS proxy is:

```sh
sudo tailscale up
sudo tailscale serve --bg https / http://127.0.0.1:3443
tailscale serve status
```

Set `PUBLIC_ORIGIN` to the exact HTTPS URL shown by `tailscale serve` and set
`TRUST_PROXY=true`. Restrict access with Tailscale ACLs/grants to the intended
users and devices. Tailscale transport encryption does not replace the app
password, secure cookies, or backup encryption.

## Backup and restore

Application JSON exports identify themselves with
`format: "tum-study-portal-backup"` and `formatVersion: 1`. Versioned imports
must contain every defined collection array. Formatless desktop exports are
accepted for compatibility only if they contain at least one recognized
collection with a domain element. Empty objects, empty legacy collections,
unrelated JSON, unsupported versions, and
incomplete versioned exports fail validation before a safety backup or database
mutation.
Electron and server exports use the same envelope and cross-import. Electron
creates a UUID-suffixed pre-import backup for every accepted import, independently
of its daily backup, retains 20 pre-import and 7 daily backups separately, and replaces
its JSON store through a temporary-file rename with in-memory rollback on error.

SQLite uses WAL; never copy only the live `.sqlite` file. For a consistent
full-volume backup, briefly stop the app and archive the complete volume:

```sh
mkdir -p backups
docker compose stop app
ARCHIVE="study-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
docker run --rm \
  -v tum-study-portal-data:/data:ro \
  -v "$PWD/backups:/out" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
  tar -czf "/out/$ARCHIVE" -C /data .
test -s "backups/$ARCHIVE"
docker compose start app
```

Encrypt archives (for example with `age`), copy them off-host, rotate them,
and regularly test restore on a separate volume. Protect `.env.server` and the
`BACKUP_KEY` separately; an archive without its keys is insufficient.

To restore an application-generated encrypted `.enc` backup, stop the app and
run the built-in integrity-checking restore:

```sh
docker compose stop app
docker compose run --rm --no-deps app \
  node server/restore.js /var/lib/tum-study-portal/backups/FILE.enc
docker compose up -d app
```

For a full archive restore, use the exact named volume. The first command below
creates a rollback archive before replacing anything:

```sh
RESTORE_ARCHIVE="$PWD/backups/study-data-YYYYMMDDTHHMMSSZ.tar.gz"
test -s "$RESTORE_ARCHIVE"
mkdir -p backups
docker compose stop app
ROLLBACK="pre-restore-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
docker run --rm \
  -v tum-study-portal-data:/data:ro \
  -v "$PWD/backups:/out" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
  tar -czf "/out/$ROLLBACK" -C /data .
test -s "backups/$ROLLBACK"
docker run --rm \
  -v tum-study-portal-data:/data \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
  sh -eu -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
docker run --rm \
  -v tum-study-portal-data:/data \
  -v "$(dirname "$RESTORE_ARCHIVE"):/restore:ro" \
  -e ARCHIVE="$(basename "$RESTORE_ARCHIVE")" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce \
  sh -eu -c 'tar -xzf "/restore/$ARCHIVE" -C /data'
docker compose up -d app
docker compose ps
curl --fail --retry 10 --retry-delay 2 http://127.0.0.1:3443/readyz
```

Then verify login, entity counts, and a representative write. Keep the rollback
archive until those checks and `PRAGMA foreign_key_check` on a test restore
have passed.

## Operational checks

- Monitor `/healthz` for liveness and `/readyz` for SQLite readiness.
- Keep Docker, the host OS, Caddy, and Tailscale patched.
- Review structured container logs with `docker compose logs app`.
- Test Safari installation, update acceptance, offline navigation, backup, and
  restore after deployment changes.
- The PWA deliberately has no background sync or offline write queue.
