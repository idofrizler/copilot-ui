# Context Engineering

## Purpose

Build comprehensive task context before making changes. Track constraints, dependencies, and execution order across multi-file work in Cooper's Electron architecture.

## When to Use

- Any multi-file or cross-process change (main ↔ preload ↔ renderer)
- Changes that touch both IPC handlers and UI components
- Features spanning multiple Cooper subsystems (SDK, terminal, voice, worktrees)

## When NOT to Use

- Single-file typo fixes or documentation-only changes
- Changes isolated to a single component with no cross-process impact

## Activation Rules

### Step 1: Document Context

Before starting work, create a context block:

```markdown
## Task Context

**Objective**: [What are we trying to achieve?]
**Scope**: [Which files/processes are affected?]
**Process Boundary**: [main | preload | renderer | all]

### Dependencies

- [List files/modules this change depends on]

### Constraints

- [Cooper conventions: IPC contract, no Node in renderer, etc.]
- [TypeScript strict mode]
- [Tailwind-only styling]

### Assumptions

- [What are we assuming?]

### Risk Areas

- [Breaking IPC contracts?]
- [Electron security model violations?]
```

### Step 2: Track During Execution

Update context as you work:

- Mark completed items
- Note unexpected discoveries
- Add new constraints found during implementation

### Step 3: Validate Before Completion

- All scope items addressed
- No constraint violations
- Dependencies properly handled
- IPC contracts maintained

## Cooper-Specific Examples

**Example: Adding a new settings option**

```markdown
## Task Context

**Objective**: Add "auto-save sessions" toggle to settings
**Scope**: Settings component, electron-store, main process handler
**Process Boundary**: all (main + preload + renderer)

### Dependencies

- src/renderer/components/SettingsPanel.tsx
- src/preload/preload.ts (new IPC bridge method)
- src/main/main.ts (new IPC handler)

### Constraints

- Must go through preload bridge (no direct Node access)
- electron-store for persistence
- Tailwind for styling
```

## Success Criteria

- Context documented before implementation starts
- All cross-process impacts identified
- No surprise breaking changes

## Related Skills

- [planning-and-scoping](../planning-and-scoping/) — For task decomposition
- [electron-ipc-patterns](../electron-ipc-patterns/) — For IPC-specific context
