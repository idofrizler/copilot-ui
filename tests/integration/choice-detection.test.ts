/**
 * Integration test for choice detection
 *
 * This script tests the detectChoices logic by running it against sample messages.
 * Run with: node --experimental-specifier-resolution=node --loader ts-node/esm tests/integration/choice-detection.test.ts
 * Or: cd tests/integration && node --import tsx choice-detection.test.ts
 */

// Use dynamic import for ESM module
async function main() {
  const { CopilotClient } = await import('@github/copilot-sdk');

  // Replicating the detection logic from main.ts
  const QUICK_TASKS_MODEL_PREFERENCES = ['gpt-4.1', 'gpt-5-mini', 'claude-haiku-4.5'];

  async function getQuickTasksModel(client: InstanceType<typeof CopilotClient>): Promise<string> {
    try {
      const availableModels = await client.listModels();
      const availableIds = new Set(availableModels.map((m: { id: string }) => m.id));

      for (const preferred of QUICK_TASKS_MODEL_PREFERENCES) {
        if (availableIds.has(preferred)) {
          return preferred;
        }
      }

      // Fallback to first available model
      if (availableModels.length > 0) {
        return availableModels[0].id;
      }
      return 'gpt-4.1';
    } catch {
      return 'gpt-4.1';
    }
  }

  async function detectChoices(
    client: InstanceType<typeof CopilotClient>,
    message: string
  ): Promise<{
    isChoice: boolean;
    options?: { id: string; label: string; description?: string }[];
  }> {
    try {
      const quickModel = await getQuickTasksModel(client);
      console.log(`Using model: ${quickModel}`);

      const tempSession = await client.createSession({
        model: quickModel,
        systemMessage: {
          mode: 'replace' as const,
          content: `You analyze messages to detect if they ask the user to choose between options.

If the message asks the user to pick from multiple choices, respond with JSON:
{"isChoice":true,"options":[{"id":"short_id","label":"Short Label","description":"Brief description"},...]}

If the message does NOT ask the user to choose, respond with:
{"isChoice":false}

Rules:
- Only detect clear choice questions (e.g., "Which would you prefer?", "Please choose:", "Would you like option A or B?")
- Extract 2-5 options maximum
- Use short, lowercase snake_case ids (e.g., "rebase", "merge", "cancel")
- Labels should be concise (1-3 words)
- Descriptions are optional, keep under 10 words
- Respond with ONLY valid JSON, no markdown, no explanation`,
        },
      });

      const sessionId = tempSession.sessionId;
      const truncatedMessage = message.length > 2000 ? message.slice(-2000) : message;
      const prompt = `Analyze this message:\n\n${truncatedMessage}`;
      const response = await tempSession.sendAndWait({ prompt });

      await tempSession.destroy();
      await client.deleteSession(sessionId);

      const content = (response as { data?: { content?: string } })?.data?.content || '';
      console.log('Raw response:', content);

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.isChoice && Array.isArray(parsed.options) && parsed.options.length >= 2) {
            return {
              isChoice: true,
              options: parsed.options
                .slice(0, 5)
                .map((opt: { id?: string; label?: string; description?: string }) => ({
                  id: String(opt.id || '').slice(0, 30),
                  label: String(opt.label || opt.id || '').slice(0, 50),
                  description: opt.description ? String(opt.description).slice(0, 100) : undefined,
                })),
            };
          }
        }
        return { isChoice: false };
      } catch {
        console.warn('Failed to parse response:', content);
        return { isChoice: false };
      }
    } catch (error) {
      console.error('Detection failed:', error);
      return { isChoice: false };
    }
  }

  // Test cases
  const testCases = [
    {
      name: 'Git branch diverged - should detect choices',
      message: `Your branch has diverged from origin/main. You have 1 local commit and the remote has 2 commits you don't have. You can either:

**Rebase** (recommended - keeps history clean):
\`\`\`
git pull --rebase origin main
\`\`\`

**Merge** (creates a merge commit):
\`\`\`
git pull origin main
\`\`\`

Which approach would you prefer?`,
      expectChoice: true,
    },
    {
      name: 'Simple explanation - should NOT detect choices',
      message: `I've updated the code to fix the bug. The issue was that the variable was not being initialized correctly. Here's what I changed:

1. Added initialization in the constructor
2. Fixed the null check in the render method
3. Updated the tests

The build is now passing.`,
      expectChoice: false,
    },
    {
      name: 'Multiple implementation options',
      message: `There are several ways to implement this feature:

1. **Option A - React Context**: Use React Context for state management. This is simpler but may cause re-renders.

2. **Option B - Redux**: Use Redux for more predictable state. Better for larger apps.

3. **Option C - Zustand**: Lightweight alternative to Redux with simpler API.

Which implementation would you like me to use?`,
      expectChoice: true,
    },
  ];

  console.log('Starting choice detection integration tests...\n');

  const client = new CopilotClient({
    cwd: process.cwd(),
  });

  try {
    await client.start();
    console.log('Copilot client started\n');

    let passed = 0;
    let failed = 0;

    for (const testCase of testCases) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`TEST: ${testCase.name}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Message preview: ${testCase.message.slice(0, 100)}...`);
      console.log(`Expected: ${testCase.expectChoice ? 'CHOICE' : 'NO CHOICE'}`);

      const result = await detectChoices(client, testCase.message);

      console.log(`Result: ${result.isChoice ? 'CHOICE' : 'NO CHOICE'}`);
      if (result.options) {
        console.log(`Options: ${result.options.map((o) => o.label).join(', ')}`);
      }

      const isCorrect = result.isChoice === testCase.expectChoice;
      if (isCorrect) {
        console.log('✅ PASSED');
        passed++;
      } else {
        console.log('❌ FAILED');
        failed++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTS: ${passed}/${testCases.length} passed, ${failed} failed`);
    console.log(`${'='.repeat(60)}`);

    await client.stop();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Test setup failed:', error);
    await client.stop();
    process.exit(1);
  }
}

main().catch(console.error);
