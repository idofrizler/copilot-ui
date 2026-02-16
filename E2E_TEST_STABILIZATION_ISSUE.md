# E2E Test Stabilization: Fix 76 Failing Tests

## Problem

76 E2E tests are currently failing on the `staging` branch (pre-existing failures, not related to any recent code changes). These failures prevent the E2E test suite from being a reliable gate for CI/CD.

**Test Results:** 92 passing, 76 failing, 15 skipped (37.9 min runtime)

## Root Causes

### 1. Element Visibility Issues (Most Common)

- **Symptom:** `element is outside of the viewport`
- **Cause:** Elements not scrolled into view before interaction
- **Affected:** Session History, Ralph/Lisa modes, Worktree panels

### 2. Timeout Issues (Second Most Common)

- **Symptom:** `Timeout 30000ms exceeded`
- **Cause:** Modals/panels not opening within timeout
- **Affected:** Session History modal, Mark as Unread, Voice settings

### 3. Locator Issues

- **Symptom:** Element not found or multiple matches
- **Cause:** Incorrect or ambiguous selectors
- **Affected:** Toggle buttons, dropdowns

## Failing Test Categories

### Category 1: Session History Modal (13 tests) ⚠️ HIGH PRIORITY

- `should open modal when clicking the button`
- `should have search input with correct placeholder`
- `should auto-focus search input when modal opens`
- `should close modal when clicking X button`
- All search functionality tests
- All session resumption tests

**Root Cause:** Button click succeeds but modal doesn't appear/timeout

### Category 2: Mark as Unread Feature (7 tests)

- `03 - Mark for Review adds blue indicator`
- `04 - Right-click shows Remove Mark option`
- `05 - Add Note opens modal`
- `07 - Save note shows banner`
- `08-11` - Various note/indicator tests

**Root Cause:** Context menu interactions and modal timeouts

### Category 3: Ralph/Lisa Improvements (15 tests)

- Panel opening tests
- Checkbox/toggle interactions
- Max iterations input
- Mode switching tests

**Root Cause:** Panel not opening or elements outside viewport

### Category 4: Merged Session History (10 tests)

- Filter toggle tests
- Worktree filter tests
- Search with filter tests

**Root Cause:** Modal opening timeouts

### Category 5: Voice Settings (6 tests)

- Toggle Always Listening
- Toggle Push to Talk
- Toggle Text-to-Speech
- Close settings modal

**Root Cause:** Toggle button locators or settings navigation

### Category 6: UX Changes #275 (6 tests)

- Models dropdown
- Agents dropdown
- Loops dropdown
- Ralph/Lisa selection

**Root Cause:** Dropdowns not opening

### Category 7: Miscellaneous (19 tests)

- Layout tests (2)
- Lisa loop icon (1)
- Run in terminal (1)
- Screenshot tests (2)
- Telemetry (1)
- Agent selection (1)
- Voice server (2)
- Mode toggles (1)
- Modal escape (1)
- Worktree (1)
- Welcome wizard (6)

## Proposed Solution

### Phase 1: Add Viewport Helpers (2-3 hours)

```typescript
// tests/e2e/helpers/viewport.ts
export async function scrollIntoViewAndClick(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  await locator.click();
}

export async function waitForModal(window: Page, modalTitle: string) {
  const modal = window.locator('[role="dialog"]');
  await modal.waitFor({ state: 'visible', timeout: 10000 });
  const title = modal.locator('h3', { hasText: modalTitle });
  await title.waitFor({ state: 'visible', timeout: 5000 });
}
```

### Phase 2: Fix Modal Opening Tests (3-4 hours)

- Update `openSessionHistoryModal()` helper with longer timeouts
- Add scroll-into-view before clicking buttons
- Wait for modal visibility explicitly
- Update all modal interaction tests

### Phase 3: Fix Toggle/Dropdown Tests (2-3 hours)

- Improve toggle button locators (use data-testid)
- Add explicit waits for dropdown expansion
- Scroll panels into view before interaction

### Phase 4: Fix Miscellaneous (2-3 hours)

- Layout tests: Update window control expectations
- Screenshot tests: Add proper waits
- Voice server: Fix IPC expectations or skip if not implemented

### Phase 5: Make Tests Faster (1-2 hours)

- Enable parallel execution (workers: 2-4)
- Reduce unnecessary `waitForTimeout` calls
- Use more specific locators (faster)
- Skip screenshot generation in CI

## Acceptance Criteria

- [ ] All 188 E2E tests passing (0 failures)
- [ ] Test suite runtime <20 minutes (currently 37.9 min)
- [ ] No flaky tests (run 3x successfully)
- [ ] CI can use E2E tests as gate

## Estimated Effort

**Total: 10-15 hours**

- Investigation: 2-3 hours
- Fixes: 6-9 hours
- Testing/verification: 2-3 hours

## Notes

- These failures exist on `staging` branch (confirmed)
- Not caused by any recent code changes
- Issue #271 (keypress latency fix) is complete and all relevant tests pass
- This is purely test infrastructure work

## Related

- Closes future E2E test failures
- Enables reliable CI/CD gating on E2E tests
