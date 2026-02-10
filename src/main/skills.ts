import { existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { app } from 'electron';
import { formatRelativeDisplayPath, PathFormatOptions } from './path-utils';

// Agent Skills types
export type SkillSource = 'copilot' | 'claude' | 'agents' | 'openai' | 'custom';

export interface Skill {
  name: string;
  description: string;
  license?: string;
  path: string;
  files: string[];
  type: 'personal' | 'project';
  source: SkillSource;
  relativePath: string;
  locationLabel: string;
}

export interface SkillsResult {
  skills: Skill[];
  errors: string[];
}

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

const formatLocationLabel = (basePath: string, homePath: string, projectCwd?: string): string => {
  const normalizedBase = normalizePath(basePath);
  const normalizedHome = normalizePath(homePath);
  if (normalizedBase.startsWith(normalizedHome)) {
    const rel = normalizedBase.slice(normalizedHome.length).replace(/^\/+/, '');
    return rel ? `~/${rel}` : '~';
  }

  if (projectCwd) {
    const normalizedProject = normalizePath(projectCwd);
    if (normalizedBase.startsWith(normalizedProject)) {
      const rel = normalizePath(relative(normalizedProject, normalizedBase));
      return rel ? `./${rel}` : '.';
    }
  }

  return basePath;
};

const collectSkillFiles = (skillDir: string): string[] => {
  const entries = readdirSync(skillDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(skillDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSkillFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
};

// Parse SKILL.md frontmatter to extract skill metadata
export function parseSkillFrontmatter(content: string): {
  name?: string;
  description?: string;
  license?: string;
} {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter = frontmatterMatch[1];
  const result: { name?: string; description?: string; license?: string } = {};

  // Parse YAML-style frontmatter (simple key: value parsing)
  const lines = frontmatter.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'name') result.name = value.trim();
      else if (key === 'description') result.description = value.trim();
      else if (key === 'license') result.license = value.trim();
    }
  }

  return result;
}

