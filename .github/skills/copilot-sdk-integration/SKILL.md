# Copilot SDK Integration

## Purpose

Define patterns for integrating with `@github/copilot-sdk` in Cooper. Cover session management, model switching, tool execution, event handling, and agent support.

## When to Use

- Any change involving Copilot SDK client interactions
- Session creation, resumption, or model switching
- Tool/confirmation handling
- Agent or skill prompt injection
- Streaming event processing

## When NOT to Use

- Pure UI changes with no SDK interaction
- Terminal or file system operations unrelated to SDK

## Activation Rules

### Step 1: Understand the SDK Architecture

```
┌─────────────────────────────────────────────────┐
│ Renderer (React)                                │
│  - UI components show messages, status, tools   │
│  - Calls window.electronAPI.copilot.*           │
└──────────────────┬──────────────────────────────┘
                   │ IPC (via preload bridge)
┌──────────────────▼──────────────────────────────┐
│ Main Process (Electron)                         │
│  - CopilotClient from @github/copilot-sdk      │
│  - Session management                           │
│  - Tool execution & confirmations               │
│  - Event streaming to renderer                  │
└─────────────────────────────────────────────────┘
```

### Step 2: Session Management Patterns

**Create session:**

```typescript
import { CopilotClient } from '@github/copilot-sdk';

const client = new CopilotClient({ agent: 'cooper' });
const session = await client.createSession({
  model: selectedModel,
  systemMessage: agentPrompt, // injected from .agent.md
});
```

**Resume session (with model switching):**

```typescript
// SDK 0.1.23+ supports model changes on resume
const session = await client.resumeSession(sessionId, {
  model: newModel, // switches model mid-conversation
});
```

**Send message:**

```typescript
const response = await session.sendMessage(userMessage);
// response is an async iterable of events
for await (const event of response) {
  mainWindow.webContents.send('copilot:event', event);
}
```

### Step 3: Event Handling

SDK events to handle:

| Event                     | Description             | Renderer Action                      |
| ------------------------- | ----------------------- | ------------------------------------ |
| `message.delta`           | Streaming text chunk    | Append to message display            |
| `message.complete`        | Full message done       | Finalize message, update token count |
| `tool.call`               | Tool invocation request | Show tool execution UI               |
| `tool.execution_complete` | Tool finished           | Update tool result display           |
| `confirmation.request`    | Needs user confirmation | Show confirmation dialog             |
| `session.error`           | Session error           | Show error, offer retry              |

### Step 4: Tool Execution

```typescript
// Register tools with the SDK client
client.registerTool('shell', {
  execute: async (args) => {
    // Execute in PTY terminal
    const result = await executeInTerminal(sessionId, args.command);
    return { content: result };
  },
});
```

**Tool execution flow:**

1. SDK sends `tool.call` event
2. Main process executes the tool
3. Main process sends `tool.execution_complete` back to SDK
4. SDK continues conversation with tool result

### Step 5: Agent & Skill Injection

**Agent prompt injection:**

```typescript
// Agents loaded from .agent.md files
// Prompt injected as systemMessage on session creation
const agentPrompt = await loadAgentPrompt(agentName);
const session = await client.createSession({
  systemMessage: agentPrompt,
});
```

**Skill injection:**

```typescript
// Skills loaded from SKILL.md files
// Skills are personal (~/.copilot/skills/) or project (.github/skills/)
const skills = await loadSkills(projectPath);
// Skills appended to system message or provided as context
```

### Step 6: Model Management

```typescript
// List available models
const models = await client.getModels();

// Model info includes: id, name, vendor, maxTokens
// Display in model selector dropdown
```

## Hard Rules

1. ✅ **SDK client lives in main process only** — Never import SDK in renderer
2. ✅ **Stream events via IPC** — Use `webContents.send()` for real-time updates
3. ✅ **Handle all event types** — Don't ignore error or confirmation events
4. ✅ **Clean up sessions** — Dispose sessions when tabs close
5. ✅ **Token tracking** — Always display token usage to user
6. ❌ **Never expose raw SDK objects to renderer** — Serialize/sanitize first
7. ❌ **Never block on tool execution** — Use async patterns

## Cooper-Specific Files

| File                            | Role                                      |
| ------------------------------- | ----------------------------------------- |
| `src/main/main.ts`              | SDK client creation, IPC handlers for SDK |
| `src/main/skills.ts`            | SKILL.md parsing (personal + project)     |
| `src/main/agents.ts`            | .agent.md parsing and prompt loading      |
| `src/main/pty.ts`               | Terminal execution for shell tools        |
| `src/preload/preload.ts`        | `copilot.*` namespace in bridge           |
| `src/renderer/types/session.ts` | Session/message TypeScript types          |

## Success Criteria

- SDK client only in main process
- Events streamed to renderer via IPC
- All SDK event types handled
- Sessions cleaned up on tab close
- Token usage displayed

## Related Skills

- [electron-ipc-patterns](../electron-ipc-patterns/) — For IPC communication
- [security-review](../security-review/) — For token/credential safety
