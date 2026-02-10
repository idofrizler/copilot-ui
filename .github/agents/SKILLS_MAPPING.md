# Agent Skills Mapping

This document maps each agent to the skills they should use when performing tasks in the Cooper (copilot-ui) project.

> **📖 See Also**: [skills/INDEX.md](../skills/INDEX.md) for path-based routing rules.

## Skill Tracking Output (MANDATORY)

**All agents MUST explicitly log when looking for and using skills:**

```
🔍 Looking for skill: [skill-name] - [brief reason why needed]
✅ Using skill: [skill-name]
```

## Agent Model

Cooper uses a coordinator + specialist agent model:

```
┌──────────────────────┐
│  cooper-coordinator   │  ← Orchestrator
└──────────────────────┘
          │
    ┌─────┴────────┬──────────────┬──────────────┬───────────────────┐
    │              │              │              │                   │
┌───▼────────┐ ┌──▼───────────┐ ┌▼────────────┐ ┌▼─────────────────┐ ┌──▼──────────────┐
│ electron-  │ │ renderer-ui- │ │ renderer-   │ │ copilot-sdk-     │ │ cooper-test-    │
│ main-dev   │ │ developer    │ │ ux-spec     │ │ specialist       │ │ specialist      │
└────────────┘ └──────────────┘ └─────────────┘ └─────────────────┘ └─────────────────┘
                                        │
                              ┌─────────┴────────┐
                              │                  │
                        ┌─────▼───────┐  ┌──────▼──────────┐
                        │ cooper-     │  │ cooper-         │
                        │ debugger    │  │ perf-optimizer  │
                        └─────────────┘  └────────────────┘
```

## Skill Categories

### Global Skills (ALL Agents — Mandatory)

| Skill                                                 | When to Activate                               | Mandatory |
| ----------------------------------------------------- | ---------------------------------------------- | --------- |
| [context-engineering](../skills/context-engineering/) | Before any multi-file or cross-process change  | ✅ Yes    |
| [review-implementing](../skills/review-implementing/) | Before executing any implementation plan       | ✅ Yes    |
| [test-fixing](../skills/test-fixing/)                 | When tests fail or when modifying tested logic | ✅ Yes    |
| [git-pushing](../skills/git-pushing/)                 | For every commit                               | ✅ Yes    |

### Cross-Cutting Skills

| Skill                                                       | When to Use                         | Priority    |
| ----------------------------------------------------------- | ----------------------------------- | ----------- |
| [planning-and-scoping](../skills/planning-and-scoping/)     | Starting any non-trivial work       | High        |
| [code-refactoring-guide](../skills/code-refactoring-guide/) | Before committing code changes      | Recommended |
| [security-review](../skills/security-review/)               | IPC, preload, auth, or data changes | High        |

## Agent-Specific Skills

### Cooper Coordinator (`cooper-coordinator`)

**Role**: Orchestrator — routes tasks to specialists, prevents conflicts.

| Skill                                                   | When to Use              | Mandatory |
| ------------------------------------------------------- | ------------------------ | --------- |
| [planning-and-scoping](../skills/planning-and-scoping/) | Task decomposition       | ✅ Yes    |
| context-engineering                                     | Multi-agent coordination | ✅ Yes    |

**Knows about all sub-agents** and delegates based on:

- `src/main/` changes → `electron-main-developer`
- `src/renderer/` changes → `renderer-ui-developer` or `renderer-ux-specialist`
- SDK integration → `copilot-sdk-specialist`
- Test failures → `cooper-test-specialist`
- Performance issues → `cooper-performance-optimizer`
- Debugging → `cooper-debugger`
- Design documents → `sdd-writer-agent`

### Electron Main Developer (`electron-main-developer`)

**Role**: Main process specialist — IPC handlers, SDK communication, PTY, worktrees, voice.

| Skill                                                         | When to Use      | Mandatory |
| ------------------------------------------------------------- | ---------------- | --------- |
| [electron-ipc-patterns](../skills/electron-ipc-patterns/)     | Any IPC change   | ✅ Yes    |
| [copilot-sdk-integration](../skills/copilot-sdk-integration/) | Any SDK change   | ✅ Yes    |
| [security-review](../skills/security-review/)                 | IPC/auth changes | ✅ Yes    |

### Renderer UI Developer (`renderer-ui-developer`)

**Role**: React component development — UI building, state management, hooks.

| Skill                                                           | When to Use             | Mandatory   |
| --------------------------------------------------------------- | ----------------------- | ----------- |
| [react-component-patterns](../skills/react-component-patterns/) | Any UI component change | ✅ Yes      |
| [electron-ipc-patterns](../skills/electron-ipc-patterns/)       | If component uses IPC   | Conditional |

