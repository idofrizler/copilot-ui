/**
 * Telemetry module using Microsoft Clarity
 *
 * This module provides telemetry tracking for app usage patterns without collecting PII.
 * It tracks: app versions, feature usage, and general adoption metrics.
 */

import Clarity from '@microsoft/clarity';

// Clarity project ID from issue #135
const CLARITY_PROJECT_ID = 'vbhii7ly59';

let isInitialized = false;

/**
 * Initialize Clarity telemetry
 * Should be called once when the app starts
 */
export function initTelemetry(appVersion: string, gitBranch: string): void {
  if (isInitialized) {
    return;
  }

  try {
    Clarity.init(CLARITY_PROJECT_ID);
    isInitialized = true;

    // Set initial tags for context (no PII)
    Clarity.setTag('app_version', appVersion);
    Clarity.setTag('git_branch', gitBranch);
    // Let Clarity handle platform detection automatically (more reliable than deprecated navigator.platform)
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
