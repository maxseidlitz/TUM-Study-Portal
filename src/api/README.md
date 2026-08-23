# Renderer API contract

Renderer code imports only `api` from this directory. `createApiClient` selects
the Electron adapter when the preload bridge is present and otherwise creates
the HTTP adapter. Tests may construct either adapter directly.

The method surface matches `public/preload.js`. Return semantics are explicit:

- Reads return their data and reject on transport failures.
- Commands (CRUD, settings/chat writes) reject on transport or business
  failure. This prevents optimistic UI state from being committed after a
  failed write.
- iCal, AI, Mensa and backup methods return `{ success: boolean, ... }`.
  Expected/HTTP failures are represented as `{ success: false, error }` in
  both adapters because existing UI consumers inspect that result.
- `openExternal` resolves/returns `false` for invalid URLs or launch failures.

| Area | Methods |
| --- | --- |
| exams, lectures, todos, moodle, modules | `getAll()`, `create(item)`, `update(item)`, `delete(id)` |
| studyLogs | `getByExam(id)`, `getByTodo(id)`, `create(log)`, `delete(id)` |
| settings | `get()`, `save(partialSettings)` |
| auth | `logout()` |
| iCal | `fetch(url)`, `replace(items)` |
| AI | `recommend(context)`, `chat(payload)`, `models(options)` |
| chats | `getAll()`, `get(id)`, `save(session)`, `delete(id)` |
| mensa | `fetch(canteenId)` |
| Ollama setup | `getSetupState()`, `retrySetup()`, `onSetupProgress(callback)` |
| backup | `export()`, `import(json)` |
| browser integration | `openExternal(url)` |

## HTTP mapping

The browser adapter uses same-origin `/api/v1` by default, configurable through
`REACT_APP_API_BASE_URL`. Entity resources use REST conventions (`GET`/`POST`
on the collection and `PUT`/`DELETE` on `/:id`). Settings updates use `PATCH`.
Action endpoints are grouped by area, for example `/ai/chat`, `/ical/fetch`,
`/ical/replace`, `/auth/logout`, `/backup/export`, and `/ollama/setup/retry`.
Ollama progress is read from the
SSE endpoint `/ollama/setup/events`.

All requests send `credentials: include`; authentication remains cookie-based.
Mutating requests require a CSRF token and send it as `X-CSRF-Token`. The
browser default reads `<meta name="csrf-token" content="...">`; integrations
may configure `csrfToken` (value/provider), `csrfHeaderName`, or explicitly set
`csrf: false` only when another server-enforced CSRF defense is in place.
GET/HEAD do not require or send the token.

Non-success responses and network failures reject with `ApiError`, carrying
the HTTP `status` and parsed response `body` when available, except for the
result-envelope methods listed above.

## Settings and secrets

Electron settings are local: `settings.get()` may return the locally persisted
`geminiApiKey`, matching the existing desktop behavior.

The self-hosted HTTP settings DTO is different. A response must never contain
`geminiApiKey`; it may contain only `geminiApiKeyConfigured: boolean`. The
adapter also strips an accidentally returned key as defense in depth. On
`settings.save()`, a newly entered non-empty `geminiApiKey` is accepted as a
write-only field. Empty values are omitted so they cannot erase an existing
server secret accidentally. The server remains responsible for redacting the
response before transmission and storing the secret securely.

`openExternal` accepts only absolute `http:`/`https:` URLs. Browser windows use
`noopener,noreferrer` and explicitly clear `opener`; Electron validates in the
main process and denies renderer-owned child windows.

## iCal replacement

The browser adapter replaces imported lectures/modules through one
`ical.replace(items)` call. The server deletes prior iCal-owned rows and writes
the regrouped import in one SQLite transaction, so any failure rolls back the
complete replacement. Electron has no transactional JSON store and deliberately
keeps the existing sequential fail-fast path. Its `ical.replace` bridge method
returns an unsupported result and is not called by the renderer workflow.

In self-hosted mode Ollama URL and model are server-owned settings. Browser
writes for these fields do not change the provider target; the values returned
by `settings.get()` reflect `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
