import { existsSync, readdirSync } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';

export interface Instruction {
  name: string;
  path: string;
  type: 'personal' | 'project' | 'organization';
  scope: 'repository' | 'path-specific';
}

export interface InstructionsResult {
  instructions: Instruction[];
  errors: string[];
}

// Get all copilot instruction files from known locations
export async function getAllInstructions(projectCwd?: string): Promise<InstructionsResult> {
  const instructions: Instruction[] = [];
  const errors: string[] = [];

  const homePath = app.getPath('home');

  // Personal/global instructions: ~/.github/copilot-instructions.md
  const globalPath = join(homePath, '.github', 'copilot-instructions.md');
  try {
    if (existsSync(globalPath)) {
      const s = await stat(globalPath);
      if (s.isFile()) {
        instructions.push({
          name: 'copilot-instructions.md',
          path: globalPath,
          type: 'personal',
          scope: 'repository',
        });
      }
    }
  } catch (err) {
    errors.push(
      `Failed to check ${globalPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (projectCwd) {
    // Project-level: .github/copilot-instructions.md
    const projectPath = join(projectCwd, '.github', 'copilot-instructions.md');
    try {
      if (existsSync(projectPath)) {
        const s = await stat(projectPath);
        if (s.isFile()) {
          instructions.push({
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

    // Path-specific instructions: .github/instructions/*.instructions.md
    const instructionsDir = join(projectCwd, '.github', 'instructions');
    try {
      if (existsSync(instructionsDir)) {
        const entries = readdirSync(instructionsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.instructions.md')) {
            instructions.push({
              name: entry.name,
              path: join(instructionsDir, entry.name),
              type: 'project',
              scope: 'path-specific',
            });
          }
        }
      }
    } catch (err) {
      errors.push(
        `Failed to scan ${instructionsDir}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { instructions, errors };
}
