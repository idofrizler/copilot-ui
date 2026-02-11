# Cooper

<p align="center">
  <img src="src/renderer/assets/logo.png" alt="Cooper Logo" width="128" height="128">
</p>

A native desktop GUI for GitHub Copilot, built on the [Copilot SDK](https://github.blog/changelog/2026-01-14-copilot-sdk-in-technical-preview/).

![Cooper Demo](https://github.com/CooperAgent/cooper/releases/download/assets/Cooper-2.gif)

## Prerequisites

- A **[GitHub Copilot](https://github.com/features/copilot)** subscription
- **[GitHub CLI](https://cli.github.com/)** installed and authenticated — run `gh auth login` if you haven't already

## Install

### Windows

Download the latest `.exe` from the **[Releases page](https://github.com/CooperAgent/cooper/releases/latest)** and run it.

### macOS

Requires **Node.js 22+**.

```bash
git clone https://github.com/CooperAgent/cooper.git && cd cooper && npm install && npm run dist && open release/Cooper-*-arm64.dmg
```

<details>
<summary><b>Build from source on Windows</b></summary>

If you prefer building from source instead of using the installer:

```powershell
git clone https://github.com/CooperAgent/cooper.git; cd cooper; pwsh -NoProfile -File .\scripts\setup-windows.ps1; npm run dist:win
```

The setup script installs all Windows-specific prerequisites (Python, VS Build Tools, PowerShell 7+) and npm dependencies automatically.

</details>

<details>
<summary><b>Using an AI coding agent to install</b></summary>

Tell your agent:

> Clone `https://github.com/CooperAgent/cooper.git`, install dependencies, and build an installer for my OS (macOS → `.dmg`, Windows → `.exe`).

</details>

## Features

- 🗂️ **Tabbed Sessions** — Multiple conversations, each with its own working directory and model
- 🌳 **Git Worktree Sessions** — Paste a GitHub issue URL → isolated worktree + session
- 🔁 **[Ralph Wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)** — Iterative agent mode: set completion criteria, let it loop until done
- 💻 **Embedded Terminal** — Real PTY per session, one click to attach output to your prompt
- 🎤 **Voice Input/Output** — Speech-to-text and text-to-speech
- 🔌 **MCP Servers** — Model Context Protocol for extended tool capabilities
- 🎯 **Agent Skills** — Personal and project skills via `SKILL.md` and `.agent.md` files
- 🤖 **Model Selection** — GPT-5.2, Opus-4.6, Sonnet, Haiku, Gemini, and more

## Development

```bash
npm install && npm run dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Community

Join our [Discord](https://discord.gg/HPmg6ygq6d) to report bugs, request features, and chat.

## License

MIT
