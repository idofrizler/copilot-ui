// Agent Skill types

export interface Skill {
  name: string;
  description: string;
  license?: string;
  path: string;
  type: "personal" | "project";
  source: "copilot" | "claude"; // Which config folder it came from
}

export interface SkillsResult {
  skills: Skill[];
  errors: string[];
}
