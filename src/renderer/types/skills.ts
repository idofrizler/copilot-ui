// Agent Skill types

export interface Skill {
  name: string;
  description: string;
  license?: string;
  path: string;
  files: string[];
  type: 'personal' | 'project';
  relativePath: string;
  locationLabel: string;
  source: 'copilot' | 'claude' | 'agents' | 'openai' | 'custom'; // Which config folder it came from
}

export interface SkillsResult {
  skills: Skill[];
  errors: string[];
}
