# AGENTS.md

## Project

Cooper is an Electron desktop GUI for GitHub Copilot, built with electron-vite, React, and TypeScript.
It works on top of the GitHub Copilot CLI SDK (see [Copilot CLI SDK](https://github.com/github/copilot-sdk?tab=readme-ov-file)).

## Development

```bash
npm install        # Install deps (runs postinstall: patch-package, rebuild node-pty, codesign on macOS)
npm run dev        # Start dev server
npm test           # Run unit tests (vitest)
npm run format     # Format with Prettier
```

Pre-commit hooks (husky) run lint-staged (Prettier) and `npm test` automatically. Both must pass.

## Core Principles

- **Plan before coding.** Break complex tasks into steps. Use todo lists for multi-step work.
- **Ask, don't assume.** When uncertain about requirements or approach, ask the user.
- **Keep it simple.** Prefer straightforward solutions. Avoid premature abstraction.
- **Don't repeat yourself.** Extract shared logic, but wait for patterns to emerge (Rule of Three).
- **Small files, single responsibility.** Keep files under ~500 lines. Split when they grow.

## Code Style

- TypeScript throughout. Avoid `any` unless truly necessary.
- Prettier handles formatting: single quotes, semicolons, 2-space indent, 100 char width.
- Path alias: `@` maps to `src/` in renderer code.

## Release & Versioning

**Read [CONTRIBUTING.md](CONTRIBUTING.md) before making release-related changes.** It documents the full release workflow, versioning strategy, CI pipelines, and artifact naming.

Key points for agents:

- The version lives in `package.json`. Bump it with `node scripts/bump-version.js [major|minor|patch]`.
- Update `RELEASE_NOTES.md` with a `## <version>` section when preparing a release.
- Releases are created automatically by CI on push to `main` (full release) or `staging` (RC). No manual release steps.
- PRs to `main`/`staging` run the Build Check workflow, which produces downloadable unsigned artifacts for testing.
- Never create GitHub Releases from feature branches. Test from PR artifacts instead.

## Git Workflow

- Branch off `staging`, PR back to `staging`.
- `staging` → `main` merges are done by the maintainer after version bump and release notes.
- Commit messages: use conventional style (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`).