### Renderer UX Specialist (`renderer-ux-specialist`)

**Role**: User experience — accessibility, usability, responsive design, theming.

| Skill                                                           | When to Use                 | Mandatory   |
| --------------------------------------------------------------- | --------------------------- | ----------- |
| [react-component-patterns](../skills/react-component-patterns/) | Any UI change               | ✅ Yes      |
| [security-review](../skills/security-review/)                   | If UX involves data display | Conditional |

### Copilot SDK Specialist (`copilot-sdk-specialist`)

**Role**: @github/copilot-sdk expert — sessions, models, tools, events, agents.

| Skill                                                         | When to Use               | Mandatory |
| ------------------------------------------------------------- | ------------------------- | --------- |
| [copilot-sdk-integration](../skills/copilot-sdk-integration/) | Any SDK interaction       | ✅ Yes    |
| [electron-ipc-patterns](../skills/electron-ipc-patterns/)     | SDK events to renderer    | ✅ Yes    |
| [security-review](../skills/security-review/)                 | Token/credential handling | ✅ Yes    |

### Cooper Test Specialist (`cooper-test-specialist`)

**Role**: Testing expert — Vitest unit/component tests, Playwright E2E tests.

| Skill                                                           | When to Use          | Mandatory   |
| --------------------------------------------------------------- | -------------------- | ----------- |
| [test-fixing](../skills/test-fixing/)                           | All testing tasks    | ✅ Yes      |
| [react-component-patterns](../skills/react-component-patterns/) | Component test setup | Conditional |

### Cooper Debugger (`cooper-debugger`)

**Role**: Debugging specialist — investigating issues across all three processes.

| Skill                                                         | When to Use               | Mandatory   |
| ------------------------------------------------------------- | ------------------------- | ----------- |
| [context-engineering](../skills/context-engineering/)         | Understanding bug context | ✅ Yes      |
| [electron-ipc-patterns](../skills/electron-ipc-patterns/)     | IPC-related bugs          | Conditional |
| [copilot-sdk-integration](../skills/copilot-sdk-integration/) | SDK-related bugs          | Conditional |

### Cooper Performance Optimizer (`cooper-performance-optimizer`)

**Role**: Performance — bundle size, render perf, IPC latency, memory.

| Skill                                                           | When to Use           | Mandatory   |
| --------------------------------------------------------------- | --------------------- | ----------- |
| [react-component-patterns](../skills/react-component-patterns/) | Renderer optimization | Conditional |
| [code-refactoring-guide](../skills/code-refactoring-guide/)     | Refactoring for perf  | Conditional |

### SDD Writer (`sdd-writer-agent`)

**Role**: Generate Software Design Documents with iterative review.

| Skill                                                   | When to Use              | Mandatory   |
| ------------------------------------------------------- | ------------------------ | ----------- |
| [sdd-writer-iterative](../skills/sdd-writer-iterative/) | Core SDD generation      | ✅ Yes      |
| [planning-and-scoping](../skills/planning-and-scoping/) | Scope design task        | ✅ Yes      |
| [security-review](../skills/security-review/)           | If SDD involves auth/IPC | Conditional |

## Skill Activation Checklist

Before starting any task:

```markdown
## Pre-Task Skill Identification

**Task**: [Description]
**Agent**: [Which agent is working]

### Required Skills (Check all that apply)

- [ ] context-engineering (multi-file/cross-process?)
- [ ] review-implementing (implementation plan?)
- [ ] test-fixing (tests need fixing/adding?)
- [ ] git-pushing (will commit code?)
- [ ] planning-and-scoping (non-trivial task?)
- [ ] code-refactoring-guide (code quality check?)
- [ ] security-review (IPC/auth/data?)
- [ ] electron-ipc-patterns (cross-process communication?)
- [ ] react-component-patterns (UI changes?)
- [ ] copilot-sdk-integration (SDK interaction?)
- [ ] sdd-writer-iterative (design document?)
```

## Skill Reference Quick Links

- **Global**: [context-engineering](../skills/context-engineering/) | [review-implementing](../skills/review-implementing/) | [test-fixing](../skills/test-fixing/) | [git-pushing](../skills/git-pushing/)
- **Cross-Cutting**: [planning-and-scoping](../skills/planning-and-scoping/) | [code-refactoring-guide](../skills/code-refactoring-guide/) | [security-review](../skills/security-review/)
- **Cooper-Specific**: [electron-ipc-patterns](../skills/electron-ipc-patterns/) | [react-component-patterns](../skills/react-component-patterns/) | [copilot-sdk-integration](../skills/copilot-sdk-integration/)
- **Utility**: [sdd-writer-iterative](../skills/sdd-writer-iterative/)

---

**For full skill documentation**, see [`.github/skills/README.md`](../skills/README.md)
