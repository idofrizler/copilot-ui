# Skills Index

Central discovery and routing for the Cooper Agent Skills library.

## Routing Rules (Path → Required Skills)

When an agent detects changes, consult this table to determine which skills to load:

| File Pattern                 | Required Skills                            | Conditional Skills                                                          |
| ---------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `src/main/**`                | `electron-ipc-patterns`                    | `copilot-sdk-integration` (if SDK changes), `security-review` (if IPC/auth) |
| `src/preload/**`             | `electron-ipc-patterns`, `security-review` | -                                                                           |
| `src/renderer/components/**` | `react-component-patterns`                 | `electron-ipc-patterns` (if IPC calls)                                      |
| `src/renderer/hooks/**`      | `react-component-patterns`                 | `copilot-sdk-integration` (if SDK hooks)                                    |
| `src/renderer/types/**`      | `react-component-patterns`                 | `electron-ipc-patterns` (if IPC types)                                      |
| `src/renderer/utils/**`      | `react-component-patterns`                 | -                                                                           |
| `tests/**`                   | `test-fixing`                              | -                                                                           |
| `.github/workflows/**`       | `test-fixing`                              | -                                                                           |
| Any IPC/preload change       | `security-review`, `electron-ipc-patterns` | -                                                                           |
| Any SDK interaction          | `copilot-sdk-integration`                  | -                                                                           |
| Any PR                       | `planning-and-scoping`                     | -                                                                           |

## Skills Catalog

### Global Agent Skills (Mandatory)

| Skill                                         | Description                            | Keywords                           |
| --------------------------------------------- | -------------------------------------- | ---------------------------------- |
| [context-engineering](./context-engineering/) | Build task context, track constraints  | context, constraints, dependencies |
| [review-implementing](./review-implementing/) | Validate changes before execution      | review, validation, checklist      |
| [test-fixing](./test-fixing/)                 | Fix failing tests, prevent regressions | test failures, regressions, vitest |
| [git-pushing](./git-pushing/)                 | Atomic commits with clear messages     | git, commits, push                 |

### Cross-Cutting Skills

| Skill                                               | Description                                       | Keywords                         |
| --------------------------------------------------- | ------------------------------------------------- | -------------------------------- |
| [planning-and-scoping](./planning-and-scoping/)     | Decompose tasks, assess risk, create checklists   | planning, scope, risk            |
| [code-refactoring-guide](./code-refactoring-guide/) | Evaluate code quality before commit               | refactoring, quality, complexity |
| [security-review](./security-review/)               | IPC security, preload isolation, input validation | security, IPC, preload, electron |

### Cooper-Specific Skills

| Skill                                                   | Description                                       | Keywords                             |
| ------------------------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| [electron-ipc-patterns](./electron-ipc-patterns/)       | Main↔renderer IPC via preload bridge              | IPC, preload, electron, bridge       |
| [react-component-patterns](./react-component-patterns/) | React + Tailwind + hooks conventions              | React, Tailwind, components, hooks   |
| [copilot-sdk-integration](./copilot-sdk-integration/)   | @github/copilot-sdk session, model, tool patterns | Copilot SDK, sessions, models, tools |

### Utility Skills

| Skill                                           | Description                                | Keywords                      |
| ----------------------------------------------- | ------------------------------------------ | ----------------------------- |
| [sdd-writer-iterative](./sdd-writer-iterative/) | Generate SDDs with 2-loop iterative review | SDD, design doc, architecture |

## How Skill Selection Works

1. **Agent receives task** → Analyzes changed files or user request
2. **Consults routing rules** → Matches file patterns to required skills
3. **Loads skill catalog** → Reads descriptions to confirm relevance
4. **Loads SKILL.md** → Follows detailed instructions in the skill
5. **Reports skills used** → Lists activated skills in response

### Selection Priority

1. **Mandatory skills** always load (context-engineering, review-implementing, test-fixing, git-pushing)
2. **Routing-matched skills** load based on changed file patterns
3. **Keyword-matched skills** load based on task description
4. **Conditional skills** load only when specific criteria met

## Validation Commands

| Area       | Commands                                |
| ---------- | --------------------------------------- |
| Build      | `npm run build`                         |
| Unit Tests | `npm test` or `npm run test:components` |
| E2E Tests  | `npm run test:e2e`                      |
| Type Check | `npx tsc --noEmit`                      |
| Lint       | `npx eslint src/`                       |

## Adding New Skills

1. Create folder: `.github/skills/<skill-name>/`
2. Add `SKILL.md` with skill documentation
3. Update this INDEX.md (add to catalog and routing if applicable)
4. Update `.github/agents/SKILLS_MAPPING.md`

---

**Last updated**: 2026-02-10
