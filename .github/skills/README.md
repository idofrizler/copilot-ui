# Cooper AI Agent Skills Catalog

This directory contains all agent skills used in the Cooper (copilot-ui) project. Skills are reusable, documented capabilities that agents activate to perform specific tasks.

> **📖 Quick Navigation**: See [INDEX.md](./INDEX.md) for routing rules (which skills to use based on file paths).

## 📚 Skill Catalog

### Global Agent Skills (Mandatory)

These skills are mandatory for all agents on all tasks:

| Skill                                         | Purpose                                | Mandatory |
| --------------------------------------------- | -------------------------------------- | --------- |
| [context-engineering](./context-engineering/) | Build task context, track constraints  | ✅ Yes    |
| [review-implementing](./review-implementing/) | Validate changes before execution      | ✅ Yes    |
| [test-fixing](./test-fixing/)                 | Fix failing tests, prevent regressions | ✅ Yes    |
| [git-pushing](./git-pushing/)                 | Atomic commits, clear messages         | ✅ Yes    |

### Cross-Cutting Skills (All Areas)

These skills apply across all areas and should be consulted for relevant changes:

| Skill                                               | Purpose                                           | When to Use                    |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| [planning-and-scoping](./planning-and-scoping/)     | Decompose tasks, assess risk                      | Starting any non-trivial work  |
| [code-refactoring-guide](./code-refactoring-guide/) | Evaluate code quality before commit               | Before committing code changes |
| [security-review](./security-review/)               | IPC security, preload isolation, input validation | Auth, IPC, or data changes     |

### Cooper-Specific Skills

| Skill                                                   | Purpose                                           | When to Use                        |
| ------------------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| [electron-ipc-patterns](./electron-ipc-patterns/)       | Main↔renderer IPC via preload bridge              | Any new IPC channel or handler     |
| [react-component-patterns](./react-component-patterns/) | React + Tailwind + hooks conventions              | Any renderer UI change             |
| [copilot-sdk-integration](./copilot-sdk-integration/)   | @github/copilot-sdk session, model, tool patterns | Any Copilot SDK interaction change |

### Utility Skills

| Skill                                           | Purpose                                    | When to Use                      |
| ----------------------------------------------- | ------------------------------------------ | -------------------------------- |
| [sdd-writer-iterative](./sdd-writer-iterative/) | Generate SDDs with 2-loop iterative review | Design docs for complex features |

## 🎯 Skill Activation Rules

### Skill Tracking Output (MANDATORY)

**All agents MUST explicitly log when looking for and using skills:**

```
🔍 Looking for skill: [skill-name] - [brief reason why needed]
✅ Using skill: [skill-name]
```

### For Agents

1. **Identify Required Skills**: Before starting work, determine which skills apply
2. **Explicit Tracking**: Always log when looking for and using skills
3. **Follow Guidelines**: Each skill has specific activation rules in its SKILL.md
4. **No Silent Usage**: Make skill activation transparent in logs/comments

### For Developers

1. **Browse Catalog**: Review available skills before implementing new functionality
2. **Reuse, Don't Recreate**: Use existing skills when possible
3. **Add New Skills**: Follow the template when adding new capabilities
4. **Keep Updated**: Update SKILL.md when skill behavior changes

## 📁 Skill Directory Structure

Each skill follows this structure:

```
.github/skills/<skill-name>/
├── SKILL.md              # Skill documentation (required)
├── examples/             # Usage examples (optional)
└── templates/            # Templates/scripts (optional)
```

## 🔍 Skill Template

When creating a new skill, use this template:

```markdown
# Skill Name

## Purpose

One-line description of what this skill does

## When to Use

- Specific scenario 1
- Specific scenario 2

## When NOT to Use

- Antipattern 1

## Activation Rules

Step-by-step instructions

## Cooper-Specific Examples

Real examples from this repo

## Success Criteria

How to know the skill was used correctly

## Related Skills

Links to complementary skills
```

## 🚫 Anti-Patterns

- ❌ Create skills without documentation
- ❌ Use skills implicitly without logging
- ❌ Create duplicate skills with similar purposes
- ✅ Document every skill clearly
- ✅ Make skill usage explicit and transparent
- ✅ Consolidate similar capabilities

---

**Remember**: Skills are tools to make agents more capable. Use them explicitly, document them clearly, and keep them focused.
