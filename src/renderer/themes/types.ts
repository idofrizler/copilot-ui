/**
 * Theme color tokens - all customizable colors in the app
 */
export interface ThemeColors {
  // Backgrounds
  bg: string;
  surface: string;
  surfaceHover: string;

  // Borders
  border: string;
  borderHover: string;

  // Accent colors
  accent: string;
  accentHover: string;
  accentMuted: string;

  // Text colors
  text: string;
  textMuted: string;
  textInverse: string;

  // Status colors
  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  error: string;
  errorMuted: string;

  // Scrollbar
  scrollbarThumb: string;
  scrollbarThumbHover: string;

  // Selection
  selection: string;

  // Shadows (can include rgba values)
  shadow: string;
  shadowStrong: string;

  // Terminal specific
  terminalBg: string;
  terminalText: string;
  terminalCursor: string;
}

/**
 * Theme definition
 */
export interface Theme {
  /** Unique identifier for the theme */
  id: string;
  /** Display name shown in UI */
  name: string;
  /** Base type - used for system theme matching */
  type: "light" | "dark";
  /** Color palette */
  colors: ThemeColors;
  /** Optional author info for external themes */
  author?: string;
  /** Optional version for external themes */
  version?: string;
}

/**
 * Theme preference stored in settings
 * Can be a theme id or 'system' for OS-based selection
 */
export type ThemePreference = string | "system";

/**
 * Result of theme validation
 */
export interface ThemeValidationResult {
  valid: boolean;
  theme?: Theme;
}

/**
 * All required color keys for validation
 */
export const REQUIRED_COLOR_KEYS: (keyof ThemeColors)[] = [
  "bg",
  "surface",
  "surfaceHover",
  "border",
  "borderHover",
  "accent",
  "accentHover",
  "accentMuted",
  "text",
  "textMuted",
  "textInverse",
  "success",
  "successMuted",
  "warning",
  "warningMuted",
  "error",
  "errorMuted",
  "scrollbarThumb",
  "scrollbarThumbHover",
  "selection",
  "shadow",
  "shadowStrong",
  "terminalBg",
  "terminalText",
  "terminalCursor",
];

/**
 * Validate a theme object loaded from JSON
 * Returns { valid: true, theme } if valid, { valid: false } otherwise
 */
export function validateTheme(data: unknown): ThemeValidationResult {
  if (!data || typeof data !== "object") {
    return { valid: false };
  }

  const obj = data as Record<string, unknown>;

  // Check required top-level fields
  if (typeof obj.id !== "string" || !obj.id.trim()) {
    return { valid: false };
  }
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return { valid: false };
  }
  if (obj.type !== "light" && obj.type !== "dark") {
    return { valid: false };
  }
  if (!obj.colors || typeof obj.colors !== "object") {
    return { valid: false };
  }

  // Check all required color keys exist and are strings
  const colors = obj.colors as Record<string, unknown>;
  for (const key of REQUIRED_COLOR_KEYS) {
    if (typeof colors[key] !== "string") {
      return { valid: false };
    }
  }

  // Build validated theme object
  const theme: Theme = {
    id: obj.id as string,
    name: obj.name as string,
    type: obj.type as "light" | "dark",
    colors: colors as unknown as ThemeColors,
  };

  if (typeof obj.author === "string") {
    theme.author = obj.author;
  }
  if (typeof obj.version === "string") {
    theme.version = obj.version;
  }

  return { valid: true, theme };
}
