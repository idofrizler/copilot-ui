// Agent Skill types

export interface Skill {
  name: string;
  description: string;
  license?: string;
  path: string;
  type: 'personal' | 'project';
  source: 'copilot' | 'claude' | 'agents' | 'openai' | 'custom'; // Which config folder it came from
  locationLabel: string;
}

export interface SkillsResult {
  skills: Skill[];
  errors: string[];
}
