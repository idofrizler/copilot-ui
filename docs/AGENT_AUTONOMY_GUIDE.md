# Agent Autonomy Guide

This document describes capabilities an AI agent needs to develop, test, and verify features in this Electron/React application autonomously.

---

## Current State (Updated Jan 2026)

### What the Agent CAN Now Do
- ✅ Read/write files, run bash commands
- ✅ Run unit tests (`npm test` with vitest) - **50+ tests**
- ✅ Run component tests with React Testing Library
- ✅ Run E2E tests with Playwright for Electron - **9 tests**
- ✅ Build the app (`npm run build`)
- ✅ Web fetch (limited - markdown conversion only)
- ✅ Search codebase (grep/glob)
- ✅ Verify UI functionality via E2E tests

### What the Agent Still Cannot Do
- ❌ **Screenshot Analysis** - Cannot visually verify UI changes
- ❌ **Real-time Dev Server Interaction** - Cannot interact with hot-reload
- ❌ **Visual Regression Testing** - No Percy/Chromatic setup yet

---

## Implemented Testing Infrastructure

### Playwright E2E Tests (NEW)
```bash
npm run test:e2e        # Run E2E tests
npm run test:e2e:headed # Run with visible browser
```

Tests located in `tests/e2e/`:
- `app.spec.ts` - App launch, chat input, theme controls
- `worktree.spec.ts` - Branch widget, worktree modals

### React Testing Library (NEW)
```bash
npm run test:components
```

Tests located in `tests/components/`:
- `Button.test.tsx` - 13 tests covering variants, loading, disabled states
- `Spinner.test.tsx` - 6 tests covering sizes and classes

### Components with data-testid Support
- `Button` - `testId` prop
- `Modal` - `testId` prop (adds role="dialog")
- `Dropdown` - `testId` prop
- `GitBranchWidget` - `data-testid="git-branch-widget"`

---

## Remaining Gaps (Future Improvements)

### 1. Visual Regression Testing
**Impact: MEDIUM**

- Storybook with Percy/Chromatic integration
- Screenshot comparison in CI

### 2. IPC Integration Tests
**Impact: MEDIUM**

Mock Electron IPC tests to verify main↔renderer communication.

### 3. More data-testid Coverage
**Impact: LOW**

Add `data-testid` to remaining interactive elements (chat input, send button, etc.)

---

## Actual Test Structure (Implemented)

```
src/
├── main/
│   ├── worktree.test.ts       # Worktree session tests
│   └── utils/
│       └── extractExecutables.test.ts  # Utility tests
tests/
├── components/                 # React component tests (vitest + RTL)
│   ├── setup.ts               # Test setup with mocks
│   ├── Button.test.tsx        # Button component tests (13 tests)
│   └── Spinner.test.tsx       # Spinner component tests
├── e2e/                       # E2E tests (Playwright + Electron)
│   ├── app.spec.ts           # App launch and basic UI tests
│   └── worktree.spec.ts      # Worktree session tests
```

## Available Test Commands

```bash
# Run all unit/component tests
npm test

# Watch mode for development
npm run test:watch

# Run component tests only
npm run test:components

# Run E2E tests (builds app first)
npm run test:e2e

# Run E2E tests with browser visible
npm run test:e2e:headed

# Run all tests (unit + E2E)
npm run test:all
```

---

## How to Test Features Manually

### Starting the App
```bash
npm run dev
```

### Testing Chat Functionality
1. Type message in input field at bottom
2. Press Enter or click send
3. Verify message appears in chat
4. Verify streaming response shows spinner
5. Verify response renders markdown correctly

### Testing Worktree Sessions
1. Click branch widget in header
2. Click "New Session" 
3. Enter branch name
4. Verify worktree is created
5. Check `~/.copilot-sessions/` for new directory

### Testing Theme Switching
1. Click theme dropdown (sun/moon icon)
2. Select different theme
3. Verify colors change
4. Restart app, verify theme persists

### Testing MCP Servers
1. Open MCP servers panel (settings)
2. Add new server configuration
3. Verify server appears in list
4. Test server connection

---

## Data Testids Convention

Add `data-testid` attributes to key interactive elements:

```tsx
// Recommended pattern
<input data-testid="chat-input" ... />
<button data-testid="send-button" ... />
<div data-testid="message-{id}" ... />
<div data-testid="session-list" ... />
```

---

## What Would Make Agent Fully Autonomous

### Tier 1: Essential (Would Unblock 80% of Testing)
1. **Playwright for Electron** - E2E testing capability
2. **React Testing Library** - Component unit tests
3. **data-testid attributes** - Queryable DOM elements

### Tier 2: Valuable (Would Improve Quality)
4. **Visual regression tests** - Percy, Chromatic, or Playwright screenshots
5. **Storybook** - Component isolation and documentation
6. **CI integration** - Run all tests on every commit

### Tier 3: Nice-to-Have (Would Enable Advanced Flows)
7. **Accessibility testing** - axe-core integration
8. **Performance testing** - Lighthouse CI
9. **Coverage reporting** - Track untested code

---

## Quick Verification Commands

```bash
# Type check
npx tsc --noEmit

# Unit tests
npm test

# Lint (if configured)
npm run lint

# Build check
npm run build

# E2E tests (after setup)
npx playwright test
```

---

## Agent Self-Improvement Checklist

When adding a new feature, the agent should:

- [ ] Write unit tests FIRST (TDD)
- [ ] Add data-testid to new interactive elements
- [ ] Update this guide if new test patterns emerge
- [ ] Verify build passes before marking complete
- [ ] Document manual test steps for UI features
