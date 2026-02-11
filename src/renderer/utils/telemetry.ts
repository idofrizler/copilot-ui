/**
 * Telemetry module using Microsoft Clarity
 *
 * This module provides telemetry tracking for app usage patterns without collecting PII.
 * It tracks: app versions, feature usage, and general adoption metrics.
 *
 * Both production (packaged) and development builds are tracked, but tagged differently
 * so they can be filtered in the Clarity dashboard.
 *
 * User identification: Uses a stable installation ID (persisted in electron-store) to
 * correctly identify the same user across sessions. This ensures that reopening the app
 * counts as a new session but the same user.
 */

import Clarity from '@microsoft/clarity';

// Clarity project ID from issue #135
const CLARITY_PROJECT_ID = 'vbhii7ly59';

let isInitialized = false;

/**
 * Initialize Clarity telemetry
 * Should be called once when the app starts
 *
 * Note: Clarity sessions are per-app-launch, not per-session within the app.
 * Each time a user opens Cooper = one Clarity session.
 * The same installation = the same user (via Clarity.identify).
 *
 * @param appVersion - The app version string
 * @param gitBranch - The git branch at build time
 */
export async function initTelemetry(appVersion: string, gitBranch: string): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    // Check if this is a packaged/distributed app
    const isPackaged = await window.electronAPI.app.isPackaged();
    const environment = isPackaged ? 'production' : 'development';

    // Get stable installation ID for user identification
    const installationId = await window.electronAPI.app.getInstallationId();

    Clarity.init(CLARITY_PROJECT_ID);
    isInitialized = true;

    // Identify this installation as a unique "user" so Clarity can track
    // the same user across sessions (app restarts)
    // The friendly name shows a short readable ID in the Clarity dashboard
    const friendlyName = `User-${installationId.substring(0, 8)}`;
    Clarity.identify(installationId, undefined, undefined, friendlyName);

    // Set initial tags for context (no PII)
    Clarity.setTag('app_version', appVersion);
    Clarity.setTag('git_branch', gitBranch);
    Clarity.setTag('environment', environment);
    // Let Clarity handle platform detection automatically (more reliable than deprecated navigator.platform)

    console.log(
      `Telemetry: Initialized (environment=${environment}, user=${installationId.substring(0, 8)}...)`
    );
  } catch (error) {
    // Telemetry failures should not break the app
    console.warn('Failed to initialize Clarity telemetry:', error);
  }
}

/**
 * Track a custom event for feature usage
 */
export function trackEvent(eventName: string): void {
  if (!isInitialized) {
    return;
  }

  try {
    Clarity.event(eventName);
  } catch (error) {
    // Silently ignore telemetry errors
  }
}

/**
 * Set a custom tag for additional context
 */
export function setTag(key: string, value: string): void {
  if (!isInitialized) {
    return;
  }

  try {
    Clarity.setTag(key, value);
  } catch (error) {
    // Silently ignore telemetry errors
  }
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
