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

## Release

### How it works

The release workflow (`.github/workflows/release.yml`) runs automatically on push to `main` or `staging`, and can be triggered manually via `workflow_dispatch` (restricted to `main`/`staging` — other branches are rejected).

It has 3 jobs:

1. **Validate** — reads the version from `package.json`, checks that `RELEASE_NOTES.md` has content, and ensures the git tag doesn't already exist.
2. **Build** — runs in parallel on macOS (arm64) and Windows (x64). macOS builds are code-signed but **not notarized** (users must right-click → Open on first launch). Produces 2 artifacts: DMG for macOS and Setup installer for Windows.
3. **Release** — creates a GitHub Release with all artifacts attached.

### Versioning

The version comes from `package.json`. Bump it with:

```bash
node scripts/bump-version.js [major|minor|patch]
```

### Release types

| Branch    | Tag             | Type                              |
| --------- | --------------- | --------------------------------- |
| `main`    | `v1.0.0`        | Full release (marked as `latest`) |
| `staging` | `v1.0.0-rc.<n>` | Release candidate (prerelease)    |

### Artifacts

| File                                 | Platform              |
| ------------------------------------ | --------------------- |
| `Cooper-<version>-mac-arm64.dmg`     | macOS (Apple Silicon) |
| `Cooper-<version>-win-x64-Setup.exe` | Windows installer     |

### Releasing a new version

1. Bump the version: `node scripts/bump-version.js patch`
2. Update `RELEASE_NOTES.md` with a `## <version>` section
3. Merge to `staging` for an RC, or to `main` for a full release
4. The workflow runs automatically and creates the GitHub Release

### Testing from a feature branch

Open a PR to `staging`. The **Build Check** workflow will build and package the app on macOS and Windows (unsigned), and upload the artifacts. Download them from the PR's workflow run in the Actions tab — they're kept for 3 days.

## CI

### Pull request checks

Every PR to `main` or `staging` runs the **Build Check** workflow (`.github/workflows/build-pr.yml`). It builds and packages the app on macOS and Windows — the same platforms as the release — but without code signing. Unsigned artifacts (DMG, Setup installer) are uploaded and kept for 3 days so reviewers can test the build. Doc-only changes (`*.md`, `docs/**`) are skipped.

### Release workflow

See the [Release](#release) section below for the full release CI pipeline.

### Workflows overview

| Workflow     | File                       | Trigger                                   |
| ------------ | -------------------------- | ----------------------------------------- |
| Build Check  | `build-pr.yml`             | PRs to `main`/`staging`                   |
| Release      | `release.yml`              | Push to `main`/`staging`, manual dispatch |
| Bump Version | `bump-version-staging.yml` | Manual dispatch (staging only)            |

## Reporting Issues

Open a GitHub issue with a clear description and steps to reproduce. For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## Community

Join our [Discord server](https://discord.gg/HPmg6ygq6d) to report bugs, request features, or get involved with the project. We'd love to have you!
