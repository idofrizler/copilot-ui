import { existsSync, readdirSync } from 'fs';
import { stat } from 'fs/promises';
import { exec } from 'child_process';
import { join, normalize } from 'path';
import { promisify } from 'util';
import { app } from 'electron';

const execAsync = promisify(exec);

export interface Instruction {
  name: string;
  path: string;
  type: 'personal' | 'project' | 'cwd' | 'custom-dir' | 'agent';
  scope: 'repository' | 'path-specific' | 'agent-primary' | 'agent-additional';
}

export interface InstructionsResult {
  instructions: Instruction[];
  errors: string[];
}

// Detect the git repository root from a given directory
export async function getGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

// Recursively find all *.instructions.md files in a directory
function findInstructionFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  try {
    if (!existsSync(dir)) return files;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findInstructionFilesRecursive(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.instructions.md')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors in recursive scan
  }
  return files;
}

// Get all copilot instruction files from known locations
// projectRoot: the git repository root
// cwd: the current working directory (may differ from projectRoot)
export async function getAllInstructions(
  projectRoot?: string,
  cwd?: string
): Promise<InstructionsResult> {
  const instructions: Instruction[] = [];
  const errors: string[] = [];
  const seenPaths = new Set<string>();

  const addInstruction = (instruction: Instruction) => {
    const normalizedPath = normalize(instruction.path);
    if (!seenPaths.has(normalizedPath)) {
      seenPaths.add(normalizedPath);
      instructions.push(instruction);
    }
  };

  const homePath = app.getPath('home');

  // Personal/local instructions: ~/.copilot/copilot-instructions.md
  const localPath = join(homePath, '.copilot', 'copilot-instructions.md');
  try {
    if (existsSync(localPath)) {
      const s = await stat(localPath);
      if (s.isFile()) {
        addInstruction({
          name: 'copilot-instructions.md',
          path: localPath,
          type: 'personal',
          scope: 'repository',
        });
      }
    }
  } catch (err) {
    errors.push(
      `Failed to check ${localPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (projectRoot) {
    // Project-level: .github/copilot-instructions.md
    const projectPath = join(projectRoot, '.github', 'copilot-instructions.md');
    try {
      if (existsSync(projectPath)) {
        const s = await stat(projectPath);
        if (s.isFile()) {
          addInstruction({
            name: 'copilot-instructions.md',
            path: projectPath,
            type: 'project',
            scope: 'repository',
          });
        }
      }
    } catch (err) {
      errors.push(
        `Failed to check ${projectPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Path-specific instructions: .github/instructions/**/*.instructions.md (recursive)
    const instructionsDir = join(projectRoot, '.github', 'instructions');
    try {
      const files = findInstructionFilesRecursive(instructionsDir);
      for (const filePath of files) {
        addInstruction({
          name: filePath.substring(instructionsDir.length + 1), // relative path from instructions dir
          path: filePath,
          type: 'project',
          scope: 'path-specific',
        });
      }
    } catch (err) {
      errors.push(
        `Failed to scan ${instructionsDir}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Agent instructions at repo root: AGENTS.md (primary)
    const agentsMdPath = join(projectRoot, 'AGENTS.md');
    try {
      if (existsSync(agentsMdPath)) {
        const s = await stat(agentsMdPath);
        if (s.isFile()) {
          addInstruction({
            name: 'AGENTS.md',
            path: agentsMdPath,
            type: 'agent',
            scope: 'agent-primary',
          });
        }
      }
    } catch (err) {
      errors.push(
        `Failed to check ${agentsMdPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // CLAUDE.md at repo root
    const claudeMdPath = join(projectRoot, 'CLAUDE.md');
    try {
      if (existsSync(claudeMdPath)) {
        const s = await stat(claudeMdPath);
        if (s.isFile()) {
          addInstruction({
            name: 'CLAUDE.md',
            path: claudeMdPath,
            type: 'agent',
            scope: 'agent-primary',
          });
        }
      }
    } catch (err) {
      errors.push(
        `Failed to check ${claudeMdPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // GEMINI.md at repo root
    const geminiMdPath = join(projectRoot, 'GEMINI.md');
    try {
      if (existsSync(geminiMdPath)) {
        const s = await stat(geminiMdPath);
        if (s.isFile()) {
          addInstruction({
            name: 'GEMINI.md',
            path: geminiMdPath,
            type: 'agent',
            scope: 'agent-primary',
          });
        }
      }
    } catch (err) {
      errors.push(
        `Failed to check ${geminiMdPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // CWD-based instructions (when cwd differs from projectRoot)
  const effectiveCwd = cwd || projectRoot;
  if (effectiveCwd && effectiveCwd !== projectRoot) {
    // CWD path-specific: <cwd>/.github/instructions/**/*.instructions.md
    const cwdInstructionsDir = join(effectiveCwd, '.github', 'instructions');
    try {
      const files = findInstructionFilesRecursive(cwdInstructionsDir);
      for (const filePath of files) {
        addInstruction({
          name: filePath.substring(cwdInstructionsDir.length + 1),
          path: filePath,
          type: 'cwd',
          scope: 'path-specific',
        });
      }
    } catch (err) {
      errors.push(
        `Failed to scan ${cwdInstructionsDir}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // AGENTS.md in cwd (additional)
    const cwdAgentsMdPath = join(effectiveCwd, 'AGENTS.md');
    try {
      if (existsSync(cwdAgentsMdPath)) {
        const s = await stat(cwdAgentsMdPath);
        if (s.isFile()) {
          addInstruction({
            name: 'AGENTS.md',
            path: cwdAgentsMdPath,
            type: 'agent',
            scope: 'agent-additional',
          });
        }
      }
    } catch (err) {
      errors.push(
        `Failed to check ${cwdAgentsMdPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // COPILOT_CUSTOM_INSTRUCTIONS_DIRS environment variable
  const customDirsEnv = process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS;
  if (customDirsEnv) {
    const customDirs = customDirsEnv
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    for (const customDir of customDirs) {
      // AGENTS.md in custom dir (additional)
      const customAgentsMdPath = join(customDir, 'AGENTS.md');
      try {
        if (existsSync(customAgentsMdPath)) {
          const s = await stat(customAgentsMdPath);
          if (s.isFile()) {
            addInstruction({
              name: 'AGENTS.md',
              path: customAgentsMdPath,
              type: 'custom-dir',
              scope: 'agent-additional',
            });
          }
        }
      } catch (err) {
        errors.push(
          `Failed to check ${customAgentsMdPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      // .github/instructions/**/*.instructions.md in custom dir
      const customInstructionsDir = join(customDir, '.github', 'instructions');
      try {
        const files = findInstructionFilesRecursive(customInstructionsDir);
        for (const filePath of files) {
          addInstruction({
            name: filePath.substring(customInstructionsDir.length + 1),
            path: filePath,
            type: 'custom-dir',
            scope: 'path-specific',
          });
        }
      } catch (err) {
        errors.push(
          `Failed to scan ${customInstructionsDir}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return { instructions, errors };
}
