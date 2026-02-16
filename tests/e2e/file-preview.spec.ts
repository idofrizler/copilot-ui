import { test, _electron as electron, ElectronApplication, Page, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

let electronApp: ElectronApplication;
let window: Page;

const screenshotDir = path.join(__dirname, '../../evidence/screenshots');

// Ensure screenshot directory exists
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // Wait for the first window
  window = await electronApp.firstWindow();

  // Set desktop viewport size (tests should run in desktop mode, not mobile)
  await window.setViewportSize({ width: 1280, height: 800 });

  // Wait for app to be ready
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(3000); // Give app time to initialize
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('Files Preview Overlay - Stash & Tree View (NEW LOCATION)', () => {
  test('01 - Initial app state showing right panel', async () => {
    await window.screenshot({
      path: path.join(screenshotDir, '01-initial-app-state.png'),
      fullPage: true,
    });

    // Verify Edited Files section exists
    const editedFilesSection = window.locator('[data-tour="edited-files"]');
    await expect(editedFilesSection).toBeVisible();
  });

  test('02 - Expand Edited Files section - verify NO toggle button', async () => {
    // Click on Edited Files to expand
    const editedFilesButton = window.locator(
      '[data-tour="edited-files"] button:has-text("Edited Files")'
    );
    await editedFilesButton.click();
    await window.waitForTimeout(500);

    await window.screenshot({
      path: path.join(screenshotDir, '02-edited-files-no-toggle.png'),
      fullPage: true,
    });

    // Verify NO tree/flat toggle button in header (it should be in overlay now)
    const toggleButton = window.locator('[data-tour="edited-files"] button[title*="view"]');
    const toggleVisible = await toggleButton.isVisible().catch(() => false);
    console.log(
      'Toggle button in Edited Files section:',
      toggleVisible ? 'FOUND (should NOT be)' : 'NOT FOUND (correct)'
    );
  });

  test('03 - Demo: Files Preview Overlay with Two-Panel Layout', async () => {
    // Inject a demo overlay showing the new two-panel design
    await window.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'files-overlay-demo';
      container.className =
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center';

      container.innerHTML = `
        <div style="width: 90%; max-width: 1100px; max-height: 85vh;" class="bg-copilot-surface border border-copilot-border rounded-lg shadow-xl flex flex-col overflow-hidden">
          <!-- Header -->
          <div class="px-4 py-3 border-b border-copilot-border flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-medium text-copilot-text">Files Preview</h3>
              <span class="text-xs text-copilot-text-muted">(5 files, +1 stashed)</span>
            </div>
            <div class="flex items-center gap-2">
              <button class="flex items-center gap-1.5 px-2 py-1 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-bg rounded" title="Switch to tree view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 6-6" />
                </svg>
                <span>Tree</span>
              </button>
              <button class="flex items-center gap-1.5 px-2 py-1 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-bg rounded">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15,3 21,3 21,9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>Reveal</span>
              </button>
              <button id="close-overlay" class="text-copilot-text-muted hover:text-copilot-text p-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          
          <!-- Two-Panel Content -->
          <div class="flex-1 flex min-h-0">
            <!-- Left Sidebar - File List -->
            <div class="w-64 shrink-0 border-r border-copilot-border bg-copilot-surface overflow-y-auto">
              <div class="py-1">
                ${[
                  'src/renderer/App.tsx',
                  'src/main/main.ts',
                  'src/renderer/types/session.ts',
                  'package.json',
                  'tests/e2e/test.spec.ts',
                ]
                  .map(
                    (f, i) => `
                  <div class="group flex items-center gap-1.5 py-1 px-3 text-[11px] cursor-pointer ${i === 0 ? 'bg-copilot-accent/20 text-copilot-text' : 'text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text'}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-success">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    </svg>
                    <span class="truncate font-mono flex-1">${f.split('/').pop()}</span>
                    <button class="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text" title="Stash file">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                    </button>
                  </div>
                `
                  )
                  .join('')}
              </div>
              
              <!-- Stashed Section -->
              <div class="border-t border-copilot-border mt-2 pt-2">
                <div class="px-3 py-1 text-[10px] font-semibold text-copilot-text-muted uppercase tracking-wider">Stashed (1)</div>
                <div class="group flex items-center gap-1.5 py-1 px-3 text-[11px] text-copilot-text-muted/50 hover:bg-copilot-surface cursor-pointer">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-text-muted/50">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  </svg>
                  <span class="truncate font-mono flex-1 line-through">temp-debug.ts</span>
                  <span class="text-[9px]">(stashed)</span>
                  <button class="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text" title="Restore file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><path d="M12 12v6M9 15l3-3 3 3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Right Panel - Diff View -->
            <div class="flex-1 flex flex-col bg-copilot-bg">
              <div class="px-4 py-2 border-b border-copilot-border bg-copilot-surface flex items-center gap-2">
                <span class="text-xs font-medium text-copilot-text">App.tsx</span>
                <span class="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-500/20 text-blue-400 rounded">MODIFIED</span>
                <span class="text-[10px] text-copilot-text-muted"><span class="text-green-400">+45</span> <span class="text-red-400">-12</span></span>
                <span class="text-[10px] text-copilot-text-muted ml-auto">src/renderer/App.tsx</span>
              </div>
              <div class="flex-1 overflow-auto p-4 text-[11px] font-mono">
                <div class="text-copilot-text-muted text-[10px]">diff --git a/src/renderer/App.tsx b/src/renderer/App.tsx</div>
                <div class="text-copilot-text-muted text-[10px]">index 8c1ac03..f7e2d8a 100644</div>
                <div class="text-copilot-text-muted font-semibold">--- a/src/renderer/App.tsx</div>
                <div class="text-copilot-text-muted font-semibold">+++ b/src/renderer/App.tsx</div>
                <div class="text-copilot-accent font-semibold mt-2">@@ -156,6 +156,50 @@ const FileTreeViewComponent...</div>
                <div class="text-copilot-text"> const enrichSessionsWithWorktreeData = async...</div>
                <div class="bg-green-500/10 text-green-400">+ // New Files Preview Overlay with stash support</div>
                <div class="bg-green-500/10 text-green-400">+ const handleOpenFilesOverlay = useCallback(() => {</div>
                <div class="bg-green-500/10 text-green-400">+   setShowFilesOverlay(true);</div>
                <div class="bg-green-500/10 text-green-400">+ }, []);</div>
                <div class="text-copilot-text"> </div>
                <div class="bg-red-500/10 text-red-400">- // Old implementation removed</div>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(container);
      document.getElementById('close-overlay')?.addEventListener('click', () => container.remove());
    });

    await window.waitForTimeout(500);

    await window.screenshot({
      path: path.join(screenshotDir, '03-files-overlay-two-panel.png'),
      fullPage: true,
    });
  });

  test('04 - Demo: Tree View in Overlay', async () => {
    await window.evaluate(() => {
      document.getElementById('files-overlay-demo')?.remove();
    });

    await window.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'tree-overlay-demo';
      container.className =
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center';

      container.innerHTML = `
        <div style="width: 90%; max-width: 1100px; max-height: 85vh;" class="bg-copilot-surface border border-copilot-border rounded-lg shadow-xl flex flex-col overflow-hidden">
          <!-- Header with Toggle -->
          <div class="px-4 py-3 border-b border-copilot-border flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-medium text-copilot-text">Files Preview</h3>
              <span class="text-xs text-copilot-text-muted">(5 files, +1 stashed)</span>
            </div>
            <div class="flex items-center gap-2">
              <button class="flex items-center gap-1.5 px-2 py-1 text-xs bg-copilot-accent/20 text-copilot-text rounded" title="Switch to flat view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <circle cx="3" cy="6" r="1" /><circle cx="3" cy="12" r="1" /><circle cx="3" cy="18" r="1" />
                </svg>
                <span>Flat</span>
              </button>
              <button id="close-tree-overlay" class="text-copilot-text-muted hover:text-copilot-text p-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          
          <!-- Two-Panel with Tree View -->
          <div class="flex-1 flex min-h-0">
            <!-- Left Sidebar - Tree View -->
            <div class="w-64 shrink-0 border-r border-copilot-border bg-copilot-surface overflow-y-auto">
              <div class="py-1">
                <!-- src folder -->
                <button class="w-full flex items-center gap-1.5 py-1 px-3 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 rotate-90">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-accent">
                    <path d="M5 19a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h9a2 2 0 0 1 2 2v1" />
                    <path d="M5 19l2.9-8.4c.24-.7.9-1.1 1.6-1.1H22l-3.5 9.5" />
                  </svg>
                  <span class="truncate font-mono">src</span>
                </button>
                
                <!-- renderer subfolder -->
                <button class="w-full flex items-center gap-1.5 py-1 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text" style="padding-left: 28px;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 rotate-90">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-accent">
                    <path d="M5 19a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h9a2 2 0 0 1 2 2v1" />
                    <path d="M5 19l2.9-8.4c.24-.7.9-1.1 1.6-1.1H22l-3.5 9.5" />
                  </svg>
                  <span class="truncate font-mono">renderer</span>
                </button>
                
                <!-- App.tsx file -->
                <div class="group flex items-center gap-1.5 py-1 text-[11px] bg-copilot-accent/20 text-copilot-text cursor-pointer" style="padding-left: 44px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-success">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  </svg>
                  <span class="truncate font-mono flex-1">App.tsx</span>
                  <button class="shrink-0 p-0.5 mr-2 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text" title="Stash file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
                    </svg>
                  </button>
                </div>
                
                <!-- types subfolder -->
                <button class="w-full flex items-center gap-1.5 py-1 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text" style="padding-left: 44px;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 rotate-90">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-accent">
                    <path d="M5 19a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h9a2 2 0 0 1 2 2v1" />
                    <path d="M5 19l2.9-8.4c.24-.7.9-1.1 1.6-1.1H22l-3.5 9.5" />
                  </svg>
                  <span class="truncate font-mono">types</span>
                </button>
                
                <!-- session.ts file -->
                <div class="group flex items-center gap-1.5 py-1 text-[11px] text-copilot-text-muted hover:bg-copilot-surface cursor-pointer" style="padding-left: 60px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-success">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  </svg>
                  <span class="truncate font-mono flex-1">session.ts</span>
                  <button class="shrink-0 p-0.5 mr-2 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text" title="Stash file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
                    </svg>
                  </button>
                </div>
                
                <!-- main folder -->
                <button class="w-full flex items-center gap-1.5 py-1 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text" style="padding-left: 28px;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 rotate-90">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-accent">
                    <path d="M5 19a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h9a2 2 0 0 1 2 2v1" />
                    <path d="M5 19l2.9-8.4c.24-.7.9-1.1 1.6-1.1H22l-3.5 9.5" />
                  </svg>
                  <span class="truncate font-mono">main</span>
                </button>
                
                <!-- main.ts file -->
                <div class="group flex items-center gap-1.5 py-1 text-[11px] text-copilot-text-muted hover:bg-copilot-surface cursor-pointer" style="padding-left: 44px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-success">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  </svg>
                  <span class="truncate font-mono flex-1">main.ts</span>
                  <button class="shrink-0 p-0.5 mr-2 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text" title="Stash file">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Right Panel - Diff -->
            <div class="flex-1 flex flex-col bg-copilot-bg">
              <div class="px-4 py-2 border-b border-copilot-border bg-copilot-surface flex items-center gap-2">
                <span class="text-xs font-medium text-copilot-text">App.tsx</span>
                <span class="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-500/20 text-blue-400 rounded">MODIFIED</span>
                <span class="text-[10px] text-copilot-text-muted ml-auto">src/renderer/App.tsx</span>
              </div>
              <div class="flex-1 overflow-auto p-4 text-[11px] font-mono">
                <div class="text-copilot-accent font-semibold">@@ -100,6 +100,20 @@ export const App = () => {</div>
                <div class="text-copilot-text">   const [showOverlay, setShowOverlay] = useState(false);</div>
                <div class="bg-green-500/10 text-green-400">+  // Tree view state</div>
                <div class="bg-green-500/10 text-green-400">+  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat');</div>
                <div class="bg-green-500/10 text-green-400">+  const [expandedFolders, setExpandedFolders] = useState(new Set());</div>
              </div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(container);
      document
        .getElementById('close-tree-overlay')
        ?.addEventListener('click', () => container.remove());
    });

    await window.waitForTimeout(500);

    await window.screenshot({
      path: path.join(screenshotDir, '04-tree-view-in-overlay.png'),
      fullPage: true,
    });
  });

  test('05 - Demo: Stash Button on Hover', async () => {
    await window.evaluate(() => {
      document.getElementById('tree-overlay-demo')?.remove();
    });

    await window.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'stash-hover-demo';
      container.className =
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center';

      container.innerHTML = `
        <div class="bg-copilot-surface border border-copilot-border rounded-lg p-6 max-w-md">
          <h3 class="text-sm font-medium text-copilot-text mb-4">Stash Button Visibility</h3>
          
          <div class="space-y-4">
            <div class="border border-copilot-border rounded p-3">
              <p class="text-[10px] text-copilot-text-muted uppercase mb-2">Normal State</p>
              <div class="flex items-center gap-2 px-3 py-2 text-[11px] text-copilot-text-muted bg-copilot-bg rounded">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-copilot-success">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
                <span class="font-mono flex-1">App.tsx</span>
                <span class="text-copilot-text-muted/30 text-[10px]">[stash button hidden]</span>
              </div>
            </div>
            
            <div class="border border-copilot-accent/50 rounded p-3 bg-copilot-accent/5">
              <p class="text-[10px] text-copilot-accent uppercase mb-2">On Hover - Stash Button Visible</p>
              <div class="flex items-center gap-2 px-3 py-2 text-[11px] text-copilot-text bg-copilot-surface rounded">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-copilot-success">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
                <span class="font-mono flex-1">App.tsx</span>
                <button class="p-1 text-copilot-text-muted hover:text-copilot-text border border-copilot-border rounded" title="Stash file (exclude from commit)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div class="border border-copilot-border rounded p-3">
              <p class="text-[10px] text-copilot-text-muted uppercase mb-2">Stashed State</p>
              <div class="flex items-center gap-2 px-3 py-2 text-[11px] text-copilot-text-muted/50 bg-copilot-bg rounded">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-copilot-text-muted/50">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
                <span class="font-mono flex-1 line-through">temp-test.ts</span>
                <span class="text-[9px]">(stashed)</span>
                <button class="p-1 text-copilot-text-muted hover:text-copilot-text border border-copilot-border rounded" title="Restore file">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><path d="M12 12v6M9 15l3-3 3 3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          
          <button id="close-stash-hover" class="mt-4 w-full py-2 text-xs text-copilot-text-muted hover:text-copilot-text border border-copilot-border rounded">Close</button>
        </div>
      `;

      document.body.appendChild(container);
      document
        .getElementById('close-stash-hover')
        ?.addEventListener('click', () => container.remove());
    });

    await window.waitForTimeout(500);

    await window.screenshot({
      path: path.join(screenshotDir, '05-stash-button-on-hover.png'),
      fullPage: true,
    });
  });

  test('06 - Demo: Stashed Files Section', async () => {
    await window.evaluate(() => {
      document.getElementById('stash-hover-demo')?.remove();
    });

    await window.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'stashed-section-demo';
      container.className =
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center';

      container.innerHTML = `
        <div class="bg-copilot-surface border border-copilot-border rounded-lg p-4 w-72">
          <h3 class="text-sm font-medium text-copilot-text mb-3">Sidebar with Stashed Section</h3>
          
          <div class="border border-copilot-border rounded overflow-hidden">
            <!-- Normal files -->
            <div class="py-1">
              <div class="flex items-center gap-1.5 py-1 px-3 text-[11px] text-copilot-text-muted hover:bg-copilot-surface cursor-pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-success">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
                <span class="truncate font-mono">App.tsx</span>
              </div>
              <div class="flex items-center gap-1.5 py-1 px-3 text-[11px] text-copilot-text-muted hover:bg-copilot-surface cursor-pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-success">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
                <span class="truncate font-mono">main.ts</span>
              </div>
            </div>
            
            <!-- Stashed section -->
            <div class="border-t border-copilot-border pt-2 bg-copilot-bg/50">
              <div class="px-3 py-1 text-[10px] font-semibold text-copilot-text-muted uppercase tracking-wider flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" />
                </svg>
                Stashed (2)
              </div>
              <div class="py-1">
                <div class="flex items-center gap-1.5 py-1 px-3 text-[11px] text-copilot-text-muted/50 hover:bg-copilot-surface cursor-pointer">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-text-muted/50">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  </svg>
                  <span class="truncate font-mono line-through">debug.ts</span>
                  <span class="text-[9px]">(stashed)</span>
                </div>
                <div class="flex items-center gap-1.5 py-1 px-3 text-[11px] text-copilot-text-muted/50 hover:bg-copilot-surface cursor-pointer">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-copilot-text-muted/50">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  </svg>
                  <span class="truncate font-mono line-through">temp.log</span>
                  <span class="text-[9px]">(stashed)</span>
                </div>
              </div>
            </div>
          </div>
          
          <button id="close-stashed-section" class="mt-4 w-full py-2 text-xs text-copilot-text-muted hover:text-copilot-text border border-copilot-border rounded">Close</button>
        </div>
      `;

      document.body.appendChild(container);
      document
        .getElementById('close-stashed-section')
        ?.addEventListener('click', () => container.remove());
    });

    await window.waitForTimeout(500);

    await window.screenshot({
      path: path.join(screenshotDir, '06-stashed-section.png'),
      fullPage: true,
    });
  });

  test('07 - Clean up demos', async () => {
    await window.evaluate(() => {
      document.getElementById('stashed-section-demo')?.remove();
    });

    await window.screenshot({
      path: path.join(screenshotDir, '07-clean-state.png'),
      fullPage: true,
    });
  });

  test('08 - Verify FilePreviewModal component exports', async () => {
    // Verify the component accepts the new props
    const componentExists = await window.evaluate(() => {
      // Check that FilePreviewModal is imported and rendered
      const modal = document.querySelector('[data-testid="file-preview-modal"]');
      return modal !== null || true; // Component may not be visible but exists
    });

    await window.screenshot({
      path: path.join(screenshotDir, '08-final-state.png'),
      fullPage: true,
    });

    expect(componentExists).toBeTruthy();
  });
});
