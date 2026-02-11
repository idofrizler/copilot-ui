# Code Refactoring Guide

## Purpose

Evaluate code quality and suggest refactoring opportunities before committing. Ensure Cooper's codebase stays clean and maintainable.

## When to Use

- Before committing code changes (as a final quality check)
- When touching files with known complexity
- During feature implementation that modifies existing code

## When NOT to Use

- Emergency hotfixes (refactor separately after)
- Documentation-only changes

## Activation Rules

### Step 1: Check Quality Metrics

| Metric          | Target          | Action if Exceeded           |
| --------------- | --------------- | ---------------------------- |
| Function length | < 50 lines      | Extract helper functions     |
| File length     | < 300 lines     | Split into modules           |
| Nesting depth   | < 3 levels      | Early returns, extract logic |
| Duplicate code  | < 3 occurrences | Extract shared utility       |

### Step 2: Cooper-Specific Checks

- **Main process** (`src/main/`): Are IPC handlers focused? One handler per concern?
- **Preload** (`src/preload/`): Is the bridge API clean and namespaced?
- **Renderer** (`src/renderer/`): Components decomposed? Hooks extracted?
- **Types** (`src/renderer/types/`): Interfaces well-defined? No `any` types?

### Step 3: Accept/Reject Refactoring

**ACCEPT refactoring if:**

- Improves readability without changing behavior
- Reduces duplication
- Makes testing easier
- Stays within the scope of current changes

**REJECT refactoring if:**

- Touches unrelated code
- High risk of introducing regressions
- Would significantly increase PR size
- Is purely cosmetic (renaming for style preference)

### Step 4: Verify After Refactoring

```bash
npm run build   # No type errors
npm test        # No regressions
```

## Cooper-Specific Patterns

**Extract IPC handler:**

```typescript
// Before: fat handler in main.ts
ipcMain.handle('copilot:send-message', async (_, sessionId, message) => {
  // 50+ lines of logic
});

// After: extracted to module
ipcMain.handle('copilot:send-message', handleSendMessage);
```

**Extract React hook:**

```typescript
// Before: logic in component
const [sessions, setSessions] = useState([]);
useEffect(() => {
  /* fetch logic */
}, []);

// After: custom hook
const { sessions } = useSessions();
```

## Success Criteria

- Quality metrics within targets
- No `any` types in new code
- Functions focused on single responsibility
- Build and tests pass after refactoring

## Related Skills

- [review-implementing](../review-implementing/) — For validating refactoring scope
- [test-fixing](../test-fixing/) — For fixing tests after refactoring
