# Release Notes

All notable changes to Cooper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
