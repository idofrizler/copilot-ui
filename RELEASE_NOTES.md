# Release Notes

All notable changes to Copilot Skins will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.5.5

### Added

- **File Preview Revamp**: View changed files in tree or flat view with full diffs, and untrack temporary files you don't want to commit
- **Mark as Unread**: Flag sessions you want to revisit and add notes for context
- **Copy Last Run**: New terminal option to quickly copy the output of the last command
- **Run in Terminal**: Execute command blocks from the conversation directly in the integrated terminal

### Fixed

- Improved startup latency and faster loading of the session history pane

---

## 1.1.0

### Added

- **Staging Build Workflow**: New staging branch for thorough testing before production releases
- **Version Update Notifications**: Popup alerts when a new version is available, with "Don't remind me" option
- **Release Notes Display**: Automatic display of release notes on first startup of a new version
- **Automatic Version Bumping**: Minor versions are automatically incremented when releasing from staging to main

### Changed

- Improved release process with GitHub Actions workflows for staging and production

---

## 1.0.0

### Added

- Initial release of Copilot Skins
- Native desktop GUI for GitHub Copilot
- Multiple theme support
- Worktree session management
- MCP server integration
- Terminal integration
- Ralph and Lisa AI agent modes
