---
name: react-best-practices
description: >
  React 19 and Next.js 16 (App Router) rules for web/ and packages/shared/: component design, hooks and effects,
  server vs client components, data fetching with TanStack Query, TypeScript strictness, accessibility, Tailwind-only
  styling, security, testing with Jest and Testing Library, and no comments in code. Use on ANY task that touches
  React components, hooks, Next.js routes, the shared package, TypeScript UI code, or frontend tests.
---

# react-best-practices

Sources: react.dev ("You might not need an effect") and the Next.js docs (Server and Client Components, Content Security Policy). Pair with `best-practices` and `security-check`.

## 1. Non-negotiable project rules

1. **No comments in code**, tests included. No `//`, `/* */`, JSX comments, banners, TODOs, `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or coverage ignores. Express intent with names, types, small components and tests. `'use client'` and `'server-only'` are directives, not comments.
2. **TypeScript strict**, no `any`, no non-null assertions in production code, no type assertions that hide errors (`as` only at validated boundaries). Use discriminated unions, `satisfies`, `readonly`, and types generated from the OpenAPI spec.
3. **Tailwind only** for styles, with semantic tokens (`bg-surface`, `text-text`, `border-border`). No CSS modules, no CSS-in-JS, no inline `style` except runtime values (for example an image width). Conditional classes through `cn()`.
4. **Icons from `lucide-react` only**, every icon-only button has `aria-label` and a `title`.
5. **The auth token is never readable by JavaScript.** Components call relative `/api/v1/...`; no token in state, props, storage, URL or logs.
6. **Shared code lives in `packages/shared`.** Never copy a component or hook between `web` and `desktop`.
7. ESLint (typescript-eslint strict, react-hooks, jsx-a11y, next) and `tsc --noEmit` are clean. Tests are Jest + Testing Library.

## 2. Component design

- Function components only. One component per file, named export, PascalCase file name matching the export (kebab-case file names are fine if that is the folder convention; stay consistent).
- A component either **renders** (props in, JSX out) or **orchestrates** (hooks, data). Extract logic into custom hooks, rendering into small presentational components.
- Props: small, explicit, typed with an interface; pass what is rendered, not whole entities. No boolean prop explosions: use a discriminated `variant` union or composition (`children`, slots).
- Prefer composition over configuration. Avoid prop drilling beyond two levels: use context for cross-cutting values only (API endpoints, toasts, theme), and split contexts so unrelated updates do not re-render consumers.
- `key`: stable ids, never array index for reorderable lists. Use `key` to reset a subtree (the editor is re-mounted with `key={noteId}`).
- Event handlers named `handleX` inside, props named `onX`.
- Return early for loading, error and empty states; keep the happy path unindented.

```tsx
interface NoteListItemProps {
  note: NoteSummary;
  active: boolean;
  onSelect: (id: string) => void;
}

