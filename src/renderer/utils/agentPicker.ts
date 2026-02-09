import type { Agent } from '../types';

export type AgentSectionId = 'favorites' | 'project' | 'personal' | 'system';

export interface AgentSection {
  id: AgentSectionId;
  label: string;
  agents: Agent[];
}

const byName = (a: Agent, b: Agent) => (a.name || '').localeCompare(b.name || '');

export function groupAgents(agents: Agent[], favoritePaths: string[]): AgentSection[] {
  const favorites = agents.filter((agent) => favoritePaths.includes(agent.path)).sort(byName);
  const nonFavorites = agents.filter((agent) => !favoritePaths.includes(agent.path));

  const project = nonFavorites.filter((agent) => agent.type === 'project').sort(byName);
  const personal = nonFavorites.filter((agent) => agent.type === 'personal').sort(byName);
  const system = nonFavorites.filter((agent) => agent.type === 'system').sort(byName);

  const sections: AgentSection[] = [];
  if (favorites.length > 0) {
    sections.push({ id: 'favorites', label: 'Favorites', agents: favorites });
  }
  if (project.length > 0) {
    sections.push({ id: 'project', label: 'Project', agents: project });
  }
  if (personal.length > 0) {
    sections.push({ id: 'personal', label: 'Personal', agents: personal });
  }
  if (system.length > 0) {
    sections.push({ id: 'system', label: 'System', agents: system });
  }

  return sections;
}
