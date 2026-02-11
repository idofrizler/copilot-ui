# React Component Patterns

## Purpose

Define React + TypeScript + Tailwind conventions for Cooper's renderer process. Ensure consistent, accessible, and maintainable UI components.

## When to Use

- Creating new React components in `src/renderer/`
- Modifying existing UI components
- Adding hooks, context, or utilities

## When NOT to Use

- Main process or preload changes
- Non-UI logic changes

## Activation Rules

### Step 1: Component Structure

```typescript
// src/renderer/components/MyComponent.tsx
import React, { useState, useEffect } from 'react'

interface MyComponentProps {
  // All props explicitly typed — no `any`
  title: string
  onAction: (id: string) => void
  isDisabled?: boolean
}

export const MyComponent: React.FC<MyComponentProps> = ({ title, onAction, isDisabled = false }) => {
  // Hooks at top
  const [state, setState] = useState<string>('')

  // Effects after state
  useEffect(() => {
    // side effects
  }, [])

  // Event handlers
  const handleClick = () => {
    onAction(state)
  }

  // Render
  return (
    <div className="flex items-center gap-2 p-2">
      <span className="text-sm font-medium">{title}</span>
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Action
      </button>
    </div>
  )
}
```

### Step 2: Styling Rules

- **Tailwind utility classes** — Primary styling method
- **CSS modules** — Only when Tailwind can't express it
- **No inline styles** — Use Tailwind or CSS modules
- **Theme-aware** — Use Cooper's ThemeContext for colors when applicable
- **Dark mode** — All components must work in dark theme (Cooper's default)

### Step 3: State Management

- **React Context + hooks** — No Redux or external state libraries
- **Custom hooks** — Extract reusable logic into `src/renderer/hooks/`
- **Interfaces** — All types in `src/renderer/types/`

**Hook pattern:**

```typescript
// src/renderer/hooks/useSessionManager.ts
export function useSessionManager() {
  const [sessions, setSessions] = useState<Session[]>([]);

  const createSession = async (model: string) => {
    const session = await window.electronAPI.copilot.createSession(model);
    setSessions((prev) => [...prev, session]);
    return session;
  };

  return { sessions, createSession };
}
```

### Step 4: IPC Integration

When components need backend data:

```typescript
// ✅ Good: use the typed preload bridge
const data = await window.electronAPI.copilot.getSession(sessionId)

// ❌ Bad: direct Node.js access
const data = require('electron').ipcRenderer.invoke(...)  // NEVER
```

### Step 5: Accessibility

- Semantic HTML elements (`button`, `nav`, `main`, not `div` for everything)
- Keyboard navigation support
- ARIA labels for interactive elements
- Focus management for modals and dialogs

## Cooper-Specific Conventions

- **Components directory**: `src/renderer/components/`
- **Hooks directory**: `src/renderer/hooks/`
- **Types directory**: `src/renderer/types/`
- **Context directory**: `src/renderer/context/`
- **Themes directory**: `src/renderer/themes/`
- **Test files**: `tests/components/<Component>.test.tsx`

## Success Criteria

- Props interface defined (no `any`)
- Tailwind for styling (no inline styles)
- Dark mode compatible
- Keyboard accessible
- Custom hooks extracted for reusable logic

## Related Skills

- [electron-ipc-patterns](../electron-ipc-patterns/) — For IPC calls from components
- [test-fixing](../test-fixing/) — For component tests
