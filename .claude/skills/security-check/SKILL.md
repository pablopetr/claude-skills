---
name: security-check
description: >
  Security gate for every change in this repository: checks the diff against the most common vulnerabilities
  (OWASP Top 10, injection, broken access control, XSS, CSRF, SSRF, insecure uploads, secrets, dependencies,
  Electron and Docker misconfiguration) and the project's security invariants. Run it before finishing any task
  that touches input handling, auth, authorization, files, storage, IPC, protocols, configuration, Docker,
  dependencies or the proxy, and as a final pass before every commit. Also use when the user asks for a
  security review or audit.
---

# security-check

Goal: make sure the change does not introduce a security issue. This is a gate, not a suggestion: a failed item must be fixed (or explicitly escalated to the user) before the work is considered done.

## How to run it

1. Collect the change: `git diff` and `git diff --staged` (or the files you edited). Identify which areas it touches: input, auth, access control, files, storage, network, rendering, IPC, config, Docker, dependencies.
2. Go through the **project invariants** (section 1), then every **area checklist** that applies (sections 2 to 10), then run the **commands** (section 11).
3. For each finding decide the severity (Critical, High, Medium, Low), fix it, and add a test that fails without the fix.
4. Report in plain prose, even when caveman mode is on, using the format in section 12. Security warnings are an exception to terse style.

## 1. Project invariants (a violation is always Critical)

- The login token is **never readable by JavaScript**: not in `localStorage`, `sessionStorage`, IndexedDB, JS-readable cookies, URLs, response bodies, logs, React state or props, or the Electron preload API. Only the proxy handles it (HttpOnly cookie on web, `safeStorage` on desktop).
- The web cookie is `HttpOnly`, `Secure` (except plain-HTTP local development), `SameSite=Lax`, `Path=/`, **no `Domain`**, `__Host-` prefix in production.
- The proxy forwards only `/api/v1/*`, drops client `Cookie` and `Authorization`, strips tokens from auth responses, and enforces CSRF checks on web (`X-Requested-With` plus same-origin).
- A user can never read, change or delete another user's note or image: policies answer **404** (`denyAsNotFound`), queries are scoped to the owner, search is filtered by `user_id` twice (engine filter and database `where`).
- `content_text`, `user_id`, `id` and tokens are never taken from client input. Tiptap `content` is validated by `ValidTiptapDocument` (node and mark allowlists, safe `href` and `src`, size and depth limits).
- Uploads: content-sniffed type allowlist (JPEG, PNG, GIF, WebP), size and dimension limits, SVG rejected, server-generated file names, rate limited.
- The API has no sessions, no cookies, CORS allows no origin, auth routes are rate limited, Sanctum tokens expire.
- Electron: `contextIsolation` and `sandbox` on, `nodeIntegration` off, navigation and new windows blocked, IPC sender and arguments validated, `file://` not used, permissions denied.
- No raw HTML rendering of user content (`dangerouslySetInnerHTML`, `innerHTML`).
- No secrets in the repository or in client bundles.

## 2. Injection (OWASP A03)

- **SQL**: use Eloquent/query builder bindings. No string-concatenated SQL. `DB::raw`, `whereRaw`, `orderByRaw`, `selectRaw` only with bound parameters and never with user input in identifiers; sort columns come from an allowlist.
- **Command**: no `exec`, `shell_exec`, `system`, `proc_open`, `child_process.exec` with user input. Use argument arrays (`spawn`/`Process` with arrays).
- **Search engine**: filters built with the builder (`where('user_id', ...)`), never by concatenating strings into Meilisearch filter expressions.
- **Template/Log/Header injection**: no user input in HTTP header names or values without validation; strip CR/LF.
- **Deserialization**: no `unserialize` on input, no `eval`.

## 3. Broken access control (A01)

- Every route is behind `auth:sanctum` except register, login, health and docs (docs disabled in production).
- Every model access goes through route model binding plus a policy (`Gate::authorize`) or a query scoped to the owner. No `find($request->id)` followed by use without a policy.
- IDOR: ids from the client are never trusted. Nested resources are checked against the parent (an image belongs to the note in the URL and to the same user).
- Mass assignment: explicit `$fillable`, ownership columns set from the authenticated user, never from input.
- Rate limits exist on auth, uploads and the general API.
- Admin or debug endpoints do not exist in production (Telescope, Horizon, Swagger UI behind `DOCS_ENABLED=false`).

## 4. Authentication and sessions (A07)

- Passwords hashed (`hashed` cast), minimum length enforced, no password in logs, responses, audits (`$auditExclude`) or error messages.
- Login failures return the same message for unknown email and wrong password.
- Tokens: expiring, revocable, rotated on refresh, hashed at rest, issued per device, revoked on logout.
- No credentials in URLs or query strings. No secrets in `.env.example`.
- Timing and enumeration: registration and login do not reveal which emails exist beyond the validation rule that is required.

## 5. XSS and client-side (A03/A05)

