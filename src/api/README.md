# Renderer API contract

Renderer code imports only `api` from this directory. `createApiClient` selects
the Electron adapter when the preload bridge is present and otherwise creates
the HTTP adapter. Tests may construct either adapter directly.

The methods and their asynchronous return values match `public/preload.js`:

| Area | Methods |
| --- | --- |
| exams, lectures, todos, moodle, modules | `getAll()`, `create(item)`, `update(item)`, `delete(id)` |
| studyLogs | `getByExam(id)`, `getByTodo(id)`, `create(log)`, `delete(id)` |
| settings | `get()`, `save(partialSettings)` |
| iCal | `fetch(url)` |
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
`/backup/export`, and `/ollama/setup/retry`. Ollama progress is read from the
SSE endpoint `/ollama/setup/events`.

All requests send `credentials: include`; authentication remains cookie-based.
Non-success responses and network failures reject with `ApiError`, carrying
the HTTP `status` and parsed response `body` when available.
