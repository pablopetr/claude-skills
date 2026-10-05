---
name: electron-best-practices
description: >
  Electron rules for desktop/: process model, the full security checklist, contextBridge preload, IPC validation,
  custom protocol, safeStorage, fuses, lifecycle, packaging, testing, and no comments in code. Use on ANY task
  that touches the Electron main process, preload, renderer integration, IPC, protocol handlers, windows,
  menus, packaging, auto-update or desktop tests.
---

# electron-best-practices

Source: the official Electron security checklist (20 recommendations) and the project design (custom `notes://` protocol, API proxy in the main process, token in `safeStorage`). Pair with `best-practices`, `react-best-practices` (renderer) and `security-check`.

## 1. Non-negotiable project rules

1. **No comments in code**, tests included. No `//`, `/* */`, banners, TODOs, directive comments for tools unless the tool offers no configuration alternative (then a single directive line with no prose).
2. **One responsibility per file.** Never combine a class with an interface, a type with a class, or an interface with a type in the same file. Each file exports exactly one primary entity (a component, a utility, a type, an interface, a class, or an enum). Organize related code into separate files.
3. **Path alias `@` for all imports.** Use `@/` for any import from the project root; never relative paths like `../../../`. Configure `tsconfig.json` with `"baseUrl": "." and "@": ["src/*"]` if not already present. This keeps imports clean and stable during refactors.
4. **The token and any credential never reach the renderer.** The main process owns it (encrypted with `safeStorage`). The preload API contains no token, credential, auth or generic IPC function. A test pins the exact list of exposed keys.
5. TypeScript strict; Electron APIs are injected into pure functions so main-process logic is unit tested with Jest.
6. Renderer code reuses `@notes/shared`; never duplicate editor or API code in `desktop`.
7. Tailwind only in the renderer; no styling outside Tailwind.

## 2. Process model

- **Main**: window and app lifecycle, protocol handlers, IPC handlers, credential store, settings, API proxy, menus. No UI code. Keep it small and synchronous work out of it.
- **Preload**: a thin, typed bridge. Runs isolated; exposes a fixed object with `contextBridge.exposeInMainWorld`. No Node APIs leak through it.
- **Renderer**: a normal web app (React) in a sandboxed page. No Node, no Electron imports.
- Share channel names and types through one module (`src/shared/ipc.ts`) used by main, preload and tests.
- Structure: `src/main/{index,window,window-state,protocol,csp,token-store,api-proxy,settings,menu,ipc,close-flush}.ts`, `src/preload/index.ts`, `src/renderer/`, `src/shared/`. One responsibility per file; export pure functions, wire them in `index.ts`.

## 3. Security checklist (apply to every change)

From the official checklist, with this project's choices:

1. **Only load secure content.** The renderer loads from `notes://app/`. External pages are never loaded in app windows; links open in the OS browser. API traffic uses `https` in production.
2. **`nodeIntegration: false`** always.
3. **`contextIsolation: true`** always.
4. **`sandbox: true`** always.
5. **Permissions:** `session.setPermissionRequestHandler` and `setPermissionCheckHandler` deny everything unless a feature explicitly needs one.
6. **`webSecurity` stays enabled.** Never set it to `false`.
7. **CSP** on every document response from the protocol handler: `default-src 'self'`, `script-src 'self'` (relaxed only in development for Vite HMR), `connect-src 'self'`, `frame-src https://www.youtube-nocookie.com`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'none'`.
8. **No `allowRunningInsecureContent`.**
9. **No `experimentalFeatures`.**
10. **No `enableBlinkFeatures`.**
11. **No `<webview>`; no `allowpopups`.**
12. **Verify webview options** in `will-attach-webview` if webviews ever become necessary.
13. **Limit navigation:** `will-navigate` parses the URL with `new URL()` and allows only the app origin; everything else is prevented (and opened in the OS browser only when `http(s)`).
14. **Limit new windows:** `webContents.setWindowOpenHandler` returns `{ action: 'deny' }` and routes safe `http(s)` URLs to `shell.openExternal`.
15. **`shell.openExternal` only with validated URLs** (`http:` or `https:` through `URL`). Never `file:`, `javascript:`, `data:`, custom schemes, or unparsed strings.
16. **Keep Electron current** (and Chromium/Node with it); review release notes on upgrade and run the whole test suite.
17. **Validate the IPC sender.** Every `ipcMain.handle`/`on` checks `event.senderFrame?.url` starts with `notes://app/` and validates argument types and shapes.
18. **No `file://`.** Use `protocol.handle()` with a registered privileged scheme and a path-traversal-safe resolver.
19. **Fuses** (`@electron/fuses`, applied at packaging): `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `EnableCookieEncryption` on, `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on, `GrantFileProtocolExtraPrivileges` off.
20. **Never expose raw Electron APIs**: no `ipcRenderer`, no `shell`, no `fs`, no generic `invoke(channel, ...args)`. One named method per capability.

Additional rules: never log tokens, passwords or note content; never persist secrets in plain text; open DevTools and the reload menu only in development; do not load remote code; do not use `remote` or `executeJavaScript` with dynamic strings.

## 4. Windows

