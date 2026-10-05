---
name: cypress-tests
description: >
  How to write Cypress end-to-end tests for the notes web app running against the full stack (Next.js proxy,
  Laravel API, PostgreSQL, MinIO, Meilisearch): project layout, config, selectors, programmatic login through the
  HttpOnly-cookie proxy, data seeding, intercepts, fake clock for autosave, Tiptap editor, drag and drop uploads,
  coverage and CI. Use whenever writing, fixing or reviewing Cypress tests or cypress config. Electron cannot be
  tested with Cypress; see the notes at the end.
---

# cypress-tests

Pair with `e2e-tests` (strategy, edge-case catalog, coverage) and `best-practices`. Cypress tests are code: strict TypeScript, no comments, no `any`.

## 1. Scope and layout

Cypress tests the **web app with everything running together**. It cannot drive the Electron main process or preload (see section 12).

```
e2e/
  package.json                 workspace package "e2e"
  cypress.config.ts
  tsconfig.json
  traceability.json
  cypress/
    e2e/
      auth/        notes/        editor/        search/        images/        resilience/        security/
    fixtures/                    small images, files for upload edge cases
    support/
      e2e.ts                     imports commands and coverage
      commands.ts                typed custom commands
      api.ts                     typed helpers that call the API through the web proxy
      selectors.ts               data-cy names
      index.d.ts                 Cypress.Chainable augmentation
```

Install `cypress`, `@cypress/code-coverage`, `eslint-plugin-cypress`, `typescript` in `e2e/`; add the package to the pnpm workspace; run with `pnpm --filter e2e cypress:run`.

## 2. Config

```ts
import codeCoverageTask from '@cypress/code-coverage/task';
import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 8000,
    requestTimeout: 10000,
    retries: { runMode: 1, openMode: 0 },
    experimentalRunAllSpecs: true,
    setupNodeEvents(on, config) {
      codeCoverageTask(on, config);
      return config;
    },
  },
});
```

- `baseUrl` is the web app. Servers are started **before** Cypress (compose for the API stack, `next start` for the web), never from `cy.task`.
- Secrets use `cy.env()`; only public configuration uses `Cypress.expose()`. Never hardcode credentials.
- ESLint: `plugin:cypress/recommended` with `no-unnecessary-waiting` and `no-assigning-return-values` as errors.

## 3. Selectors

- Add `data-cy` attributes to the components (in `packages/shared` and `web`), named by role: `data-cy="notes-search"`, `data-cy="note-item"`, `data-cy="toolbar-bold"`, `data-cy="save-status"`. Adding `data-cy` is part of the component task; never select by class, id, tag chain or Tailwind utility.
- Use accessible names when the text is the contract (`cy.findByRole`-style through `@testing-library/cypress`, or `cy.contains` for text that must not change).
- Keep names in `support/selectors.ts` as a typed object and a command `cy.getBy(name)`.

```ts
Cypress.Commands.add('getBy', (name: string) => cy.get(`[data-cy="${name}"]`));
```

## 4. Authentication: programmatic, through the proxy

The browser talks only to `/api/v1/*` on the web origin; the proxy sets an **HttpOnly cookie**. Cypress keeps cookies in its jar, so `cy.request` to the web origin logs the browser in without UI.

```ts
export interface TestUser {
  name: string;
  email: string;
  password: string;
}

export function newUser(): TestUser {
  const id = crypto.randomUUID();
  return { name: `User ${id.slice(0, 8)}`, email: `e2e-${id}@example.test`, password: 'password-12345' };
}

const headers = { 'X-Requested-With': 'notes-web', Accept: 'application/json' };

Cypress.Commands.add('register', (user: TestUser) =>
  cy.request({ method: 'POST', url: '/api/v1/auth/register', headers, body: { name: user.name, email: user.email, password: user.password } }),
);

Cypress.Commands.add('loginAs', (user: TestUser) =>
  cy.session(user.email, () => {
    cy.request({ method: 'POST', url: '/api/v1/auth/login', headers, body: { email: user.email, password: user.password } });
  }, {
    validate: () => cy.request({ url: '/api/v1/auth/me', headers, failOnStatusCode: false }).its('status').should('eq', 200),
  }),
);
```

- The proxy requires the CSRF header and a same-origin context; `cy.request` to the base URL satisfies the origin check, add `Origin` explicitly if the proxy requires it.
- Each spec registers a **new unique user** in `beforeEach` (fast, isolated). Use the UI login only in the auth specs themselves.
- Tests assert that the token is **not** in the login response body and that `document.cookie` does not contain the auth cookie.

## 5. Test data through the API

Create notes, images and state through typed helpers that call the API (not the UI) in `beforeEach`; act through the UI; assert in the UI and, when persistence matters, by reloading or reading the API.

```ts
export function createNote(content: TiptapDocument, title?: string) {
  return cy.request({ method: 'POST', url: '/api/v1/notes', headers, body: { title } }).then(({ body }) =>
    cy.request({ method: 'PATCH', url: `/api/v1/notes/${body.data.id}`, headers, body: { content } }).its('body.data'),
  );
}
```

For states that need a privileged shortcut (expired token, 31 notes), use a **test-only artisan command** run by `cy.task` (`docker compose exec ... php artisan e2e:seed ...`) that exists only when `APP_ENV=e2e`. Never add production endpoints for tests.

## 6. Waiting and network

- Never `cy.wait(<number>)`. Alias requests and wait for them, or assert with retry-able assertions.
- Spy on contract-relevant calls and assert payloads:

