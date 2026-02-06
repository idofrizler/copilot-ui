# Cooper

<p align="center">
  <img src="src/renderer/assets/logo.png" alt="Cooper Logo" width="128" height="128">
</p>

A native desktop GUI for GitHub Copilot, built on the [Copilot SDK](https://github.blog/changelog/2026-01-14-copilot-sdk-in-technical-preview/).

![Cooper Demo](https://github.com/idofrizler/cooper/releases/download/assets/Copilot.Skins.2-4.gif)

## Features

- 🗂️ **Tabbed Sessions** — Multiple sessions, each with its own working directory, model, and conversation history. No re-explaining context.
- 🌳 **Git Worktree Sessions** — Paste a GitHub issue URL → Cooper creates an isolated worktree and opens a session in it. Work on multiple issues at once.
- 🔁 **[Ralph Wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)** — Iterative agent mode. Set completion criteria, let the agent loop until the task is actually done.
- 💻 **Embedded Terminal** — Real PTY per session. One click to attach terminal output to your next prompt.
- 🎤 **Voice Commands** — Speech input and audio output for hands-free interaction
- 🔐 **Allowed Commands** — Per-session and global command allowlisting
- 🔌 **MCP Servers** — Model Context Protocol servers for extended tool capabilities
- 🎯 **Agent Skills** — Personal and project skills via `SKILL.md` files
- 📦 **Context Compaction** — Automatic conversation summarization when approaching token limits
- 🤖 **Model Selection** — GPT-5.2, Opus-4.6, Sonnet, Haiku, Gemini, and more

## Installation

You need **Node.js 22+**, a **GitHub Copilot subscription**, and **GitHub CLI** authenticated (`gh auth login`).

### macOS

```bash
git clone https://github.com/idofrizler/cooper.git && cd cooper && npm install && npm run dist && open release/Cooper-*-arm64.dmg
```

### Windows

```powershell
git clone https://github.com/idofrizler/cooper.git; cd cooper; pwsh -NoProfile -File .\scripts\setup-windows.ps1; npm run dist:win
```

The setup script installs all Windows-specific prerequisites (Python, VS Build Tools, PowerShell 7+) and npm dependencies automatically.

<details>
<summary><b>Manual Windows setup</b></summary>

If the automated script fails, install these manually:

1. **PowerShell 7+:** `winget install Microsoft.PowerShell`
2. **Python 3.x:** `winget install Python.Python.3.12`
3. **VS Build Tools:** `winget install Microsoft.VisualStudio.2022.BuildTools --silent --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
4. **Execution policy:** `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
5. Restart your terminal, then run `npm install && npm run dist:win`

</details>

<details>
<summary><b>Using an AI coding agent to install</b></summary>

Tell your agent:

> Clone `https://github.com/idofrizler/cooper.git`, install dependencies, and build an installer for my OS (macOS → `.dmg`, Windows → `.exe`).

</details>

## Development

```bash
npm install && npm run dev
```

## Build

```bash
npm run build
```

## How It Works

Cooper uses the official [GitHub Copilot SDK](https://www.npmjs.com/package/@github/copilot-sdk) to communicate with GitHub Copilot via an Electron + React interface. Authentication is handled through your existing `gh` CLI login.

## License

MIT
