/**
 * Telemetry module — stub
 *
 * Clarity integration has been removed until a compliant adoption-measurement
 * solution is identified. All public exports are retained as no-ops so that
 * call-sites compile without changes.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function initTelemetry(_appVersion: string, _gitBranch: string): Promise<void> {
  // no-op
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function trackEvent(_eventName: string): void {
  // no-op
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setTag(_key: string, _value: string): void {
  // no-op
}

// Pre-defined event names for consistent tracking
export const TelemetryEvents = {
  // Session events
  SESSION_CREATED: 'session_created',

  // Feature events
  FEATURE_RALPH_ENABLED: 'feature_ralph_enabled',
  FEATURE_LISA_ENABLED: 'feature_lisa_enabled',
  FEATURE_WORKTREE_CREATED: 'feature_worktree_created',
  FEATURE_MODEL_CHANGED: 'feature_model_changed',
  FEATURE_THEME_CHANGED: 'feature_theme_changed',
  FEATURE_MCP_CONNECTED: 'feature_mcp_connected',
  FEATURE_TERMINAL_OPENED: 'feature_terminal_opened',
} as const;
