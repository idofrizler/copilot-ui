# E2E Test Triage & Speed Optimization Plan

## Current Status

**Progress**: 76 → 62 failing tests (**14 tests fixed!** 🎉)
**Runtime**: 30+ minutes (too slow)
**Target**: <15 minutes, 0 failures

## Test Results Breakdown

**Passing**: 110+ tests
**Failing**: 62 tests  
**Skipped**: 5-15 tests

## Failure Categories & Root Causes

### 1. Session History Modal - 14 tests ⚠️ CRITICAL

**Files**: `session-history.spec.ts`, `merged-session-history.spec.ts`, `modal-escape.spec.ts`
**Issue**: Modal not appearing even after sidebar expansion
**Failure time**: 2.8-3.0s (fast fail = not finding element)
**Root cause to investigate**:

- Modal button click succeeds but modal doesn't render
- Possible state management issue
- May need to wait for IPC call to complete
- Button might be wrong (multiple Session History buttons?)

**Action needed**: Deep dive into why modal isn't rendering

### 2. Ralph/Lisa Panel - 13 tests ⚠️ HIGH PRIORITY

**File**: `ralph-improvements.spec.ts`
**Issue**: Agent Modes panel not opening, elements not visible
**Failure time**: 10-15s (timeout)
**Root cause**: Similar to sidebar - panel might be collapsed or button not clickable
**Action needed**: Add panel expansion helper similar to `ensureSidebarExpanded()`

### 3. Mark as Unread - 10 tests

**File**: `mark-as-unread.spec.ts`
**Issue**: Context menu not appearing, modals timing out
**Failure time**: 10-13s (timeout)
**Root cause**: Right-click context menu timing, modal waits
**Action needed**: Increase timeouts for context menus, use viewport helpers for modals

### 4. File Preview - 2 tests

**File**: `file-preview.spec.ts`  
**Issue**: Right panel elements, toggle buttons
**Failure time**: 7.9-30s
**Action needed**: Viewport helpers + investigate right panel state

### 5. Screenshot/Telemetry - 2 tests

**Files**: `screenshot-lisa.spec.ts`, `telemetry-screenshots.spec.ts`
**Issue**: Worktree modal, screenshot timing
**Failure time**: 17-34s
**Action needed**: Apply viewport helpers

### 6. Miscellaneous - 5 tests

**Files**: `agent-selection.spec.ts`, `layout.spec.ts`, `run-in-terminal.spec.ts`
**Issues**: Various
**Action needed**: Individual investigation

## Performance Optimization Plan

### Issue: Tests take 30+ minutes (unacceptable!)

**Current config** (`playwright.config.ts`):

```typescript
workers: 1; // Sequential execution
timeout: 60000; // 60 seconds
retries: 0;
```

### Solution A: Enable Parallelization ⚡

**Problem**: Playwright comment says "Electron apps can only run one instance at a time (singleton lock)"

**Reality check**: This is TRUE for the same profile/data directory, but we can work around it:

1. **Option 1**: Use different temp directories per worker

   ```typescript
   workers: process.env.CI ? 2 : 4;
   ```

2. **Option 2**: Run test files in parallel but tests within file sequentially

   ```typescript
   fullyParallel: false; // Tests in same file run sequentially
   workers: 4;
   ```

3. **Option 3**: Split into test groups
   - Group 1: Modal tests (can share state)
   - Group 2: Settings tests
   - Group 3: UI tests
   - Run groups in parallel

**Expected speedup**: 2-4x faster (30min → 7-15min)

### Solution B: Reduce Test Overhead

1. **Remove unnecessary waits**
   - Many tests have `waitForTimeout(300)` - can we reduce?
   - Use `waitFor({ state: 'visible' })` instead of fixed delays

2. **Skip slow tests in development**
   - Mark screenshot-heavy tests as `@slow`
   - Only run in CI

3. **Optimize app startup**
   - Share Electron instance between tests where possible
   - Use `beforeAll` instead of `beforeEach` for app launch

**Expected speedup**: 10-20% faster

### Solution C: Smart Test Ordering

1. **Fast tests first** (quick feedback)
2. **Slow tests last** (screenshot, telemetry)
3. **Group related tests** (share setup/teardown)

## Next Actions

### Immediate (Next 2 hours)

1. ✅ Analyze test results - DONE
2. 🔲 Investigate Session History modal issue (why isn't it opening?)
3. 🔲 Add Agent Modes panel expansion helper
4. 🔲 Enable parallel workers (start with workers: 2)
5. 🔲 Re-run tests to verify improvements

### Short-term (Next 4 hours)

6. 🔲 Fix Ralph/Lisa panel tests (13 tests)
7. 🔲 Fix Mark as Unread context menu tests (10 tests)
8. 🔲 Increase timeout for slow operations to 15-20s
9. 🔲 Add data-testid to critical UI elements for faster/more reliable selectors

### Medium-term (Next session)

10. 🔲 Fix remaining miscellaneous tests (file-preview, screenshots, etc.)
11. 🔲 Optimize test performance further (remove unnecessary waits)
12. 🔲 Add retry logic for flaky tests
13. 🔲 Document test patterns and helpers for future developers

## Key Insights

1. **Viewport helpers are working!** 14 tests fixed proves the approach is correct
2. **Session History modal is the blocker** - needs deep investigation
3. **Tests are too slow** - parallelization is critical
4. **Many failures are 2.8-3.0s** - fast fails mean elements not found (good for debugging)
5. **Some failures are 10-15s** - timeouts mean waiting for something that never happens

## Risk Assessment

**High Risk**:

- Session History modal might have a bug in the app (not just tests)
- Parallel execution might not work without significant config changes

**Medium Risk**:

- Context menu timing is inherently flaky
- Some features might not be implemented yet

**Low Risk**:

- Viewport helpers are proven to work
- Most failures have clear patterns

## Success Metrics

- [ ] **0 failing tests** (stretch: all 188 passing)
- [ ] **<15 min runtime** (from 30+ min)
- [ ] **No flaky tests** (3 consecutive successful runs)
- [ ] **Parallel execution working** (2-4 workers)
