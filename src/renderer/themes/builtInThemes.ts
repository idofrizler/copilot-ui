import type { Theme } from './types';
import nightowlTheme from './nightowl-theme.json';
import icqTheme from './icq-theme.json';
import githubDimmedTheme from './github-dimmed.json';
import xmasTheme from './xmas-theme.json';
import kawaiiTheme from './kawaii-theme.json';

/**
 * Dark theme - the original Copilot UI theme
 */
export const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  type: 'dark',
  colors: {
    // Backgrounds
    bg: 'rgba(30, 30, 30, 0.85)',
    surface: 'rgb(45, 45, 45)',
    surfaceHover: 'rgb(55, 55, 55)',

    // Borders
    border: 'rgba(70, 70, 70, 0.5)',
    borderHover: 'rgba(90, 90, 90, 0.6)',

    // Accent colors (GitHub blue)
    accent: '#58a6ff',
    accentHover: '#79b8ff',
    accentMuted: 'rgba(88, 166, 255, 0.25)',

    // Text colors
    text: '#e6edf3',
    textMuted: '#8b949e',
    textInverse: '#1e1e1e',

    // Status colors
    success: '#3fb950',
    successMuted: 'rgba(63, 185, 80, 0.4)',
    warning: '#d29922',
    warningMuted: 'rgba(210, 153, 34, 0.4)',
    error: '#f85149',
    errorMuted: 'rgba(248, 81, 73, 0.4)',

    // Scrollbar
    scrollbarThumb: 'rgba(139, 148, 158, 0.3)',
    scrollbarThumbHover: 'rgba(139, 148, 158, 0.5)',

    // Selection
    selection: 'rgba(88, 166, 255, 0.3)',

    // Shadows
    shadow: 'rgba(0, 0, 0, 0.2)',
    shadowStrong: 'rgba(0, 0, 0, 0.4)',

    // Terminal
    terminalBg: 'transparent',
    terminalText: '#e6edf3',
    terminalCursor: '#58a6ff',
  },
};

/**
 * Light theme
 */
export const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  type: 'light',
  colors: {
    // Backgrounds
    bg: 'rgba(255, 255, 255, 0.92)',
    surface: 'rgb(246, 248, 250)',
    surfaceHover: 'rgb(234, 238, 242)',

    // Borders
    border: 'rgba(208, 215, 222, 0.6)',
    borderHover: 'rgba(175, 184, 193, 0.7)',

    // Accent colors (GitHub blue - slightly adjusted for light mode)
    accent: '#0969da',
    accentHover: '#0550ae',
    accentMuted: 'rgba(9, 105, 218, 0.15)',

    // Text colors
    text: '#1f2328',
    textMuted: '#656d76',
    textInverse: '#ffffff',

    // Status colors
    success: '#1a7f37',
    successMuted: 'rgba(26, 127, 55, 0.15)',
    warning: '#9a6700',
    warningMuted: 'rgba(154, 103, 0, 0.15)',
    error: '#cf222e',
    errorMuted: 'rgba(207, 34, 46, 0.15)',

    // Scrollbar
    scrollbarThumb: 'rgba(101, 109, 118, 0.4)',
    scrollbarThumbHover: 'rgba(101, 109, 118, 0.6)',

    // Selection
    selection: 'rgba(9, 105, 218, 0.2)',

    // Shadows
    shadow: 'rgba(31, 35, 40, 0.1)',
    shadowStrong: 'rgba(31, 35, 40, 0.2)',

    // Terminal
    terminalBg: 'transparent',
    terminalText: '#1f2328',
    terminalCursor: '#0969da',
  },
};

/**
 * All built-in themes
 */
export const builtInThemes: Theme[] = [
  darkTheme,
  lightTheme,
  nightowlTheme as Theme,
  icqTheme as Theme,
  githubDimmedTheme as Theme,
  xmasTheme as Theme,
  kawaiiTheme as Theme,
];
