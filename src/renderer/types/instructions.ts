// Copilot Instructions types

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
