# Planning and Scoping

## Purpose

Decompose tasks into sub-tasks, assess risk, and create implementation checklists before starting work on Cooper features.

## When to Use

- Starting any non-trivial work (3+ files, cross-process changes)
- Features that span main process and renderer
- Any change involving the Copilot SDK integration

## When NOT to Use

- Single-file bug fixes with obvious solutions
- Documentation-only changes

## Activation Rules

### Step 1: Break Down by Process Layer

```markdown
## Task Decomposition

### Main Process (src/main/)

- [ ] [Change description] — Risk: [Low/Med/High]

### Preload (src/preload/)

- [ ] [IPC bridge change] — Risk: [Low/Med/High]

### Renderer (src/renderer/)

- [ ] [UI change] — Risk: [Low/Med/High]

### Tests

- [ ] [Test additions/updates] — Risk: Low
```

### Step 2: Identify Dependencies and Order

```markdown
## Execution Order

1. Types/interfaces first (src/renderer/types/)
2. Main process handlers (src/main/)
3. Preload bridge (src/preload/)
4. Renderer components (src/renderer/)
5. Tests (tests/)
```

### Step 3: Define Acceptance Criteria

```markdown
## Acceptance Criteria

- [ ] Feature works end-to-end
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] IPC contract is complete (main ↔ preload ↔ renderer)
- [ ] No TypeScript errors
```

### Step 4: Risk Assessment

| Risk Level | Criteria                                              |
| ---------- | ----------------------------------------------------- |
| **Low**    | Single-process, no IPC changes, has tests             |
| **Medium** | Cross-process, new IPC channel, UI changes            |
| **High**   | SDK integration, security-sensitive, breaking changes |

## Cooper-Specific Example

```markdown
## Task: Add MCP server management UI

### Decomposition

1. **Types** (Low): Add MCPServer interface to src/renderer/types/
2. **Main** (Med): Add IPC handlers for MCP server CRUD
3. **Preload** (Med): Expose mcp.\* methods in bridge
4. **Renderer** (Med): Create MCPServerPanel component
5. **Tests** (Low): Add component + integration tests

### Order: 1 → 2 → 3 → 4 → 5

### Risk: Medium (new IPC channels, cross-process)
```

## Success Criteria

- Task decomposed before implementation starts
- Risk levels assigned to each sub-task
- Execution order defined
- Acceptance criteria documented

## Related Skills

- [context-engineering](../context-engineering/) — For building full context
- [review-implementing](../review-implementing/) — For validating the plan
