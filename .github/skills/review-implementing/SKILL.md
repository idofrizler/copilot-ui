# Review Implementing

## Purpose

Validate proposed changes against requirements BEFORE execution. Detect scope creep, ensure alignment with Cooper conventions, and verify no breaking changes to IPC contracts.

## When to Use

- Before executing any implementation plan with 3+ files
- When changing IPC handlers, preload bridge, or SDK integration
- When modifying shared types or interfaces

## When NOT to Use

- Quick bug fixes with obvious solutions
- Documentation-only changes

## Activation Rules

### Step 1: Create Implementation Plan

Map each proposed change to a requirement:

```markdown
## Implementation Plan

| #   | File                          | Change            | Requirement             | Risk |
| --- | ----------------------------- | ----------------- | ----------------------- | ---- |
| 1   | src/main/main.ts              | Add IPC handler   | Feature X needs backend | Low  |
| 2   | src/preload/preload.ts        | Add bridge method | IPC contract            | Med  |
| 3   | src/renderer/components/X.tsx | New component     | UI requirement          | Low  |
```

### Step 2: Check for Issues

- **Scope creep**: Does any change go beyond the stated requirement?
- **Breaking changes**: Will existing IPC channels or types break?
- **Convention violations**: TypeScript strict? Tailwind only? No Node in renderer?
- **Missing tests**: Does each behavior change have a corresponding test?

### Step 3: Validate After Implementation

- Run `npm run build` — no type errors
- Run `npm test` — no test regressions
- Verify IPC contract is intact (preload exposes what renderer expects)

## Cooper-Specific Examples

**Reviewing a new feature:**

```markdown
✅ IPC contract maintained (preload.ts updated with renderer types)
✅ No Node.js globals exposed to renderer
✅ TypeScript strict — all new code typed
✅ Tailwind classes used (no inline styles)
⚠️ Missing test for new hook — adding
```

## Success Criteria

- Every change maps to a requirement
- No scope creep detected
- Build and tests pass after implementation

## Related Skills

- [context-engineering](../context-engineering/) — For building task context
- [test-fixing](../test-fixing/) — For fixing any test failures found