export function NoteListItem({ note, active, onSelect }: NoteListItemProps) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(note.id)}
      className={cn('flex w-full flex-col px-3 py-2 text-left hover:bg-surface-muted', active && 'bg-surface-muted')}
    >
      <span className="truncate text-sm font-medium text-text">{note.title ?? 'Untitled'}</span>
      <span className="truncate text-xs text-text-muted">{note.preview}</span>
    </button>
  );
}
```

## 3. State and effects

Use an Effect only to synchronize with something outside React, because the component was displayed. Everything else belongs elsewhere.

| Need | Do this | Not this |
| --- | --- | --- |
| Value derived from props or state | Compute during render | `useEffect` + `setState` |
| Expensive derivation | `useMemo` (only after measuring) | Effect that stores the result |
| Reset state when an id changes | `key={id}` on the component | Effect that resets state |
| React to a user action | Event handler | Effect watching state |
| Chain of updates | Compute everything in one handler | Effects triggering effects |
| External store or browser API | `useSyncExternalStore` | Effect + state copy |
| Server data | TanStack Query (`useQuery`, `useInfiniteQuery`, mutations) | `useEffect` + `fetch` |
| Parent/child sync | Lift state up | Effect calling parent callbacks |

- State lives as low as possible (colocation); lift only when two siblings need it. Server state is **not** copied into local state: it stays in the query cache.
- Effects that remain must clean up (listeners, timers, subscriptions, abort controllers) and handle races (`ignore` flag or `AbortController`).
- Exhaustive deps always; if the lint rule complains, restructure (move the logic to a handler, use a ref for the latest callback) instead of suppressing.
- Refs for non-rendering mutable values (timers, latest callback), never for data that affects output.
- `useReducer` or a small controller module (like the autosave controller with `useSyncExternalStore`) for state machines.
- Memoization (`memo`, `useMemo`, `useCallback`) only with a measured reason or a referential-equality requirement; prefer fixing the structure.
- Optimistic updates and cache writes go through TanStack Query (`setQueryData`, `onMutate`), with rollback on error.

## 4. Next.js 16 App Router

- Layouts and pages are **Server Components** by default. Add `'use client'` only to the smallest interactive leaf (state, handlers, effects, browser APIs, custom hooks). Everything a client file imports ships to the browser.
- Pass serializable props from server to client. Pass server components as `children` to client wrappers to keep them on the server.
- Providers (context, query client) are client components that accept `children`, rendered as deep as possible.
- `params` and `searchParams` are Promises in server components: `const { id } = await params`.
- Mark server-only modules with `import 'server-only'` (secrets, cookie handling, API URL). Only variables prefixed `NEXT_PUBLIC_` reach the client; **there is no `NEXT_PUBLIC_` API URL in this project**.
- The file that was `middleware.ts` is **`proxy.ts`** in Next 16 (`export function proxy(request)`), with the same `config.matcher`. It must not match `/api/*` (it would buffer upload bodies) or static assets.
- Route handlers (`route.ts`) stream request and response bodies; the API proxy lives in `src/app/api/v1/[...path]/route.ts`.
- Dynamic rendering is required for per-request nonces (`await connection()` or reading `headers()`); do not statically prerender pages under a nonce CSP.
- The Tiptap editor needs `immediatelyRender: false` to avoid hydration mismatches.
- Use `next/image` for static images, `next/link` for navigation, `notFound()` and `error.tsx` / `not-found.tsx` for failures, `loading.tsx` or Suspense for streaming.
- Never read cookies or the API token in client components; only the proxy route handler touches the cookie.

### CSP with a nonce (proxy.ts)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@/lib/csp';

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp({ nonce, imagesOrigin: process.env.IMAGES_ORIGIN ?? '', isDev: process.env.NODE_ENV === 'development' });

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

`'unsafe-eval'` only in development. `style-src 'self' 'unsafe-inline'` is a deliberate concession for ProseMirror inline styles.

## 5. Data fetching and forms

- One API client with a relative base path; endpoints typed from the generated OpenAPI types; errors normalized (`ApiError`, `ValidationApiError`, `NetworkError`).
- Queries have stable key factories; mutations invalidate or update precisely; retries skip 4xx.
- Autosave is a controller outside React state with `useSyncExternalStore`; components only call `update`, `flush`, `retryNow`.
- Forms: controlled inputs with labels, `autoComplete`, `required`, `minLength`; show field errors from 422 under the field with `aria-invalid` and `aria-describedby`; disable submit while pending; no password stored in state longer than needed.
- Debounce with a hook (`useDebouncedValue`), never inside render.

## 6. Accessibility

- Semantic elements first (`button`, `a`, `nav`, `aside`, `main`, `ul`), ARIA only when semantics are not enough.
- Every interactive element is keyboard reachable with a visible focus style (`focus-visible:outline-2 focus-visible:outline-accent`).
- Labels for every input, `aria-live` regions for async status, `role="alert"` for errors, `aria-current`, `aria-pressed`, `aria-expanded` where relevant.
- Dialogs use the native `<dialog>` (focus trap and `Esc`). Respect `prefers-reduced-motion` (`motion-reduce:`).
- No nested interactive elements. Color contrast through the token palette in light and dark.

## 7. Performance

- Split code with `dynamic()` for heavy, rarely used parts (code languages, dialogs). Keep the client bundle small by keeping components server-side by default.
- Virtualize or paginate long lists (the notes list uses cursor pages and an `IntersectionObserver`).
- Avoid creating objects and functions in render only when they break referential equality of memoized children.
- Do not block rendering with synchronous heavy work; move it to a handler, a worker or the server.

## 8. Security (frontend)

- Never `dangerouslySetInnerHTML`; render note content through Tiptap from JSON. No `eval`, no `new Function`, no `innerHTML`, no `document.write`.
- Links from user content: allow `http`, `https`, `mailto` only, with `rel="noopener noreferrer nofollow"`.
- Validate and normalize URLs with `URL`, never string checks; never build URLs from unvalidated input.
- No secrets in client code or `NEXT_PUBLIC_` variables. No tokens in `localStorage`, `sessionStorage`, IndexedDB, URLs, logs or analytics.
- Strict CSP with nonces, `frame-ancestors 'none'`, `frame-src` limited to YouTube nocookie, `connect-src 'self'`.

## 9. Testing

- Jest + Testing Library + `@testing-library/user-event`. Query by role, label and text the user sees (`getByRole`, `getByLabelText`); `data-testid` only as a last resort. Never assert on implementation details (state, class names, hook internals).
- Test behavior: render, interact, assert the visible result and the network calls (mock the API client or `fetch`, not React Query).
- Fake timers for debounce, autosave and retries; deferred promises for race conditions.
- Cover loading, error, empty and success states, keyboard interaction and accessibility names.
- Pure logic (parsers, reducers, controllers) is tested without React.
- Coverage thresholds are enforced per package; do not lower them to pass.
- Tests contain no comments, no `.only`, no `.skip`.

## Review checklist

- [ ] Server component by default; `'use client'` only on interactive leaves; `server-only` on secret modules.
- [ ] No unnecessary effects; derived values computed in render; `key` used to reset state.
- [ ] Types strict, no `any`, no assertions hiding errors; generated API types used.
- [ ] Tailwind tokens only; `cn()` for conditions; lucide icons with labels.
- [ ] Accessible: roles, labels, focus, reduced motion, native dialog.
- [ ] No token, secret or raw HTML anywhere in client code.
- [ ] Tests cover states, interactions and races; no implementation-detail assertions.
- [ ] Zero comments and zero suppression directives.