```ts
const window = new BrowserWindow({
  width: state.width,
  height: state.height,
  minWidth: 900,
  minHeight: 600,
  show: false,
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  },
});

window.once('ready-to-show', () => window.show());
```

- Create windows hidden and show on `ready-to-show`.
- Persist and clamp window state to the visible displays; minimum size 900x600.
- Single instance: `app.requestSingleInstanceLock()`; focus the existing window on `second-instance`.
- macOS: keep the app alive when all windows close; recreate on `activate`; `Cmd+Q` goes through `before-quit`.

## 5. Preload and IPC

```ts
contextBridge.exposeInMainWorld('notesDesktop', {
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url),
  getAppVersion: () => ipcRenderer.invoke(IPC.getVersion),
});
```

- Prefer `ipcMain.handle` / `ipcRenderer.invoke` (promise-based). Avoid synchronous IPC (`sendSync`).
- Main handler template: check sender, check types, do the work, return plain serializable data.
- Events from main to renderer are subscriptions with an unsubscribe function returned to the caller (`onFlushRequest`).
- Do not forward arbitrary channels or arguments.

```ts
export function isTrustedSender(frameUrl: string | undefined): boolean {
  return typeof frameUrl === 'string' && frameUrl.startsWith('notes://app/');
}

ipcMain.handle(IPC.openExternal, async (event, url: unknown) => {
  if (!isTrustedSender(event.senderFrame?.url) || typeof url !== 'string' || !isSafeExternalUrl(url)) return false;
  await shell.openExternal(url);
  return true;
});
```

## 6. Protocol and API access

- Register the scheme before `app.ready` with `standard`, `secure`, `supportFetchAPI` (no `bypassCSP`).
- `protocol.handle('notes', ...)` serves renderer files (path resolved inside the renderer root, traversal rejected, SPA fallback only for navigation requests) and forwards `/api/v1/*` to the shared API proxy.
- The renderer calls `fetch('/api/v1/...')` on its own origin. The proxy adds the bearer token, strips tokens from auth responses, rotates tokens and clears them on 401.
- Network calls from main use `net.fetch` (honors OS proxy and certificates).

## 7. Secrets and storage

- Token: `safeStorage.encryptString` into a file under `app.getPath('userData')`; refuse to persist when encryption is unavailable or the Linux backend is `basic_text`, keeping the token in memory only.
- Delete the file on logout, on 401 and when the API URL changes.
- Settings (API URL) validated as an `http(s)` origin without credentials; owned by the main process.
- Use atomic writes (temp file then rename) for state files.

## 8. Lifecycle and reliability

- Close and quit flows ask the renderer to flush autosave and wait with a timeout (3 s) before closing.
- Handle `render-process-gone`, `unresponsive` and `did-fail-load` with a recovery path (reload, error page) and without leaking details.
- Errors from main never show stack traces to the user; log without secrets.
- Auto-update only with signed builds and a trusted feed; flush autosave before restarting. Out of scope for v1.

## 9. Performance

- Keep the main process idle: no heavy synchronous work, no large IPC payloads (use the API through the proxy instead).
- Lazy-load modules that are not needed at startup; defer non-critical initialization until after `ready-to-show`.
- Keep the preload tiny; no bundled libraries there.
- Do not poll; use events and the API's own retry logic.

## 10. Packaging

- `electron-builder` with ASAR enabled; only `out/**` and `package.json` in `files`; no `.env`, no source maps with secrets.
- Bundle `@notes/shared` into the main and renderer outputs (it ships TypeScript source).
- Production menus have no DevTools or reload; apply fuses at build time; check the packaged app from the ASAR (`notes://` resolution, `safeStorage`, close flush).
- Code signing and notarization are required before any public distribution.

## 11. Testing

- Unit test pure main-process logic with Jest (`testEnvironment: 'node'` through Jest `projects`, not docblocks): URL policy, window state clamping, path resolver, CSP builder, token store (fake `safeStorage` and fs), close flusher (fake timers), settings, IPC handlers (fake `ipcMain`), menu template builders.
- Contract tests pin the preload surface and assert no credential-like keys.
- Guard tests read source files to assert security flags are present (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- Renderer tests use the same Testing Library approach as the web app with `window.notesDesktop` mocked.
- End-to-end checks of the packaged app are manual (see the desktop packaging task) or, if automated, use Playwright's Electron support; Cypress cannot drive Electron.

## Review checklist

- [ ] Each file has one responsibility; no class + interface, type + class, or interface + type in the same file.
- [ ] All imports use `@/` path alias; no relative paths; `tsconfig.json` configured.
- [ ] `contextIsolation`, `sandbox`, `webSecurity` on; `nodeIntegration` off; no insecure flags.
- [ ] Navigation, new windows and `openExternal` are restricted and validated with `URL`.
- [ ] Every IPC handler validates sender and arguments; the preload exposes only named methods.
- [ ] No token or credential API in the renderer; token stored with `safeStorage` or memory only.
- [ ] Protocol resolver is traversal-safe; CSP applied; no `file://`.
- [ ] Permissions denied by default; DevTools only in development.
- [ ] Logic extracted into injectable pure functions with Jest tests.
- [ ] Zero comments, zero suppression directives.
