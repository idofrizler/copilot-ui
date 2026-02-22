# Release Notes

All notable changes to Cooper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.3

This release includes all changes currently on `staging` since `main` (`1.0.2`).

### Added

- **Find in Chat** — Added in-chat search with `Ctrl/Cmd+F`.
- **Session groups and same-repo spawn** — Added per-repo/folder session grouping and the ability to spawn a new session for the same repository.
- **File editing** — Added lightweight in-app file editing for final tweaks without turning Cooper into a full IDE.

### Fixed

- **Session persistence and history loading** — Fixed session persistence issues, including loading sessions from history.
- **Session loading stability/performance** — Fixed latency and crash issues during session loading.

## 1.0.2

This release includes all changes currently on `staging` since `main` (`1.0.1`), based on commit and diff review.

### Added

- **Linux packages** — Added AppImage, `.deb`, and `.rpm` build outputs for Linux distribution support.
- **CLI setup checks** — Added Copilot CLI install/auth status checks and IPC wiring to support setup guidance in-app.
- **Source issue linking** — PR workflows now persist and display source issue links in session data.
- **Session path controls** — Added XDG/COPILOT session path support and dev-session isolation controls.

### Changed

- **Model fetching and cache behavior** — Improved on-demand model fetching, persistent verified-model cache, cache versioning, and diagnostic logging in main process.
- **Chat/session UX** — Added/expanded auto-scroll behavior, scroll-to-bottom affordances, grouped tabs by repo, and richer edited-files summaries.
- **Dependencies and binaries** — Updated `@github/copilot-sdk` and bundled Copilot binaries.

### Fixed

- Model verification race conditions and missing baseline model fallback in API responses.
- UI stability issues including undefined `pendingConfirmations` / `editedFiles`, file preview loading races, and session YOLO mode persistence.
- Interaction issues including Ctrl/Cmd+W hard-close behavior, keypress latency in large sessions, and MCP tool display/default edge cases.

## 1.0.1

### Added

- **Downloadable Executables** — Pre-built macOS `.dmg` and Windows `.exe` installer on every release
- **Subagent Visibility** — See active subagents in the environment panel with file preview support
- **YOLO Mode** — Auto-approve all permission requests for uninterrupted agent flow
- **Drag & Drop Sessions** — Reorder tabs by dragging them
- **Favorite Models** — Pin your preferred models for quick switching; dynamic model list fetched from API
- **Copilot Instructions** — `.github/copilot-instructions.md` support with IPC and state management
- **Environment Panel** — View agent files, skills directories, and Copilot instructions from a dedicated panel
- **Zoom Controls** — Persistent window zoom in/out via keyboard shortcuts
- **Copy CWD** — One-click copy of the current working directory with visual feedback
- **Electron Startup Test** — Automated test verifying the app launches without module errors
- **Skills Documentation** — Comprehensive skills index and individual skill docs

### Changed

- **Windows Native Title Bar** — Windows builds use native title bar overlay for a platform-native look
- Dynamic model list from API replaces hardcoded model dropdown
- Restructured app folder layout — components moved out of monolithic `App.tsx`
- Sidebar drawer labels updated; top-bar model selector removed in favor of in-session switching
- Terminal toggle moved to a dedicated button
- Removed Microsoft Clarity telemetry
- Removed session keep-alive logic
- Updated instructions discovery to match Copilot CLI SDK conventions

### Fixed

- Model switching in new sessions no longer resets to default
- Terminal open state persists correctly when switching tabs
- Agent names display instead of file paths in the environment panel
- Markdown files without frontmatter no longer cause agent parsing errors
- File preview tree view padding alignment
- Tour highlight targeting for agent modes selector

## 1.0.0

Cooper is a fresh start — a rebrand and ground-up evolution of what was previously Copilot Skins. This release marks the first official version under the new name.

### Added

- **Voice Control**: "Hey GitHub" hands-free voice interaction with speech-to-text, text-to-speech, transcript normalization, and a persistent mute toggle
- **Integrated Terminal**: Full PTY-based terminal embedded in the app with run-in-terminal support for code blocks, Ctrl/Cmd+C smart copy, and copy-last-run
- **Welcome Wizard**: Guided onboarding spotlight tour shown on first launch
- **Responsive Layout**: Adaptive UI that works across different window sizes
- **File Preview Revamp**: View changed files in tree or flat view with full diffs, and untrack temporary files you don't want to commit
- **Mark as Unread**: Flag sessions you want to revisit and add notes for context
- **Settings Modal**: Sound toggle, TTS mute, and other preferences with persistent state
- **Tool Activity Display**: Live display of tool calls and activity inside assistant messages
- **Visual Attention Alerts**: Cross-platform visual cues (window bounce/flash) when the assistant needs your attention
- **Help Tooltips**: Command description tooltips in the confirmation modal
- **Kawaii Theme**: New built-in theme option
- **Claude Opus 4.6**: Added to available model list
- **Telemetry**: Microsoft Clarity integration with environment tagging, stable installation IDs, and sensitive-data masking
- **Version Notifications**: Popup alerts when a new version is available, with release notes shown on first startup

### Changed

- **Rebranded from Copilot Skins to Cooper** across the entire project — name, assets, and documentation
- Improved startup latency with early client and session initialization
- Worktree session list loads asynchronously for faster sidebar performance
- Session names are now the primary display text in session history (branch shown as secondary)
- Git worktree sessions no longer display disk usage
- Custom app menu with proper copy/paste handling for terminal compatibility
- Title bar pulled out into a dedicated component

### Fixed

- Terminal PTY crash in dev mode caused by React StrictMode double-mount
- Unzipper bundling issues causing crashes on Mac and AWS SDK errors at startup
- Windows setup script hardened for reliable first-run completion
- Branch names sanitized for git worktree compatibility
- Scroll-to-bottom logic improved for chat messages and session switching
- File preview now shows content for untracked new files when diff is unavailable
- Duplicate CopilotClient creation prevented for same working directory
- Correct target branch used in merge operations
