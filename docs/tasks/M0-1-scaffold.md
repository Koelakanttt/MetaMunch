# Task M0-1 — project skeleton

## Goal
Create an Electron + React + TypeScript skeleton where lint, typecheck, test and build pass, and the window shows "MetaMunch" with a working typed IPC ping.

## Create
package.json, electron.vite.config.ts, tsconfig.json, tsconfig.node.json, tsconfig.web.json, eslint.config.js, .prettierrc, .gitignore, .env.example,
vitest.config.ts,
src/main/index.ts, src/main/ipc/handlers.ts, src/main/ipc/register.ts,
src/preload/index.ts,
src/renderer/index.html, src/renderer/env.d.ts, src/renderer/main.tsx, src/renderer/App.tsx, src/renderer/index.css,
src/shared/ipc.ts,
tests/unit/ipc-handlers.test.ts

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*. Only append to docs/progress.md.

## Dependencies (exact versions, record them in package.json)
runtime: react@19, react-dom@19
dev: electron (latest stable), electron-vite (latest), vite (the major electron-vite requires), @vitejs/plugin-react, typescript, tailwindcss@4, @tailwindcss/vite, vitest, eslint@9, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, prettier, @types/react, @types/react-dom, @types/node
Nothing else. Use npm.

## Steps
1. `npm init -y`, then write package.json: "type": "module" is NOT used (keep CJS default), "main": "./out/main/index.js", engines.node ">=22". Scripts:
   dev `electron-vite dev` · build `electron-vite build` · lint `eslint .` · format `prettier --write .` ·
   typecheck `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json` · test `vitest run`
2. Install the dependencies above.
3. electron.vite.config.ts: main/preload with `externalizeDepsPlugin()`; renderer root `src/renderer`, plugins `react()` and `tailwindcss()`. Alias `@shared` -> `src/shared` in all three targets (and in vitest.config.ts and both tsconfigs).
4. tsconfig: strict, `noUncheckedIndexedAccess`, `noImplicitOverride`. tsconfig.node.json covers src/main, src/preload, src/shared, tests, vitest.config.ts. tsconfig.web.json covers src/renderer, src/shared, JSX `react-jsx`, lib DOM.
5. src/shared/ipc.ts — write EXACTLY:
```ts
export interface IpcChannels {
  'app:ping': { req: { message: string }; res: { reply: string; at: number } }
}
export type IpcChannel = keyof IpcChannels
export type IpcReq<C extends IpcChannel> = IpcChannels[C]['req']
export type IpcRes<C extends IpcChannel> = IpcChannels[C]['res']
export type IpcHandlers = {
  [C in IpcChannel]: (req: IpcReq<C>) => Promise<IpcRes<C>> | IpcRes<C>
}
export interface RendererApi {
  invoke<C extends IpcChannel>(channel: C, req: IpcReq<C>): Promise<IpcRes<C>>
}
```
6. src/main/ipc/handlers.ts: export `handlers: IpcHandlers` with the entry `'app:ping'` returning `{ reply: 'pong: ' + message, at: Date.now() }`.
7. src/main/ipc/register.ts: export `registerIpc(handlers: IpcHandlers)` that calls `ipcMain.handle(channel, (_e, req) => handlers[channel](req))` for every key of handlers.
8. src/main/index.ts: create BrowserWindow 1100x750 with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload from `../preload/index.js`; call `registerIpc(handlers)`; load dev URL when `process.env['ELECTRON_RENDERER_URL']` is set, else `../renderer/index.html`; quit on all windows closed (non-macOS).
9. src/preload/index.ts: `contextBridge.exposeInMainWorld('api', { invoke: (c, r) => ipcRenderer.invoke(c, r) } satisfies RendererApi)`. Add a global `Window.api: RendererApi` declaration inside src/renderer in `src/renderer/env.d.ts`.
10. Renderer: App.tsx shows heading "MetaMunch", a button "Ping" and the reply text from `window.api.invoke('app:ping', { message: 'hi' })`. Tailwind via `@import "tailwindcss";` in index.css. Dark background, light text. No other UI.
11. eslint.config.js: flat config with @eslint/js recommended, typescript-eslint recommended, react-hooks recommended; ignore `out`, `dist`, `node_modules`.
12. .gitignore: node_modules, out, dist, .env, *.log. .env.example: `RIOT_API_KEY=`.
13. tests/unit/ipc-handlers.test.ts: import `handlers` via relative path; test that `handlers['app:ping']({ message: 'x' })` returns `reply === 'pong: x'` and `typeof at === 'number'`. Vitest environment `node`.
14. Run acceptance commands. Fix only what fails.

## Acceptance
- `npm run lint` exit 0
- `npm run typecheck` exit 0
- `npm test` exit 0 (1 test passing)
- `npm run build` exit 0 and `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` exist
- Do NOT run `npm run dev` (needs a display); the owner checks the window manually.

## Forbidden
SQLite, Zustand, React Router, msw, Playwright, extra components or pages, extra dependencies, README content beyond a title, git commands, changing file names or paths above.

## Stop and ask when
npm install or build fails twice; electron-vite requires a different vite major than listed; any acceptance command cannot pass.
