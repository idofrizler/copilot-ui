# Electron IPC Patterns

## Purpose

Define and enforce the IPC communication patterns between Cooper's main process, preload bridge, and renderer. Ensure all cross-process communication follows the secure, typed preload bridge pattern.

## When to Use

- Adding new IPC channels or handlers
- Modifying existing main↔renderer communication
- Creating new features that need backend capabilities

## When NOT to Use

- Renderer-only changes (React state, styling)
- Changes that don't cross process boundaries

## Activation Rules

### Step 1: Define the IPC Contract

Every new IPC interaction requires three changes:

```
1. Main process handler  →  src/main/main.ts (or extracted module)
2. Preload bridge method →  src/preload/preload.ts
3. Renderer type         →  src/renderer/types/ (if needed)
```

### Step 2: Follow the Namespace Convention

Cooper uses namespaced IPC channels:

| Namespace    | Purpose                 | Example                                          |
| ------------ | ----------------------- | ------------------------------------------------ |
| `copilot:*`  | Copilot SDK operations  | `copilot:send-message`, `copilot:create-session` |
| `git:*`      | Git operations          | `git:create-worktree`, `git:get-branches`        |
| `voice:*`    | Voice/speech services   | `voice:start-listening`, `voice:stop`            |
| `system:*`   | System operations       | `system:open-external`, `system:get-platform`    |
| `mcp:*`      | MCP server management   | `mcp:list-servers`, `mcp:add-server`             |
| `terminal:*` | PTY terminal operations | `terminal:create`, `terminal:resize`             |
| `settings:*` | Persistent settings     | `settings:get`, `settings:set`                   |

### Step 3: Implement the Pattern

**Main process (src/main/main.ts):**

```typescript
ipcMain.handle(
  'namespace:action',
  async (_event, arg1: Type1, arg2: Type2): Promise<ReturnType> => {
    // Validate inputs
    // Perform operation
    // Return typed result
  }
);
```

**Preload bridge (src/preload/preload.ts):**

```typescript
namespace: {
  action: (arg1: Type1, arg2: Type2): Promise<ReturnType> =>
    ipcRenderer.invoke('namespace:action', arg1, arg2),
}
```

**Renderer usage:**

```typescript
const result = await window.electronAPI.namespace.action(arg1, arg2);
```

### Step 4: Event Streams (Main → Renderer)

For streaming data (SDK events, terminal output):

```typescript
// Main: send events
mainWindow.webContents.send('copilot:event', eventData);

// Preload: expose listener
onCopilotEvent: (callback: (data: EventData) => void) => {
  ipcRenderer.on('copilot:event', (_, data) => callback(data));
};

// Renderer: subscribe
useEffect(() => {
  window.electronAPI.copilot.onCopilotEvent((data) => {
    // handle event
  });
}, []);
```

## Hard Rules

1. ✅ **Always go through preload** — Never use `ipcRenderer` directly in renderer
2. ✅ **Always namespace channels** — Use `prefix:action` format
3. ✅ **Always type arguments** — No `any` types in IPC
4. ✅ **Always validate in main** — Main process validates all inputs
5. ❌ **Never expose `ipcRenderer`** — Only expose specific methods
6. ❌ **Never use `remote` module** — Deprecated and insecure
7. ❌ **Never enable `nodeIntegration`** — Security violation

## Success Criteria

- All three layers updated (main + preload + renderer)
- IPC channel follows namespace convention
- Arguments are typed, not `any`
- Main process validates inputs

## Related Skills

- [security-review](../security-review/) — For security validation
- [context-engineering](../context-engineering/) — For tracking cross-process changes
