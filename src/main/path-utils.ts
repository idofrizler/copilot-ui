import { isAbsolute, normalize, relative, sep } from 'path';

export interface PathFormatOptions {
  rootLabel?: string;
  useTilde?: boolean;
}

export function formatRelativeDisplayPath(
  targetPath: string,
  baseDir?: string,
  options?: PathFormatOptions
): string {
  if (!baseDir) {
    return targetPath;
  }

  const normalizedTarget = normalize(targetPath);
  const normalizedBase = normalize(baseDir);
  const relativePath = relative(normalizedBase, normalizedTarget);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return targetPath;
  }

  const label = options?.rootLabel ?? (options?.useTilde ? '~' : undefined);
  if (!relativePath) {
    return label ?? normalizedBase;
  }

  return label ? `${label}${sep}${relativePath}` : relativePath;
}
