# Copilot Skins

<p align="center">
  <img src="build/icon.png" alt="Copilot Skins Logo" width="128" height="128">
</p>

A native desktop GUI for GitHub Copilot, wrapping the [Copilot SDK](https://github.blog/changelog/2026-01-14-copilot-sdk-in-technical-preview/) and the Copilot agentic logic.

![Screenshot](screenshot.png)

## Prerequisites

- Node.js 18+
- GitHub Copilot subscription
- GitHub CLI authenticated (`gh auth login`)

## Installation

### Build the App (macOS)

Building locally avoids macOS Gatekeeper issues with unsigned apps:

```bash
# Clone and install
git clone https://github.com/idofrizler/copilot-ui.git
cd copilot-ui
npm install

# Build the DMG
npm run dist

# Install
open release/Copilot-Skins-*-arm64.dmg
```

Drag "Copilot Skins" to your Applications folder and you're ready to go!

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## How It Works

This app uses the official [GitHub Copilot SDK](https://www.npmjs.com/package/@github/copilot-sdk) to communicate directly with GitHub Copilot. It creates a native Electron window with a React-based chat interface.

The SDK uses your existing GitHub authentication (via `gh` CLI) to authenticate requests.

### Architecture

- **Multiple CopilotClients** - One client per unique working directory for proper cwd isolation
- **Session state** - Tracks model, cwd, and always-allowed executables per session
- **IPC bridge** - Secure communication between main process and renderer

## License

MIT
