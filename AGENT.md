# Copilot Skins - Agent Instructions

When working on this Electron application, follow these guidelines:

## Testing Requirements

When implementing **UI features**, you MUST:

1. **Add `data-testid` attributes** to new interactive elements (buttons, inputs, modals)
2. **Write e2e tests** in `tests/e2e/` using Playwright
3. **Run tests** before marking work complete
4. **Capture screenshots** in tests for visual verification

### Commands

```bash
npm run build                        # Build the app
npx playwright test tests/e2e/      # Run all e2e tests
```

### Test Pattern

```typescript
import { test, expect, _electron as electron } from '@playwright/test'
import path from 'path'

test('feature should work', async () => {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  
  // Test the feature
  const element = window.locator('[data-testid="my-element"]')
  await expect(element).toBeVisible()
  
  // Screenshot for verification
  await window.screenshot({ path: 'test-results/feature-test.png' })
  
  await electronApp.close()
})
```

### Environment Variables for Testing

- `NODE_ENV=test` - Indicates test mode
- `FORCE_PERMISSIONS_MODAL=true` - Forces the permissions modal to show (simulates missing permissions)

## Before Marking Complete

1. `npm run build` - Build succeeds
2. `npx playwright test tests/e2e/` - All tests pass
3. Review test screenshots in `test-results/`

## Architecture Notes

- **Main process**: `src/main/main.ts` - Electron main process, IPC handlers
- **Renderer**: `src/renderer/` - React frontend
- **Preload**: `src/preload/preload.ts` - Bridge between main and renderer
- **Tests**: `tests/e2e/` - Playwright e2e tests

## Key Patterns

- Use `window.electronAPI.*` for IPC calls from renderer
- Add new IPC handlers with `ipcMain.handle()` in main.ts
- Expose new APIs in preload.ts under `electronAPI`
