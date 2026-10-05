---
name: stress-testing
description: >
  Load and stress testing with Artillery for the notes app: smoke, load, stress, spike and soak tests against the
  API only, the web app (through the Next.js proxy), or the full stack with browsers. Covers goals and SLOs,
  scenario modeling, authentication, payload data, thresholds that fail the run, rate limiter handling, monitoring
  and result analysis. Use when asked to measure performance, capacity, breaking points, regressions, or to
  write or run Artillery tests.
---

# stress-testing (Artillery)

Pair with `security-check` (never load test shared or production systems) and `best-practices`. Artillery files are code: no comments (YAML `#` included), small and readable.

## 1. Rules

1. **Never run against production or any shared environment.** Only a dedicated, production-like stack that you started for the test (local compose profile or a throwaway environment).
2. Define the question first. Without a goal, there is no pass or fail.
3. Every test has **thresholds** that fail the run (`ensure`). A run without thresholds is only an experiment.
4. Seed users and data before the run; never create unbounded data. Reset or destroy the environment afterwards.
5. Do not disable security controls to pass a test. Rate limiters are part of the system; see section 6.
6. Record the environment (commit, container versions, CPU/RAM limits, data volume) with every result.

## 2. Test types

| Type | Purpose | Shape |
| --- | --- | --- |
| Smoke | Is the script correct and the system alive | 1 to 5 users for 30 s |
| Load | Behavior at expected traffic | ramp to the expected arrival rate, hold 5 to 15 min |
| Stress | Find the breaking point | keep ramping until errors or latency exceed thresholds |
| Spike | Sudden surge and recovery | low, instant jump, low again |
| Soak | Leaks and degradation | moderate steady load for 1 to 4 hours |

Run smoke first, always.

## 3. Layout

```
stress/
  package.json                 devDependency artillery and plugins
  shared/
    processor.cjs              helper functions (data, auth, ids)
    users.csv                  generated seed users (email,password)
    tiptap.json                sample documents
    seed.cjs                   creates users through the API and writes users.csv
  api/
    smoke.yml  load.yml  stress.yml  spike.yml  soak.yml
  web/
    load.yml                   through the Next.js proxy (cookie auth)
  fullstack/
    mixed.yml                  HTTP users plus Playwright browser users
  results/                     JSON outputs (git-ignored)
```

Install: `pnpm --filter stress add -D artillery`. Scripts in `stress/package.json`:

```json
{
  "name": "stress",
  "private": true,
  "scripts": {
    "seed": "node shared/seed.cjs",
    "api:smoke": "artillery run api/smoke.yml --output results/api-smoke.json",
    "api:load": "artillery run api/load.yml --output results/api-load.json",
    "api:stress": "artillery run api/stress.yml --output results/api-stress.json",
    "web:load": "artillery run web/load.yml --output results/web-load.json",
    "full:mixed": "artillery run fullstack/mixed.yml --output results/full-mixed.json"
  }
}
```

## 4. Environment for meaningful numbers

- A compose profile `stress` that mirrors production: `APP_ENV=production`, `APP_DEBUG=false`, opcache on, `php artisan optimize`, real queue workers, PostgreSQL with realistic `shared_buffers`, MinIO and Meilisearch running, Next.js `build` + `start` (not `dev`), CPU and memory limits set.
- The load generator runs **outside** the system under test (another machine or at least separate resources) so it does not steal CPU.
- Pre-load realistic data volume (for example 1000 users with 50 notes each, some with images) so queries and indexes behave like real life.
- Warm up caches and connection pools before measuring (first phase is a warm-up and is excluded from conclusions).

## 5. API script

Authentication is a bearer token from `POST /api/v1/auth/login` per virtual user; users come from the CSV so each user has its own rate-limit bucket.

