import { describe, it, expect } from 'vitest';

import {
  initTelemetry,
  trackEvent,
  setTag,
  TelemetryEvents,
} from '../../src/renderer/utils/telemetry';

describe('Telemetry Module (stubbed)', () => {
  describe('TelemetryEvents constants', () => {
    it('should have SESSION_CREATED event', () => {
      expect(TelemetryEvents.SESSION_CREATED).toBe('session_created');
    });
  });

  describe('no-op functions', () => {
    it('initTelemetry should resolve without error', async () => {
      await expect(initTelemetry('1.5.0', 'main')).resolves.not.toThrow();
    });

    it('trackEvent should not throw', () => {
      expect(() => trackEvent('test_event')).not.toThrow();
    });

    it('setTag should not throw', () => {
      expect(() => setTag('key', 'value')).not.toThrow();
    });
  });
});
