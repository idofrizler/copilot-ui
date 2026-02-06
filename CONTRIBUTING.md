# Contributing to Cooper

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repo (or branch directly if you're a named contributor)
2. Clone and install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Run tests:
   ```bash
   npm test
   ```

## Branching & Pull Requests

- Branch off **`staging`** (not `main`)
- Submit your PR back to **`staging`**
- Stable versions are merged from `staging` → `main` by the maintainer, following a version bump and release notes update

## Reporting Issues

Open a GitHub issue with a clear description and steps to reproduce. For security vulnerabilities, see [SECURITY.md](SECURITY.md).
