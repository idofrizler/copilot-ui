import { existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';

// Agent Skills types
export interface Skill {
  name: string;
  description: string;
  license?: string;
  path: string;
  type: 'personal' | 'project';
  source: 'copilot' | 'claude';
}

export interface SkillsResult {
  skills: Skill[];
  errors: string[];
}

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
  source: 'copilot' | 'claude'
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

        skills.push({
          name: metadata.name,
          description: metadata.description,
          license: metadata.license,
          path: skillDir,
          type,
          source,
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

// Get all skills from all known locations
export async function getAllSkills(projectCwd?: string): Promise<SkillsResult> {
  const allSkills: Skill[] = [];
  const allErrors: string[] = [];

  const homePath = app.getPath('home');

  // Personal skills directories
  const personalDirs = [
    { path: join(homePath, '.copilot', 'skills'), source: 'copilot' as const },
    { path: join(homePath, '.claude', 'skills'), source: 'claude' as const },
  ];

  // Scan personal skills
  for (const { path, source } of personalDirs) {
    const { skills, errors } = await scanSkillsDirectory(path, 'personal', source);
    allSkills.push(...skills);
    allErrors.push(...errors);
  }

  // Project skills directories (if we have a project cwd)
  if (projectCwd) {
    const projectDirs = [
      { path: join(projectCwd, '.github', 'skills'), source: 'copilot' as const },
      { path: join(projectCwd, '.claude', 'skills'), source: 'claude' as const },
    ];

    for (const { path, source } of projectDirs) {
      const { skills, errors } = await scanSkillsDirectory(path, 'project', source);
      allSkills.push(...skills);
      allErrors.push(...errors);
    }
  }

  return { skills: allSkills, errors: allErrors };
}
