/**
 * Windows 11 Rounded Corners Control
 *
 * Disables rounded window corners on Windows 11 using the DWM API.
 * Windows 11 applies rounded corners at the OS level by default.
 */

import { BrowserWindow } from 'electron';

/**
 * Disables rounded corners on a Windows 11 window.
 * Must be called after window is created and shown.
 */
export function disableRoundedCorners(window: BrowserWindow): void {
  if (process.platform !== 'win32') {
    return; // Only applies to Windows
  }

  try {
    // Dynamically import koffi (FFI library) only on Windows
    const koffi = require('koffi');

    // Get native window handle
    const hwnd = window.getNativeWindowHandle();
    if (!hwnd || hwnd.length === 0) {
      console.warn('Could not get native window handle for rounded corner removal');
      return;
    }

    // Convert Buffer to integer handle
    const handle = hwnd.readInt32LE ? hwnd.readInt32LE(0) : hwnd.readBigInt64LE(0);

    // Load dwmapi.dll
    const dwmapi = koffi.load('dwmapi.dll');

    // Define DwmSetWindowAttribute function
    // HRESULT DwmSetWindowAttribute(HWND hwnd, DWORD dwAttribute, LPCVOID pvAttribute, DWORD cbAttribute)
    const DwmSetWindowAttribute = dwmapi.func('DwmSetWindowAttribute', 'int', [
      'void *',
      'int',
      'int *',
      'int',
    ]);

    // Constants from dwmapi.h
    const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    const DWMWCP_DONOTROUND = 1;

    // Call the API
    const cornerPreference = [DWMWCP_DONOTROUND];
    const result = DwmSetWindowAttribute(
      handle,
      DWMWA_WINDOW_CORNER_PREFERENCE,
      cornerPreference,
      4
    );

    if (result !== 0) {
      console.warn(`DwmSetWindowAttribute returned ${result} (non-zero indicates failure)`);
    }
  } catch (err) {
    // Silently fail - rounded corners are cosmetic
    // This will fail gracefully on Windows 10 or if koffi isn't available
    console.warn('Failed to disable rounded corners:', err);
  }
}
