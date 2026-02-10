import { afterEach, vi } from 'vitest';

// This file is used for jsdom tests, but some tests run in Node (e.g. src/main/*.test.ts).
// Make the setup a no-op in Node.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');

  // Cleanup after each test
  afterEach(() => {
    cleanup();
  });

  // Mock window.electronAPI
  Object.defineProperty(window, 'electronAPI', {
    writable: true,
    value: {
      worktree: {
        listSessions: vi.fn().mockResolvedValue({ sessions: [] }),
      },
      git: {
        listBranches: vi.fn().mockResolvedValue({ success: true, branches: ['main'] }),
        getChangedFiles: vi.fn().mockResolvedValue({ success: true, files: [] }),
        checkMainAhead: vi.fn().mockResolvedValue({ success: true, isAhead: false, commits: [] }),
        getDiff: vi.fn().mockResolvedValue({ success: true, diff: '' }),
        generateCommitMessage: vi.fn().mockResolvedValue('Update files'),
      },
      settings: {
        getTargetBranch: vi.fn().mockResolvedValue({ success: true, targetBranch: 'main' }),
        setTargetBranch: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  });

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock ResizeObserver
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

  // Mock IntersectionObserver
  class IntersectionObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  window.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
}