```ts
cy.intercept('PATCH', '/api/v1/notes/*').as('save');
cy.getBy('editor').type('hello');
cy.wait('@save').its('request.body').should('deep.include', { content: Cypress.sinon.match.object });
```

- Force failures with `cy.intercept(..., { forceNetworkError: true })`, `{ statusCode: 500 }`, delays, and 429 with `Retry-After`.
- Assert request counts (`cy.get('@save.all').should('have.length', 1)`) for coalescing and debounce rules.

## 7. Time: autosave, debounce, backoff

Use `cy.clock()` before visiting, then advance time deterministically.

```ts
cy.clock();
cy.visit(`/notes/${note.id}`);
cy.getBy('editor').type('a');
cy.tick(999);
cy.get('@save.all').should('have.length', 0);
cy.tick(1);
cy.wait('@save');
cy.getBy('save-status').should('contain.text', 'Saved');
```

- Test debounce at 999 ms and 1000 ms, max wait at 5 s with continuous typing, backoff steps (1 s, 2 s, 4 s) and the 30 s cap with failing intercepts, and a single request in flight.
- Real time is acceptable only in resilience specs that stop and start containers.

## 8. Editor, toolbar and uploads

- The editor is a `contenteditable`. Type with `cy.getBy('editor').type('text')` (`{selectall}`, `{enter}`, `{backspace}`, `{ctrl+b}` as needed). Assert resulting structure through the DOM (`strong`, `h1`, `ul > li`, `table`, `pre code`) and persistence through the saved JSON.
- Toolbar: click each button by `data-cy`, assert `aria-pressed` and the effect. Table tools: assert disabled outside a table and the counts of rows and columns after each action.
- Link and YouTube dialogs: invalid values show the error and change nothing; valid values produce the expected `href` and `src` (nocookie host). Assert the iframe `src`, never load YouTube.
- **Drag and drop upload** with real files:

```ts
cy.getBy('editor').selectFile('cypress/fixtures/photo.png', { action: 'drag-drop' });
cy.wait('@upload').its('response.statusCode').should('eq', 201);
cy.getBy('editor').find('img').should('have.attr', 'src').and('match', /^http/);
```

- Also test the file picker (`cy.getBy('image-input').selectFile(...)`), paste, multiple files, forbidden types (assert the toast and that no request was sent), the size limit with a generated 10 MB + 1 byte fixture created by `cy.task`, and images that fail to upload (placeholder removed).
- Resize and align: trigger pointer events on handles (`trigger('pointerdown', { clientX })`, `pointermove`, `pointerup` on `window`), assert the saved `width`; click the alignment buttons; assert persistence after reload.
- Keep fixture files tiny.

## 9. Responsive, accessibility, security

- `cy.viewport(375, 812)`, `cy.viewport(768, 1024)`, `cy.viewport(1280, 800)`: drawer behavior and 25/75 layout (assert computed widths with tolerance).
- Accessibility smoke with `cypress-axe` on each main screen (`cy.injectAxe(); cy.checkA11y()`); keyboard-only flows with `cy.realPress` (`cypress-real-events`).
- Security specs: cookie attributes (`cy.getCookie` shows `httpOnly: true`, correct `sameSite`, no `domain` mismatch), `document.cookie` does not expose it, no token in any intercepted response body, CSRF rejection (`cy.request` without the header returns 403), foreign note returns 404, CSP violations are zero (listen for `securitypolicyviolation` events and fail).

## 10. Coverage

- Import `@cypress/code-coverage/support` in `support/e2e.ts`; the app under test must be the instrumented build.
- After the run: merge with Jest coverage and check thresholds (see `e2e-tests` section 7). Add a spec for every uncovered reachable branch or remove the dead code.

## 11. Rules of the road

- Tests independent; each passes alone and in any order; no shared state; reset in `beforeEach`.
- One behavior per test, several assertions allowed. Titles start with the business rule id (`BR-A2: ...`).
- Do not assign Cypress return values to variables; use aliases and closures.
- Do not test third-party sites or services. Use programmatic login (`cy.session`), not the UI, except in auth specs.
- No comments, no `.only`, no `.skip`, no `any`, no fixed sleeps.
- Commands:

```bash
pnpm api:up
pnpm --filter web build
pnpm --filter web start
pnpm --filter e2e cypress:run
pnpm --filter e2e cypress:open
```

## 12. Electron

Cypress runs in a browser and cannot launch or control Electron, the preload, `safeStorage`, native menus or the `notes://` protocol. For the desktop app:

1. Unit test every injected main-process module with Jest.
2. Test the renderer with Jest and Testing Library; the shared screens are already covered by the web e2e because they are the same components.
3. Run the manual packaged-app QA table from the desktop packaging task before releases.
4. If automation is wanted later, use Playwright's Electron support in a separate package; do not stretch Cypress.

## Review checklist

- [ ] Selectors are `data-cy`; no class or id selectors; no `cy.wait(ms)`.
- [ ] Login is programmatic through the proxy; unique user per test; no UI login outside auth specs.
- [ ] Network aliases and request counts asserted for autosave, upload and search rules.
- [ ] Fake clock used for debounce, max wait, backoff and expiry.
- [ ] Edge cases from the `e2e-tests` catalog covered for the feature.
- [ ] Security assertions present (cookie flags, no token exposure, CSRF, 404 isolation).
- [ ] Coverage collected; thresholds pass; no comments or `.only`.
