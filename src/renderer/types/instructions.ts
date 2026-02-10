// Copilot Instructions types

export interface Instruction {
  name: string;
  path: string;
  type: 'personal' | 'project' | 'cwd' | 'custom-dir' | 'agent';
  scope: 'repository' | 'path-specific' | 'agent-primary' | 'agent-additional';
  relativePath: string;
}

export interface InstructionsResult {
  instructions: Instruction[];
  errors: string[];
}
