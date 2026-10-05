---
name: e2e-tests
description: >
  Strategy for end-to-end testing of the notes app (API + web, desktop where possible): deriving scenarios from
  business rules, systematic edge-case catalog, deterministic data and environment, and measuring coverage so
  that every business rule and every line of code is exercised. Use when designing, writing, reviewing or
  expanding end-to-end or integration tests, when asked about test coverage across layers, or when planning
  a release test pass. Use cypress-tests for the Cypress implementation details.
---

# e2e-tests

End-to-end tests prove that the real system (browser, Next.js proxy, Laravel API, PostgreSQL, MinIO, Meilisearch, queue) satisfies the business rules. They do not replace unit and feature tests; they cover what only the whole system can show.

## 1. What "100% covered" means here

Coverage is measured on three independent axes. All three must be complete.

| Axis | How it is enforced | Gate |
| --- | --- | --- |
| **API code** | Pest feature and unit tests, PCOV | `pnpm api:test` with `--min=100` over `app/` |
| **Frontend and desktop-main code** | Jest unit/component tests plus Istanbul coverage from e2e runs, merged | thresholds in each package; every uncovered line is either tested or deleted |
| **Business rules and user journeys** | Traceability matrix `BR-xx` to tests | every rule in `plan.md` maps to at least one e2e test; a script fails when one does not |

100% line coverage from e2e alone is neither realistic nor the goal: e2e is slow and indirect. The rule is: **no business rule, journey or edge case is without an e2e test, and merged coverage reports show no untested reachable code**. Dead code found by coverage is deleted, not ignored. Coverage ignore comments are forbidden.

## 2. Test pyramid for this project

1. **Unit** (Jest, Pest unit): pure logic, controllers of state (autosave), parsers, policies, actions.
2. **Feature / integration** (Pest HTTP tests, Testing Library): endpoints, components with mocked API.
3. **End-to-end** (Cypress, `cypress-tests` skill): real stack, user journeys, cross-layer behavior (cookie proxy, uploads to MinIO, search indexing through the queue, autosave timing).
4. **Manual / packaged app** (desktop): Electron main process and packaging cannot be driven by Cypress. Cover with Jest unit tests of injected logic and the manual QA table in the desktop packaging task; Playwright's Electron support is the optional automation path.

Write each test at the lowest level that can prove the behavior. Use e2e for the rules that need the whole stack.

## 3. Derive scenarios from business rules

1. Open `plan.md` and list every `BR-xx` in scope.
2. For each rule write: the user-visible behavior, the happy path, and the failure and boundary cases (section 4).
3. Maintain `e2e/traceability.json` (rule id to spec files and test titles). Test titles start with the rule id, for example `BR-A2: saves 1 s after the last keystroke`.
4. A check script reads `plan.md`, extracts rule ids, and fails when an id has no test title starting with it (rules explicitly marked as unit-only in the matrix are exempt). Run it in CI.

## 5. Environment and determinism

Edge cases are only useful if failures are reproducible.

- **Isolated stack**: a dedicated compose profile or file for e2e (separate database `notes_e2e`, separate MinIO bucket, separate Meilisearch prefix), built like production (`APP_DEBUG=false`, optimized autoload) with PCOV only when coverage is collected.
- **Servers started before the tests** (never from inside a test): API, queue worker, scheduler, Next.js production build, then `cypress run`.
- **Data**: each test creates its own user through the API (unique email), so tests are independent, parallel safe and need no cleanup. Reset state in `beforeEach`, never in `afterEach`. Truncate and reseed the database only between suites, not between tests.
- **Time**: control time in the browser with `cy.clock()`/`cy.tick()` for debounce, max-wait, backoff and expiry tests; for server-side expiry create tokens with explicit expiry through a test-only seeding command (never a production endpoint).
- **Network faults**: simulate with `cy.intercept` (`forceNetworkError`, status overrides, delays); simulate API down by stopping the container in a dedicated resilience spec.
- **Async work**: the queue worker must run during e2e; poll through the UI or API with retry-able assertions, never fixed sleeps.
- **No shared mutable state** between specs; no ordering dependencies; each spec passes alone (`--spec`).
- **No third-party sites** (YouTube iframes are asserted by `src`, not loaded).

## 6. Edge-case catalog (apply to every feature)

For each feature walk this list and write a test for every item that can happen.

**Input**
- empty, whitespace only, `null`, missing field
- minimum and maximum length, one over the limit (title 255/256, content size just under and over 1 MB, search 100/101)
- unicode, emoji, right-to-left text, combining characters, very long unbroken strings
- HTML and script payloads in titles, text and alt text (must render inert)
- duplicate submissions, double click, rapid repeated keystrokes

**State and time**
- first use (empty state), exactly one item, exactly one page, one past a page (30/31 notes)
- expired, revoked and rotated tokens; token near expiry (rotation); parallel requests during rotation
- debounce boundaries (999 ms, 1000 ms), max-wait during continuous typing, retry backoff steps, cap at 30 s
- tab hidden, page closed, back/forward, reload during save, two tabs on the same note

**Authorization and isolation**
- other user's note by URL, API and search (must be 404 or absent), foreign image id inside a document
- unauthenticated access to every protected route; logged-in user visiting login pages
- CSRF attempts: missing `X-Requested-With`, cross-site origin

