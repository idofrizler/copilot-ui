# Git Pushing

## Purpose

Create atomic commits with descriptive messages. Maintain clean git history for the Cooper project.

## When to Use

- Every commit you make
- Before pushing to remote

## Activation Rules

### Commit Message Format

Use conventional commits:

```
<type>(<scope>): <short description>

[optional body explaining WHY]
[optional footer with issue refs]
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`

**Scopes** (Cooper-specific):

- `main` — Main process changes (`src/main/`)
- `renderer` — Renderer/UI changes (`src/renderer/`)
- `preload` — Preload bridge changes (`src/preload/`)
- `sdk` — Copilot SDK integration changes
- `terminal` — PTY/terminal changes
- `voice` — Voice service changes
- `worktree` — Git worktree changes
- `ipc` — IPC handler changes
- `test` — Test changes
- `build` — Build/config changes

### Rules

1. **One commit = one logical change** — Don't mix features with refactors
2. **Meaningful messages** — Explain WHY, not just WHAT
3. **No secrets** — Never commit tokens, keys, or credentials
4. **No generated files** — Don't commit `node_modules/`, `out/`, `dist/`
5. **Reference issues** — Include issue numbers when applicable

### Examples

```bash
# Good
git commit -m "feat(renderer): add model selector dropdown to chat header"
git commit -m "fix(ipc): handle session resume failure when model changes"
git commit -m "refactor(main): extract SDK event handlers to separate module"
git commit -m "test(components): add tests for SettingsPanel toggle behavior"

# Bad
git commit -m "update stuff"
git commit -m "fix bug"
git commit -m "WIP"
```

### Branch Convention

- Branch from `staging`
- PR back to `staging`
- Stable releases merge to `main`

## Success Criteria

- Conventional commit format used
- Each commit is atomic (one logical change)
- No secrets or generated files committed

## Related Skills

- [review-implementing](../review-implementing/) — Validate before committing
