import { describe, it, expect } from 'vitest';
import { groupAgents } from './agentPicker';

const agents = [
  { name: 'Bravo', path: '/project/bravo.agent.md', type: 'project', source: 'copilot' },
  { name: 'Alpha', path: '/project/alpha.agent.md', type: 'project', source: 'copilot' },
  { name: 'Zeta', path: '/home/zeta.agent.md', type: 'personal', source: 'claude' },
  { name: 'Gamma', path: '/home/gamma.agent.md', type: 'personal', source: 'claude' },
  { name: 'Cooper (default)', path: 'system:cooper-default', type: 'system', source: 'copilot' },
];

describe('groupAgents', () => {
  it('groups favorites on top and keeps project/personal/system sections', () => {
    const result = groupAgents(agents, ['/home/gamma.agent.md']);

    expect(result.map((section) => section.id)).toEqual([
      'favorites',
      'project',
      'personal',
      'system',
    ]);
    expect(result[0].agents.map((agent) => agent.name)).toEqual(['Gamma']);
    expect(result[1].agents.map((agent) => agent.name)).toEqual(['Alpha', 'Bravo']);
    expect(result[2].agents.map((agent) => agent.name)).toEqual(['Zeta']);
    expect(result[3].agents.map((agent) => agent.name)).toEqual(['Cooper (default)']);
  });

  it('omits favorites section when empty', () => {
    const result = groupAgents(agents, []);

    expect(result.map((section) => section.id)).toEqual(['project', 'personal', 'system']);
  });
});