**Failure**
- API down, slow, 500, 422, 429, malformed JSON, network drop mid-upload
- search engine or storage unavailable
- queue delayed (search not yet updated)

**Files**
- each allowed type, each forbidden type (SVG, PDF, renamed `.png`), 10 MB and 10 MB + 1 byte, 10 and 11 files at once, zero byte file, huge dimensions, same file twice, drag a non-file (text) onto the editor

**Concurrency**
- two devices editing the same note (last write wins), delete while saving, upload while the note is deleted, autosave during note switch

**Responsive and accessibility**
- 375, 768 and 1280 px; keyboard only; screen-reader names for icon buttons; reduced motion; light and dark

**Security invariants**
- no token in any response body, storage, or `document.cookie`; the cookie is `HttpOnly`; CSP violations are zero on the main flows

## 7. Measuring coverage in e2e

### Frontend (Istanbul)

- Instrument the Next.js production-like build used for e2e (for Next 16 with SWC use `swc-plugin-coverage-instrument` or a Babel build with `babel-plugin-istanbul`; verify against the installed Next version). Instrument `packages/shared` as well (it is compiled by Next).
- Use `@cypress/code-coverage` in `cypress/support/e2e.ts` and `setupNodeEvents`; it writes `.nyc_output` and a report.
- Merge with Jest coverage: `nyc merge` over `coverage/jest/coverage-final.json` and `.nyc_output`, then `nyc report --check-coverage`.
- Configure `.nycrc.json` with `include` for `packages/shared/src` and `web/src`, `exclude` for generated types and tests, and thresholds (`lines`, `statements`, `branches`, `functions`) at the project's agreed level; raise them as coverage improves, never lower them.

### Backend during e2e (optional, for finding untested reachable code)

Backend line coverage is already gated at 100% by Pest. To see which code the **browser journeys** actually reach, collect coverage from the running PHP-FPM:

```php
<?php

declare(strict_types=1);

use SebastianBergmann\CodeCoverage\CodeCoverage;
use SebastianBergmann\CodeCoverage\Driver\Selector;
use SebastianBergmann\CodeCoverage\Filter;

require __DIR__.'/../../vendor/autoload.php';

$filter = new Filter();
$filter->includeDirectory(__DIR__.'/../../app');

$coverage = new CodeCoverage((new Selector())->forLineCoverage($filter), $filter);
$coverage->start($_SERVER['REQUEST_URI'] ?? 'cli');

register_shutdown_function(function () use ($coverage): void {
    $coverage->stop();
    file_put_contents(sys_get_temp_dir().'/e2e-cov/'.bin2hex(random_bytes(8)).'.cov', serialize($coverage));
});
```

Load it with `auto_prepend_file` in the e2e PHP image only, then merge with `phpcov merge`. Verify the API of the installed `php-code-coverage` version before relying on it. Never enable this in any shared or production environment.

### Reading the reports

- Uncovered line in code reachable by users: write the missing test (e2e or lower level).
- Uncovered line that is truly unreachable: delete the code.
- Uncovered defensive branch (error handling): cover it with a unit or feature test, or with a fault-injection e2e (`forceNetworkError`).
- Optional quality check: mutation testing (Infection for PHP, Stryker for TypeScript) on critical modules (autosave controller, proxy, policies, Tiptap rule) to verify that tests fail when behavior changes.

## 8. Writing good e2e tests

- One behavior per test, named after the rule and the outcome. Several assertions per test are fine; do not split into one assertion per test.
- Arrange through the API (fast), act through the UI (what the user does), assert on the UI **and** the persisted state (reload, or a direct API read through the same session).
- Select with stable `data-cy` attributes; wait on network aliases and retry-able assertions; never `cy.wait(<ms>)`.
- Keep tests short and linear: no conditionals, no loops that hide failures, no shared variables across tests.
- Page helpers and custom commands for repeated flows (login, create note, type in editor, drag files); keep them small and typed.
- No comments in test code. The title and the helper names are the documentation.
- Flaky test policy: fix the cause (missing wait, shared state, time). Retries (`retries: { runMode: 1 }`) only as a safety net, never to hide a flake, and a test that needed a retry is investigated.

## 9. CI pipeline

1. Build images, start the e2e stack (API, queue, scheduler, Postgres, MinIO, Meilisearch), migrate and seed.
2. Build and start the instrumented web app.
3. Run Pest with the 100% gate and Jest with thresholds.
4. Run Cypress headless in Chrome with video on failure and screenshots; upload artifacts.
5. Merge coverage, enforce thresholds, run the traceability check.
6. Fail the pipeline on any gate.

## 10. Review checklist

- [ ] Every business rule in scope maps to at least one e2e test (traceability check passes).
- [ ] Edge-case catalog walked for each feature; missing items justified in the task doc.
- [ ] Tests are independent, deterministic, parallel safe; no sleeps; time controlled by fake clock.
- [ ] Coverage reports reviewed; uncovered reachable code has a new test or was deleted; no ignore comments.
- [ ] Security invariants asserted (no token exposure, cookie flags, CSP clean).
- [ ] No comments, no `.only`, no `.skip` in test code.