```yaml
config:
  target: "http://localhost:8000"
  phases:
    - name: warm up
      duration: 60
      arrivalRate: 2
      rampTo: 10
    - name: expected load
      duration: 600
      arrivalRate: 10
      rampTo: 30
    - name: sustain
      duration: 300
      arrivalRate: 30
  payload:
    path: "../shared/users.csv"
    fields: ["email", "password"]
    order: "sequence"
    skipHeader: true
  processor: "../shared/processor.cjs"
  http:
    timeout: 20
    maxSockets: 100
  defaults:
    headers:
      Accept: "application/json"
  plugins:
    ensure: {}
    metrics-by-endpoint:
      useOnlyRequestNames: true
  ensure:
    thresholds:
      - http.response_time.p95: 400
      - http.response_time.p99: 900
    maxErrorRate: 0.5
scenarios:
  - name: writer session
    weight: 6
    flow:
      - post:
          name: login
          url: "/api/v1/auth/login"
          json:
            email: "{{ email }}"
            password: "{{ password }}"
            device_name: "web"
          capture:
            - json: "$.data.token"
              as: "token"
          expect:
            - statusCode: 200
      - post:
          name: create note
          url: "/api/v1/notes"
          headers:
            Authorization: "Bearer {{ token }}"
          json:
            title: "Stress note"
          capture:
            - json: "$.data.id"
              as: "noteId"
          expect:
            - statusCode: 201
      - loop:
          - think: 3
          - patch:
              name: autosave
              url: "/api/v1/notes/{{ noteId }}"
              headers:
                Authorization: "Bearer {{ token }}"
              beforeRequest: "attachDocument"
              expect:
                - statusCode: 200
        count: 20
      - get:
          name: list notes
          url: "/api/v1/notes?limit=30"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: 200
  - name: reader session
    weight: 4
    flow:
      - post:
          name: login
          url: "/api/v1/auth/login"
          json:
            email: "{{ email }}"
            password: "{{ password }}"
            device_name: "web"
          capture:
            - json: "$.data.token"
              as: "token"
      - get:
          name: list notes
          url: "/api/v1/notes?limit=30"
          headers:
            Authorization: "Bearer {{ token }}"
      - get:
          name: search notes
          url: "/api/v1/notes?search={{ term }}"
          beforeRequest: "pickSearchTerm"
          headers:
            Authorization: "Bearer {{ token }}"
```

`shared/processor.cjs`:

```js
const doc = require("./tiptap.json");

function attachDocument(requestParams, context, ee, next) {
  const paragraph = { type: "paragraph", content: [{ type: "text", text: `edit ${Date.now()} ${Math.random()}` }] };
  requestParams.json = { content: { type: "doc", content: [...doc.content, paragraph] } };
  return next();
}

const terms = ["meeting", "project", "idea", "todo", "recipe"];

function pickSearchTerm(context, ee, next) {
  context.vars.term = terms[Math.floor(Math.random() * terms.length)];
  return next();
}

module.exports = { attachDocument, pickSearchTerm };
```

Notes:
- Use `beforeRequest` for dynamic bodies; register functions in `processor`.
- Model **think time** (`think`) and realistic ratios. Autosave is the dominant write: about one `PATCH` every few seconds per active writer, which is far below the per-user limit.
- `expect` (via the `expect` plugin, add `expect: {}` under `plugins`) turns wrong status codes into counted failures. Without it, a 401 or 429 still counts as a completed request.
- Capture JSON with `$.data.<field>` (all responses are wrapped in `data`).
- Upload scenario: `formData` with a small fixture image, `POST /api/v1/notes/{{ noteId }}/images`; keep it a small weight (for example 5%) and watch MinIO and the queue.

## 6. Rate limiters

The limiters are real controls: `api` 120/min per user, `uploads` 30/min per user, `auth` 5/min per email and IP.

- Per-user limits are naturally respected when each virtual user has its own account (CSV). Do **not** reuse one account for many users.
- Login is limited per email and IP: log in **once per virtual user** and reuse the token; never loop on login.
- A load test that wants to measure raw capacity beyond these limits needs configurable limits: read them from `config('notes.rate_limits')` with environment overrides (`RATE_LIMIT_API`) and raise them only in the stress environment. Never ship raised limits to production.
- Run a separate scenario that **expects 429** after the limit to prove the limiters work under load; count 429s as expected there and as failures elsewhere.

## 7. Web through the Next.js proxy

The browser uses cookies; Artillery's HTTP engine keeps a cookie jar per virtual user, so the proxy flow works the same way. Requests must satisfy the proxy's CSRF check.

```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 300
      arrivalRate: 5
      rampTo: 20
  payload:
    path: "../shared/users.csv"
    fields: ["email", "password"]
    order: "sequence"
    skipHeader: true
  defaults:
    headers:
      Accept: "application/json"
      X-Requested-With: "notes-web"
      Origin: "http://localhost:3000"
  plugins:
    ensure: {}
    expect: {}
  ensure:
    thresholds:
      - http.response_time.p95: 600
    maxErrorRate: 1
scenarios:
  - name: web user
    flow:
      - get:
          url: "/login"
          expect:
            - statusCode: 200
      - post:
          name: login
          url: "/api/v1/auth/login"
          json:
            email: "{{ email }}"
            password: "{{ password }}"
          expect:
            - statusCode: 200
            - notHasProperty: "data.token"
      - get:
          name: notes page
          url: "/notes"
      - get:
          name: list notes
          url: "/api/v1/notes?limit=30"
          expect:
            - statusCode: 200
```

