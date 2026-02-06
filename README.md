# Cooper

<p align="center">
  <img src="src/renderer/assets/logo.png" alt="Cooper Logo" width="128" height="128">
</p>

A native desktop GUI for GitHub Copilot, wrapping the [Copilot SDK](https://github.blog/changelog/2026-01-14-copilot-sdk-in-technical-preview/) and the Copilot agentic logic.

Watch Cooper building itself in action!

![Cooper Demo](https://github.com/idofrizler/copilot-ui/releases/download/assets/Copilot.Skins.2-4.gif)

## Features

### 🗂️ Multiple Sessions, Multiple Contexts

CLI gives you one session at a time. Cooper gives you tabs—each with its own working directory, model, and conversation history.

Each session maintains its own working directory, model, allowed commands, and file changes. Switch tabs instantly. No re-explaining context. No restarting sessions.

### 🌳 Git Worktree Sessions

Instead of just a new tab, create a worktree session—a completely isolated git worktree tied to a branch.

Paste a GitHub issue URL. Cooper fetches the issue (title, body, comments), creates a git worktree in `~/.copilot-sessions/` and opens a new session in that worktree.

Work on multiple issues simultaneously without stashing, switching branches, or losing your place. Each worktree is a real directory—run builds, tests, whatever you need.

### 🔁 Ralph Wiggum: Iterative Agent Mode

Named after [Claude Code's ralph-wiggum plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum), this feature lets the agent run in a loop until a task is actually done.

You prompt with completion criteria → agent works → checks its work → continues if not done → repeats up to N times. Perfect for tasks that need multiple passes to get right.

### 💻 Embedded Terminal

Every session has a terminal panel that runs in the session's working directory. It's a real PTY (xterm.js), not a fake console.

Click "Add to Message" and the terminal's output buffer gets attached to your next prompt. See a build error? One click to show it to the agent. No copy-paste, no explaining—just "fix this" with full context.

### More Features

- 🔐 **Allowed Commands** — Per-session and global command allowlisting with visual management
- 🔌 **MCP Servers** — Configure Model Context Protocol servers for extended tool capabilities
- 🎯 **Agent Skills** — Personal and project skills via `SKILL.md` files (compatible with Claude format)
- 📦 **Context Compaction** — Automatic conversation summarization when approaching token limits
- 🎨 **Themes** — Custom themes via JSON, including some nostalgic ones (ICQ, Night Owl)
- 🤖 **Multi-Model** — Switch between GPT-4.1, GPT-5, Claude Opus-4, Sonnet, Haiku, Gemini, and more

## Prerequisites

- Node.js 22+ (required for Copilot SDK)
- GitHub Copilot subscription
- GitHub CLI authenticated (`gh auth login`)

### Windows Additional Requirements

Windows requires additional build tools for native modules:

- **Python 3.x** (for node-gyp)
- **Visual Studio Build Tools 2022** with C++ workload (Spectre libraries not required - automatically patched)
- **PowerShell 7+** (for running scripts)

**Quick Setup:** Run our automated setup script (requires [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/)):

```powershell
# In PowerShell (run as Administrator recommended)
cd copilot-ui
pwsh -NoProfile -File .\scripts\setup-windows.ps1
```

This installs Windows prerequisites and npm dependencies automatically. After running, you're ready to go with `npm run dev`!

<details>
<summary><b>Manual Windows Setup (if automated script fails)</b></summary>

1. **Install PowerShell 7+:**

   ```powershell
   winget install Microsoft.PowerShell
   ```

2. **Install Python:**

   ```powershell
   winget install Python.Python.3.12
   ```

3. **Install Visual Studio Build Tools:**

   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools --silent --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
   ```

4. **Set PowerShell execution policy:**

   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

5. **Restart your terminal** for PATH changes to take effect

</details>

## Installation (Agent-first)

If you're using an AI coding agent: **tell it to clone this repo, install deps, and build the installer for your OS**.

Suggested prompt:

> Clone `https://github.com/idofrizler/copilot-ui.git`, install dependencies, and build a signed/unsigned installer for my OS.
>
> - macOS: output a `.dmg`
> - Windows: output an `.exe`

### macOS (build a DMG)

```bash
git clone https://github.com/idofrizler/copilot-ui.git
cd copilot-ui
npm install
npm run dist
open release/Cooper-*-arm64.dmg
```

### Windows (build an EXE)

```powershell
git clone https://github.com/idofrizler/copilot-ui.git
cd copilot-ui
pwsh -NoProfile -File .\scripts\setup-windows.ps1
npm run dist:win
```

## Development

```bash
npm install
npm run dev
```

## Upgrading

Cooper is distributed via GitHub Releases. To upgrade via command line, download the latest release asset and install it.

### macOS

```bash
gh release download --repo idofrizler/copilot-ui --pattern "Cooper-*.dmg" --dir ~/Downloads --clobber
open ~/Downloads/Cooper-*.dmg
```

### Windows (PowerShell)

```powershell
gh release download --repo idofrizler/copilot-ui --pattern "Cooper-*.exe" --dir $env:TEMP --clobber
Start-Process (Get-ChildItem $env:TEMP\Cooper-*.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

## Build

```bash
npm run build
```

## How It Works

This app uses the official [GitHub Copilot SDK](https://www.npmjs.com/package/@github/copilot-sdk) to communicate directly with GitHub Copilot. It creates a native Electron window with a React-based chat interface.

The SDK uses your existing GitHub authentication (via `gh` CLI) to authenticate requests.

## License

MIT