- No `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, `setTimeout(string)`.
- Rendering of note content only through Tiptap from validated JSON. Links: `http`, `https`, `mailto` only, `rel="noopener noreferrer nofollow"`. YouTube embeds only from `youtube.com`/`youtube-nocookie.com` hosts parsed with `URL` (never regex or `includes`).
- Image `src` only `http(s)` or `blob:` for local placeholders; no `data:` URLs persisted.
- CSP is strict (nonce-based scripts, `object-src 'none'`, `frame-ancestors 'none'`, `connect-src 'self'`); any new third-party origin must be justified and added narrowly.
- `target="_blank"` links always have `rel="noopener noreferrer"`.
- Open redirects: redirect targets (`next=`, `returnTo`) are validated against an allowlist of internal paths.

## 6. CSRF and cross-origin (A01/A05)

- State-changing proxy requests require `X-Requested-With: notes-web` and a same-origin `Sec-Fetch-Site` (or allowed `Origin`).
- Cookies are `SameSite=Lax` at least; no cookie is readable cross-site.
- The API itself has no cookies, so there is no CSRF surface there; CORS stays closed.
- No `Access-Control-Allow-Origin: *` with credentials, anywhere.

## 7. SSRF and outbound requests (A10)

- The API does not fetch URLs supplied by users. If a feature ever needs to, allowlist hosts, block private ranges and metadata addresses, and disable redirects.
- The proxy builds the upstream URL from the configured API origin plus the validated `/api/v1/` path only.

## 8. Files, storage and uploads (A04/A08)

- Validate type from content, size, dimensions; reject SVG and executables; generate the file name (`ULID.ext`); never use the client file name in a path (path traversal).
- Storage keys include the owning note id; deleting a note deletes files; public bucket paths are unguessable ULIDs (known trade-off: public-read bucket).
- Path resolvers (`notes://` renderer files) normalize and verify the resolved path stays inside the root.
- No user-controlled `include`/`require`/`readfile`.

## 9. Configuration, secrets and infrastructure (A05)

- `APP_DEBUG=false` and `APP_ENV=production` in production; no stack traces in responses; `/up` exposes nothing sensitive.
- Secrets only in environment variables or secret stores; none committed; `.env*` ignored except `.env.example`; no secrets in Docker images, compose files, CI logs or client bundles. Only `NEXT_PUBLIC_*` variables reach the browser, and none of them is a secret.
- Docker: no default or weak credentials outside local development, services not exposed publicly (Postgres, MinIO console, Meilisearch must not be internet-facing), non-root containers where possible, pinned image versions in production.
- Meilisearch master key and MinIO credentials are long and unique per environment.
- Security headers present: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production, CSP on the web app.
- Logging never includes tokens, passwords, cookies, note content or full request bodies.

## 10. Dependencies and supply chain (A06/A08)

- Run the audits (section 11) for every dependency change. Prefer fewer dependencies; justify each new one (maintenance, downloads, license, install scripts).
- Lockfiles committed (`composer.lock`, `pnpm-lock.yaml`); CI installs with `--frozen-lockfile` / `composer install`.
- Review `postinstall` scripts of new packages. Do not run installers piped from the network (`curl | bash`) without reading them.
- Skills, plugins and hooks added to the development environment run with full agent permissions: read them first.

### Electron-specific

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity` default.
- `shell.openExternal` only with validated `http(s)` URLs; `will-navigate` and `setWindowOpenHandler` deny everything else.
- Every `ipcMain` handler validates `senderFrame.url` and argument types; the preload exposes named methods only.
- Fuses applied; Electron kept current; auto-update only signed; no remote content loaded into privileged windows.

## 11. Commands to run

```bash
pnpm api:composer audit
pnpm audit --prod
git diff --staged | grep -n -i -E "(secret|password|passwd|token|api[_-]?key|private[_-]?key|authorization: bearer)" 
git diff --staged --name-only | grep -E "(^|/)\.env($|\.)" 
grep -rn -E "dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function" web packages desktop --include=*.ts --include=*.tsx
grep -rn -E "DB::raw|whereRaw|selectRaw|orderByRaw|shell_exec|exec\(|unserialize\(|file_get_contents\(.*request" api/app
grep -rn -E "localStorage|sessionStorage|indexedDB" web packages desktop --include=*.ts --include=*.tsx
grep -rn -E "nodeIntegration: true|contextIsolation: false|sandbox: false|webSecurity: false|allowRunningInsecureContent" desktop/src
```

Inspect every match. A match is acceptable only with a clear safe reason (for example a bound-parameter `whereRaw`, or `localStorage` used for a draft that contains no credential), and the reason must be obvious from the code without comments. If you cannot make it obvious, refactor.

Also run the project test suites; add tests for each fixed finding:

```bash
pnpm api:test
pnpm test
```

## 12. Report format

```
Security check: PASS | FAIL

Scope: <files or areas reviewed>

Findings
- [Critical|High|Medium|Low] <title>: <where, file:line>. <impact in one sentence>. <fix applied or required>.

Checked and clean: <list of areas verified>
Residual risk: <known trade-offs, for example public-read image bucket>
```

Never mark PASS while a Critical or High finding is open. Escalate unresolved findings to the user in full sentences.
