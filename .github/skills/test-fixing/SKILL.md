# Test Fixing

## Purpose

Fix failing tests, prevent regressions when modifying logic, and maintain test coverage. Cooper uses Vitest for unit/component tests and Playwright for E2E tests.

## When to Use

- Any test fails after your changes
- Modifying logic that has existing tests
- Adding new features that need test coverage

## When NOT to Use

- Tests unrelated to your changes (document and move on)
- Flaky tests that fail intermittently (report, don't fix inline)

## Activation Rules

### Step 1: Establish Baseline

Before making changes, run the relevant test suite:

```bash
# Unit/component tests
npm test

# Specific test file
npx vitest run tests/components/MyComponent.test.tsx

# E2E tests (requires build first)
npm run test:e2e
```

### Step 2: Run Tests After Changes

After every significant modification:

- Run `npm test` for unit/component tests
- If UI changed, run `npm run test:e2e` for E2E

### Step 3: Fix Root Cause

**Fix the code, not the test** — unless the test itself is wrong.

- If test expectation is outdated → update the test
- If code broke the contract → fix the code
- If new behavior needs testing → add a new test

### Step 4: Add Tests for New Features

**Test file conventions:**

- Unit tests: `tests/components/<Component>.test.tsx`
- Integration tests: `tests/integration/<feature>.test.ts`
- E2E tests: `tests/e2e/<flow>.spec.ts`

**Test patterns:**

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('ComponentName', () => {
  it('should handle expected behavior', () => {
    // Arrange → Act → Assert
  });
});
```

## Cooper-Specific Notes

- **Vitest** for unit/component tests (`vitest.config.ts`)
- **Playwright** for E2E tests (`playwright.config.ts`)
- Mock IPC calls with `vi.fn()` for renderer component tests
- Test files live in `tests/` directory (not co-located)

## Success Criteria

- All tests pass after changes (`npm test` exits 0)
- New features have at least one test
- No test was deleted to make the suite pass

## Related Skills

- [review-implementing](../review-implementing/) — For validating changes
