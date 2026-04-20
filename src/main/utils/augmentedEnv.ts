export function getAugmentedEnv(
  baseEnv: NodeJS.ProcessEnv = process.env
): Record<string, string | undefined> {
  const env = { ...baseEnv };

  if (process.platform === 'win32') {
    const username = baseEnv.USERNAME || baseEnv.USER || '';
    const additionalPaths = [
      'C:\\Program Files\\GitHub CLI',
      'C:\\Program Files (x86)\\GitHub CLI',
      `C:\\Users\\${username}\\AppData\\Local\\GitHub CLI`,
      `C:\\Users\\${username}\\scoop\\shims`,
      'C:\\ProgramData\\chocolatey\\bin',
    ].filter((pathValue) => username || !pathValue.includes('Users'));
    const currentPath = env.PATH || env.Path || '';
    env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(';');
    return env;
  }

  const additionalPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  env.PATH = [...additionalPaths, env.PATH].filter(Boolean).join(':');
  return env;
}

export function mergeMcpServerEnv(envOverrides: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      ...getAugmentedEnv(),
      ...envOverrides,
    }).filter(([, value]): value is string => typeof value === 'string')
  );
}