// Scan a skills directory and return all valid skills
export async function scanSkillsDirectory(
  basePath: string,
  type: 'personal' | 'project',
  source: SkillSource,
  locationLabel: string,
  displayBaseDir?: string,
  options?: PathFormatOptions
): Promise<{ skills: Skill[]; errors: string[] }> {
  const skills: Skill[] = [];
  const errors: string[] = [];

  if (!existsSync(basePath)) {
    return { skills, errors };
  }

  try {
    const entries = readdirSync(basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = join(basePath, entry.name);
      const skillMdPath = join(skillDir, 'SKILL.md');

      if (!existsSync(skillMdPath)) {
        // Skip directories without SKILL.md
        continue;
      }

      try {
        const content = await readFile(skillMdPath, 'utf-8');
        const metadata = parseSkillFrontmatter(content);

        if (!metadata.name || !metadata.description) {
          errors.push(`Skill at ${skillDir} is missing required name or description in SKILL.md`);
          continue;
        }

        let files: string[] = [];
        try {
          files = collectSkillFiles(skillDir).sort((a, b) =>
            normalizePath(a).localeCompare(normalizePath(b))
          );
        } catch (err) {
          errors.push(
            `Failed to list files for skill at ${skillDir}: ${err instanceof Error ? err.message : String(err)}`
          );
        }

        skills.push({
          name: metadata.name,
          description: metadata.description,
          license: metadata.license,
          path: skillDir,
          files,
          type,
          source,
          relativePath: formatRelativeDisplayPath(skillDir, displayBaseDir, options),
          locationLabel,
        });
      } catch (err) {
        errors.push(
          `Failed to read SKILL.md at ${skillMdPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err) {
    errors.push(
      `Failed to scan skills directory ${basePath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return { skills, errors };
}

export async function getAllSkills(projectCwd?: string): Promise<SkillsResult> {
  const allSkills: Skill[] = [];
  const allErrors: string[] = [];

  const homePath = app.getPath('home');
  const directoryEntries: Array<{
    path: string;
    type: 'personal' | 'project';
    source: SkillSource;
  }> = [];
  const seenPaths = new Set<string>();

  const addSkillDirectory = (
    basePath: string,
    type: 'personal' | 'project',
    source: SkillSource
  ) => {
    const normalized = normalizePath(basePath);
    if (seenPaths.has(normalized)) {
      return;
    }
    seenPaths.add(normalized);
    directoryEntries.push({ path: basePath, type, source });
  };

  // Personal skills directories
  addSkillDirectory(join(homePath, '.copilot', 'skills'), 'personal', 'copilot');
  addSkillDirectory(join(homePath, '.claude', 'skills'), 'personal', 'claude');
  addSkillDirectory(join(homePath, '.claude', 'commands'), 'personal', 'claude');
  addSkillDirectory(join(homePath, '.agents', 'skills'), 'personal', 'agents');
  addSkillDirectory(join(homePath, '.config', 'agent', 'skills'), 'personal', 'openai');

  const customLocationsEnv = process.env.COPILOT_AGENT_SKILLS_LOCATIONS;
  if (customLocationsEnv) {
    const customDirs = customLocationsEnv
      .split(',')
      .map((dir) => dir.trim())
      .filter(Boolean);
    for (const customDir of customDirs) {
      const normalizedCustomDir = normalizePath(customDir);
      const normalizedProject = projectCwd ? normalizePath(projectCwd) : '';
      const type =
        projectCwd && normalizedCustomDir.startsWith(normalizedProject) ? 'project' : 'personal';
      addSkillDirectory(customDir, type, 'custom');
    }
  }
  const personalOptions: PathFormatOptions = { useTilde: true, rootLabel: '~' };

  // Scan personal skills
  for (const { path, type, source } of directoryEntries.filter(
    (entry) => entry.type === 'personal'
  )) {
    const locationLabel = formatLocationLabel(path, homePath, projectCwd);
    const { skills, errors } = await scanSkillsDirectory(
      path,
      type,
      source,
      locationLabel,
      homePath,
      personalOptions
    );
    allSkills.push(...skills);
    allErrors.push(...errors);
  }

  // Project skills directories (if we have a project cwd)
  if (projectCwd) {
    addSkillDirectory(join(projectCwd, '.github', 'skills'), 'project', 'copilot');
    addSkillDirectory(join(projectCwd, '.claude', 'skills'), 'project', 'claude');
    addSkillDirectory(join(projectCwd, '.claude', 'commands'), 'project', 'claude');
    addSkillDirectory(join(projectCwd, '.agents', 'skills'), 'project', 'agents');

    let currentDir = projectCwd;
    while (true) {
      addSkillDirectory(join(currentDir, '.agents', 'skills'), 'project', 'agents');
      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    const skipDirs = new Set([
      '.git',
      'node_modules',
      'dist',
      'build',
      'out',
      'release',
      'coverage',
      '.copilot-sessions',
      '.copilot',
    ]);

    const stack = [projectCwd];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      try {
        const entries = readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (skipDirs.has(entry.name)) continue;
          const entryPath = join(current, entry.name);
          if (entry.name === '.claude') {
            addSkillDirectory(join(entryPath, 'skills'), 'project', 'claude');
            addSkillDirectory(join(entryPath, 'commands'), 'project', 'claude');
            continue;
          }
          if (entry.name === '.agents') {
            addSkillDirectory(join(entryPath, 'skills'), 'project', 'agents');
            continue;
          }
          stack.push(entryPath);
        }
      } catch {
        // Ignore recursive scan errors
      }
    }

    for (const { path, type, source } of directoryEntries.filter(
      (entry) => entry.type === 'project'
    )) {
      const locationLabel = formatLocationLabel(path, homePath, projectCwd);
      const { skills, errors } = await scanSkillsDirectory(
        path,
        type,
        source,
        locationLabel,
        projectCwd
      );
      allSkills.push(...skills);
      allErrors.push(...errors);
    }
  }

  return { skills: allSkills, errors: allErrors };
}
