# Cooper — Copilot Instructions

## What is Cooper?

Cooper is a native desktop GUI for GitHub Copilot, built with Electron + React + TypeScript on the [Copilot SDK](https://www.npmjs.com/package/@github/copilot-sdk). It gives developers a tabbed, terminal-integrated chat interface that feels like a local tool — not a browser tab.

## Design Philosophy

**Keep it simple and seamless.** Cooper should feel like a lightweight power tool, not a feature-bloated IDE plugin. Every feature must earn its place by keeping the developer in control and providing clear visibility into what the agent is doing.

Guiding principles:

- **Developer stays in control** — The user always knows what's happening and can intervene. Confirmations before destructive actions, visible terminal output, clear session state.
- **Simplicity over features** — Resist adding complexity. A focused, well-executed feature beats three half-baked ones. If a feature needs a tutorial to understand, it's too complex.
- **Seamless experience** — Minimal friction between intent and action. One-click worktree creation, inline terminal attach, quick model switching. No unnecessary modals or config screens.
- **Transparency** — Show token usage, model info, agent status, and command execution. The developer should never wonder "what is it doing?"

## Architecture

Electron three-process model:

| Layer            | Path            | Role                                                                                                                    |
| ---------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Main process** | `src/main/`     | Electron backend — Copilot SDK communication, IPC handlers, PTY terminals, file system, voice, git worktrees            |
| **Preload**      | `src/preload/`  | Secure IPC bridge exposing `electronAPI` with namespaced methods (`copilot.*`, `git.*`, `voice.*`, `system.*`, `mcp.*`) |
| **Renderer**     | `src/renderer/` | React UI — components, hooks, context, themes, utilities                                                                |

Communication between renderer and main always goes through preload IPC — never direct Node.js access from the renderer.

## Key Directories

```
src/
├── main/                # Electron main process
│   ├── main.ts          # App lifecycle, window management, IPC handlers
│   ├── skills.ts        # SKILL.md parsing (personal + project skills)
│   ├── agents.ts        # .agent.md parsing and agent support
│   ├── pty.ts           # Per-session terminal (node-pty)
│   ├── worktree.ts      # Git worktree creation from issue URLs
│   ├── voiceService.ts  # Speech-to-text / text-to-speech
│   └── utils/           # Executable extraction, asset helpers
├── preload/
│   └── preload.ts       # IPC bridge (ipcRenderer.invoke / send)
├── renderer/
│   ├── App.tsx           # Root React component
│   ├── components/       # UI components (Terminal, Modal, Settings, etc.)
│   ├── hooks/            # Custom React hooks
│   ├── types/            # TypeScript interfaces (session, mcp, skills, agents)
│   ├── context/          # React context (ThemeContext)
│   ├── themes/           # Built-in themes
│   └── utils/            # Telemetry, CLI detection, sound, session management
tests/
├── components/           # Vitest component/unit tests
├── e2e/                  # Playwright E2E tests
└── integration/          # Integration tests
```

## Tech Stack

- **Electron 28** + **React 18** + **TypeScript 5**
- **electron-vite** for build tooling
- **Tailwind CSS** for styling
- **xterm** + **node-pty** for embedded terminals
- **electron-store** for persistent settings
- **Vitest** for unit/component tests, **Playwright** for E2E

## Development

```bash
npm install      # Install deps (also rebuilds node-pty, patches packages)
npm run dev      # Start dev server with hot reload
npm run build    # Production build
npm test         # Run unit/component tests (vitest)
npm run test:e2e # Build + run Playwright E2E tests
```

Branch off `staging`, PR back to `staging`. Stable releases are merged to `main`.

## Conventions

- **Minimal changes** — Small, focused PRs. Don't refactor unrelated code.
- **TypeScript strict** — All new code must be typed. Interfaces live in `src/renderer/types/`.
- **IPC contract** — Any new main↔renderer communication needs a preload bridge method. Never use `remote` or expose Node.js globals.
- **State management** — React Context + hooks. No Redux or external state libraries.
- **Styling** — Tailwind utility classes. Component-scoped CSS modules only when Tailwind can't express it.
- **Testing** — Write tests for logic and non-trivial components. Use Vitest for units, Playwright for user flows.
- **No bloat** — Before adding a dependency, ask: can this be done in <50 lines without it? If yes, do that.
