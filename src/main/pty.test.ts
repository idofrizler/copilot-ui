import { describe, expect, it } from 'vitest';

import { __ptyInternals } from './pty';

describe('pty splitCommandLine', () => {
  it('parses quoted executable paths with spaces', () => {
    expect(
      __ptyInternals.splitCommandLine('"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoLogo')
    ).toEqual(['C:\\Program Files\\PowerShell\\7\\pwsh.exe', '-NoLogo']);
  });

  it('parses unquoted executable paths with spaces from expanded env vars', () => {
    expect(
      __ptyInternals.splitCommandLine('C:\\Program Files\\PowerShell\\7\\pwsh.exe -NoLogo')
    ).toEqual(['C:\\Program Files\\PowerShell\\7\\pwsh.exe', '-NoLogo']);
  });
});
