import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the @microsoft/clarity module before any imports
vi.mock('@microsoft/clarity', () => ({
  default: {
    init: vi.fn(),
    event: vi.fn(),
    setTag: vi.fn(),
  },
}));

// Mock the electronAPI for isPackaged and getInstallationId
const mockIsPackaged = vi.fn().mockResolvedValue(false);
const mockGetInstallationId = vi.fn().mockResolvedValue('test-installation-id');
vi.stubGlobal('window', {
  electronAPI: {
    app: {
      isPackaged: mockIsPackaged,
      getInstallationId: mockGetInstallationId,
    },
  },
});

import Clarity from '@microsoft/clarity';
import {
  initTelemetry,
  trackEvent,
  setTag,
  TelemetryEvents,
} from '../../src/renderer/utils/telemetry';

describe('Telemetry Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TelemetryEvents constants', () => {
    it('should have SESSION_CREATED event', () => {
      expect(TelemetryEvents.SESSION_CREATED).toBe('session_created');
    });

    it('should have FEATURE_RALPH_ENABLED event', () => {
      expect(TelemetryEvents.FEATURE_RALPH_ENABLED).toBe('feature_ralph_enabled');
    });

    it('should have FEATURE_LISA_ENABLED event', () => {
      expect(TelemetryEvents.FEATURE_LISA_ENABLED).toBe('feature_lisa_enabled');
    });

    it('should have FEATURE_WORKTREE_CREATED event', () => {
      expect(TelemetryEvents.FEATURE_WORKTREE_CREATED).toBe('feature_worktree_created');
    });

    it('should have FEATURE_MODEL_CHANGED event', () => {
      expect(TelemetryEvents.FEATURE_MODEL_CHANGED).toBe('feature_model_changed');
    });

    it('should have FEATURE_THEME_CHANGED event', () => {
      expect(TelemetryEvents.FEATURE_THEME_CHANGED).toBe('feature_theme_changed');
    });

    it('should have FEATURE_MCP_CONNECTED event', () => {
      expect(TelemetryEvents.FEATURE_MCP_CONNECTED).toBe('feature_mcp_connected');
    });

    it('should have FEATURE_TERMINAL_OPENED event', () => {
      expect(TelemetryEvents.FEATURE_TERMINAL_OPENED).toBe('feature_terminal_opened');
    });
  });

  describe('trackEvent function', () => {
    it('should be a function', () => {
      expect(typeof trackEvent).toBe('function');
    });

    it('should not throw when called with event name', () => {
      expect(() => trackEvent('test_event')).not.toThrow();
    });
  });

  describe('setTag function', () => {
    it('should be a function', () => {
      expect(typeof setTag).toBe('function');
    });

    it('should not throw when called with key and value', () => {
      expect(() => setTag('test_key', 'test_value')).not.toThrow();
    });
  });

  describe('initTelemetry function', () => {
    it('should be a function', () => {
      expect(typeof initTelemetry).toBe('function');
    });

    it('should return a promise', () => {
      const result = initTelemetry('1.5.0', 'main');
      expect(result).toBeInstanceOf(Promise);
    });

    it('should not throw when called', async () => {
      await expect(initTelemetry('1.5.0', 'main')).resolves.not.toThrow();
    });
  });
});