- Watch the proxy overhead: compare latency of `/api/v1/*` through port 3000 with the same calls straight to port 8000.
- Assert in the load run that no response body contains `token` (the `notHasProperty` expectation above): a security regression shows up under load too.
- Rotation: seed users whose token is near expiry to exercise refresh coalescing under concurrency.

## 8. Full stack with browsers (Playwright engine)

Mix cheap HTTP users with a few real browsers to measure what users feel (render, hydration, editor responsiveness).

```yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 300
      arrivalRate: 1
  engines:
    playwright: {}
  processor: "./browser.cjs"
scenarios:
  - name: browser user
    engine: playwright
    testFunction: "editNote"
```

```js
async function editNote(page, vu, events, test) {
  await test.step("login", async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(vu.vars.email);
    await page.getByLabel("Password").fill(vu.vars.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/notes");
  });
  await test.step("type and autosave", async () => {
    await page.getByRole("button", { name: /new note/i }).click();
    await page.getByRole("textbox", { name: "Note content" }).fill("load test");
    await page.getByText("Saved").waitFor();
  });
}

module.exports = { editNote };
```

Browsers are expensive: keep arrival rates low (single digits), run them on a separate machine, and combine them with a heavier HTTP scenario in the same file using weights or separate runs started together. Verify the Playwright engine API in the installed Artillery version.

## 9. Metrics and thresholds

Define SLOs before running. Starting points for this app on the stress environment (adjust to hardware):

| Operation | p95 | p99 | Error rate |
| --- | --- | --- | --- |
| login | 500 ms | 1 s | 0% unexpected |
| list notes | 200 ms | 500 ms | < 0.5% |
| autosave `PATCH` | 300 ms | 800 ms | < 0.5% |
| search | 300 ms | 800 ms | < 0.5% |
| image upload (small) | 1.5 s | 3 s | < 1% |

Read in the report: `http.response_time` (min, mean, median, p95, p99, max), `http.codes.*`, `vusers.created`, `vusers.failed`, `http.request_rate`, per-endpoint timings (metrics-by-endpoint), and `errors.*` (ETIMEDOUT, ECONNRESET, EADDRNOTAVAIL mean the generator or the target is saturated).

`ensure` fails the process (non-zero exit) when thresholds are missed, so it can gate CI for smoke and small load profiles.

## 10. Observe the system during the run

- `docker stats` for CPU, memory and network of each container; PHP-FPM status (active vs max children), nginx 502/504, PostgreSQL connections and slow queries (`pg_stat_statements`, `pg_stat_activity`), queue length (`jobs` table or queue size), Meilisearch indexing tasks, MinIO latency.
- Correlate latency spikes with a resource (CPU saturation, connection pool exhaustion, lock waits, queue backlog, GC).
- A stress run ends when thresholds break; record the arrival rate at that point and the first resource that saturated.

## 11. Analysis and tuning loop

1. Establish a baseline from a clean load run and commit the summary (not raw files) to the task doc.
2. Change **one** thing at a time (PHP-FPM children, DB pool, indexes, query shape, Next.js instances, cache) and rerun the same profile.
3. Compare p95 and error rate with the baseline; keep the change only if it improves the target metric without breaking others.
4. Typical findings here: N+1 or unindexed list/search queries, large `jsonb` reads in lists, synchronous Scout indexing, too few PHP-FPM workers, nginx body size limits on uploads, proxy overhead, connection pool limits, queue worker count.
5. Fix the cause in code or configuration under the normal rules (tests, strict types, no comments), then re-measure.

## 12. Checklist before running

- [ ] Dedicated stress environment, production-like settings, not shared, not production.
- [ ] Users and data seeded; unique account per virtual user; logins once per user.
- [ ] Thresholds defined and in the script; smoke run passes first.
- [ ] Rate limiters left on (or raised only through stress-only configuration).
- [ ] Monitoring ready; results directory git-ignored; environment details recorded.
- [ ] Script has no comments and no hardcoded secrets.
