# Release Binaries Implementation Plan

This document outlines the plan to add cross-platform binary builds (macOS arm64, Windows x64) to the GitHub release workflow.

## Overview

**Current State:**

- Release workflow creates a GitHub Release with tag and release notes
- No binaries are attached — users must build from source
- `dist` script creates macOS DMG locally via manual `hdiutil` command
- `dist:win` script creates only an unpacked directory (no installers)

**Target State:**

- GitHub Release includes downloadable binaries for macOS and Windows
- macOS: `.dmg` installer (arm64)
- Windows: NSIS installer `.exe` + portable `.exe` (x64)
- Code signing and notarization for both platforms

---

## Phase 1: Core Binary Build & Release

### 1.1 Update `package.json` Build Configuration

**File:** `package.json` → `build` section

**Changes:**

```json
{
  "build": {
    "appId": "com.idofrizler.cooper",
    "productName": "Cooper",
    "directories": {
      "output": "release"
    },
    "files": ["out/**/*", "public/**/*"],
    "asarUnpack": [
      "node_modules/@github/copilot-*/**/*",
      "node_modules/ffmpeg-static/**/*",
      "public/whisper-cpp/**/*",
      "public/whisper-model/**/*"
    ],
    "mac": {
      "category": "public.app-category.developer-tools",
      "icon": "build/icon.icns",
      "target": [
        {
          "target": "dmg",
          "arch": ["arm64"]
        }
      ],
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "extendInfo": {
        "NSMicrophoneUsageDescription": "This app needs microphone access for voice input and speech-to-text features."
      }
    },
    "dmg": {
      "artifactName": "${productName}-${version}-${arch}.${ext}",
      "contents": [
        { "x": 130, "y": 220 },
        { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
      ]
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        },
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "artifactName": "${productName}-${version}-Setup.${ext}"
    },
    "portable": {
      "artifactName": "${productName}-${version}-Portable.${ext}"
    }
  }
}
```

**Key changes:**

- Add explicit `mac.target` with `dmg` and `arch: ["arm64"]`
- Add `dmg` config for proper DMG layout with explicit `artifactName`
- Add `artifactName` patterns for consistent naming across all targets
- Expand existing `win.target` with explicit `arch: ["x64"]`

---

### 1.2 Update npm Scripts

**File:** `package.json` → `scripts` section

**Changes:**

```json
{
  "scripts": {
    "dist": "npm run test && npm run clean && npm run prebuild-info && electron-vite build && electron-builder --mac",
    "dist:win": "npm run test && npm run clean && npm run prebuild-info && electron-vite build && electron-builder --win"
  }
}
```

**Key changes:**

- `dist`: Remove the inline `hdiutil` script — electron-builder now creates DMG natively
- `dist:win`: Remove `--dir` flag so it produces actual installers

> Note: CI does not use these scripts. The workflow runs `prebuild-info`, `electron-vite build`,
> and `electron-builder` as separate steps for better visibility and error handling.

---

### 1.3 Rewrite Release Workflow

**File:** `.github/workflows/release.yml`

**New structure:**

```yaml
name: Release

on:
  push:
    branches: [main]
    paths-ignore:
      - '*.md'
      - 'docs/**'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  # Job 1: Validate release conditions
  validate:
    runs-on: ubuntu-latest
    outputs:
      should_release: ${{ steps.check.outputs.should_release }}
      tag_exists: ${{ steps.version.outputs.tag_exists }}
      version: ${{ steps.version.outputs.version }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check release notes exist
        id: check
        run: |
          if [ ! -f "RELEASE_NOTES.md" ]; then
            echo "should_release=false" >> $GITHUB_OUTPUT
            exit 0
          fi
          if ! grep -q "^## " RELEASE_NOTES.md; then
            echo "should_release=false" >> $GITHUB_OUTPUT
            exit 0
          fi
          echo "should_release=true" >> $GITHUB_OUTPUT

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Get version and check tag
        id: version
        run: |
          version=$(node -p "require('./package.json').version")
          echo "version=$version" >> $GITHUB_OUTPUT
          if git rev-parse "v$version" >/dev/null 2>&1; then
            echo "tag_exists=true" >> $GITHUB_OUTPUT
          else
            echo "tag_exists=false" >> $GITHUB_OUTPUT
          fi

  # Job 2: Build binaries on each platform
  build:
    needs: validate
    if: needs.validate.outputs.should_release == 'true' && needs.validate.outputs.tag_exists != 'true'
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-14
            platform: mac
            artifact_name: macos
          - os: windows-latest
            platform: win
            artifact_name: windows
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      # --- Windows-specific setup ---
      - name: Install dependencies (Windows)
        if: runner.os == 'Windows'
        run: npm ci --ignore-scripts && npx patch-package

      - name: Cache node-pty build (Windows)
        if: runner.os == 'Windows'
        id: cache-node-pty-win
        uses: actions/cache@v4
        with:
          path: node_modules/node-pty/build
          key: node-pty-${{ runner.os }}-node22-${{ hashFiles('package-lock.json') }}

      - name: Rebuild node-pty (Windows)
        if: runner.os == 'Windows' && steps.cache-node-pty-win.outputs.cache-hit != 'true'
        run: npx @electron/rebuild -w node-pty

      - name: Install native dependency binaries (Windows)
        if: runner.os == 'Windows'
        run: |
          node node_modules/ffmpeg-static/install.js
          node node_modules/vosk-koffi/scripts/postinstall.js

      # --- macOS-specific setup ---
      - name: Install dependencies (macOS)
        if: runner.os == 'macOS'
        run: npm ci --ignore-scripts && npx patch-package && npm run rebuild-pty

      - name: Install native dependency binaries (macOS)
        if: runner.os == 'macOS'
        run: |
          node node_modules/ffmpeg-static/install.js
          node node_modules/vosk-koffi/scripts/postinstall.js

      # --- Common steps ---
      - name: Run tests
        run: npm test

      - name: Build application
        run: npm run prebuild-info && electron-vite build

      - name: Build distributables (macOS)
        if: runner.os == 'macOS'
        run: npx electron-builder --mac --publish never

      - name: Build distributables (Windows)
        if: runner.os == 'Windows'
        run: npx electron-builder --win --publish never

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact_name }}
          path: |
            release/*.dmg
            release/*.exe
            !release/*.blockmap
          if-no-files-found: error
          retention-days: 5

  # Job 3: Create GitHub Release with artifacts
  release:
    needs: [validate, build]
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - name: List artifacts
        run: ls -la artifacts/

      - name: Extract release notes
        id: release_notes
        # Note: The awk pattern escapes dots in version strings. If versions ever contain
        # other regex-special characters, this will need additional escaping.
        run: |
          version="${{ needs.validate.outputs.version }}"
          notes=$(awk "/^## ${version//./\\.}/,/^## [0-9]+\.[0-9]+\.[0-9]+/{if(/^## [0-9]+\.[0-9]+\.[0-9]+/ && !/^## ${version//./\\.}/)exit; print}" RELEASE_NOTES.md | tail -n +2)
          if [ -z "$notes" ]; then
            notes="Release $version"
          fi
          echo "notes<<EOF" >> $GITHUB_OUTPUT
          echo "$notes" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Create GitHub Release
        uses: ncipollo/release-action@v1
        with:
          tag: v${{ needs.validate.outputs.version }}
          name: v${{ needs.validate.outputs.version }}
          body: ${{ steps.release_notes.outputs.notes }}
          artifacts: artifacts/*
          makeLatest: true
```

---

### 1.4 Expected Artifacts

After Phase 1, each release will include:

| Platform    | Artifact       | Filename Pattern                |
| ----------- | -------------- | ------------------------------- |
| macOS arm64 | DMG installer  | `Cooper-{version}-arm64.dmg`    |
| Windows x64 | NSIS installer | `Cooper-{version}-Setup.exe`    |
| Windows x64 | Portable       | `Cooper-{version}-Portable.exe` |

---

## Phase 2: Code Signing & Notarization

### 2.1 macOS Code Signing & Notarization

**Prerequisites (manual steps by maintainer):**

1. Apple Developer Program membership ($99/year)
2. Create "Developer ID Application" certificate in Apple Developer portal
3. Export certificate as `.p12` file with password
4. Create app-specific password for notarization at appleid.apple.com

**GitHub Secrets to add:**
| Secret Name | Description |
|-------------|-------------|
| `MAC_CERTS` | Base64-encoded `.p12` certificate file |
| `MAC_CERTS_PASSWORD` | Password for the `.p12` file |
| `APPLE_ID` | Apple ID email for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID (10-char) |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |

**Workflow changes for macOS build step:**

```yaml
- name: Build distributables (macOS)
  if: runner.os == 'macOS'
  run: npx electron-builder --mac --publish never
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_LINK: ${{ secrets.MAC_CERTS }}
    CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTS_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
```

**Update `package.json` build config:**

```json
{
  "mac": {
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "notarize": true
  }
}
```

> electron-builder v24+ has built-in notarization support. When `"notarize": true` is set, it
> automatically reads `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_SPECIFIC_PASSWORD` from
> environment variables. No separate `afterSign` script is needed.

---

### 2.2 Windows Code Signing

**Prerequisites (manual steps by maintainer):**

> **Important:** Since June 2023, certificate authorities no longer issue file-based OV code
> signing certificates. All new certificates require hardware tokens or cloud-based signing.
> Azure Trusted Signing is the recommended approach for CI pipelines.

**Option A: Azure Trusted Signing (Recommended for CI)**

Cloud-based signing with EV-equivalent SmartScreen reputation. No hardware token needed.

1. Create an Azure subscription
2. Set up Azure Trusted Signing resource
3. Create a signing profile and certificate

**GitHub Secrets to add:**
| Secret Name | Description |
|-------------|-------------|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | Azure AD app client ID |
| `AZURE_CLIENT_SECRET` | Azure AD app client secret |
| `AZURE_ENDPOINT` | Trusted Signing account endpoint |
| `AZURE_CODE_SIGNING_ACCOUNT` | Trusted Signing account name |
| `AZURE_CERT_PROFILE` | Certificate profile name |

**Workflow changes for Windows build step:**

```yaml
- name: Build distributables (Windows)
  if: runner.os == 'Windows'
  run: npx electron-builder --win --publish never
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
    AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
    AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
    AZURE_ENDPOINT: ${{ secrets.AZURE_ENDPOINT }}
    AZURE_CODE_SIGNING_ACCOUNT: ${{ secrets.AZURE_CODE_SIGNING_ACCOUNT }}
    AZURE_CERT_PROFILE: ${{ secrets.AZURE_CERT_PROFILE }}
```

**Update `package.json` build config:**

```json
{
  "win": {
    "azureSignOptions": {
      "endpoint": "${env.AZURE_ENDPOINT}",
      "certificateProfileName": "${env.AZURE_CERT_PROFILE}",
      "codeSigningAccountName": "${env.AZURE_CODE_SIGNING_ACCOUNT}"
    }
  }
}
```

**Option B: Legacy File-Based OV Certificate**

Only if you already have a file-based `.pfx` certificate (these are no longer issued).

**GitHub Secrets to add:**
| Secret Name | Description |
|-------------|-------------|
| `WIN_CSC_LINK` | Base64-encoded `.pfx` certificate file |
| `WIN_CSC_KEY_PASSWORD` | Password for the `.pfx` file |

```yaml
- name: Build distributables (Windows)
  if: runner.os == 'Windows'
  run: npx electron-builder --win --publish never
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
```

**Option C: SSL.com eSigner**

Cloud-based OV/EV signing alternative. Requires an SSL.com account and eSigner subscription.

---

### 2.3 Workflow Integration (Complete)

Final build step in the workflow, using separate platform-specific steps to avoid fragile ternary expressions:

```yaml
# ... checkout, setup, install, test, electron-vite build steps ...

- name: Build distributables (macOS)
  if: runner.os == 'macOS'
  run: npx electron-builder --mac --publish never
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    CSC_LINK: ${{ secrets.MAC_CERTS }}
    CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTS_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}

- name: Build distributables (Windows)
  if: runner.os == 'Windows'
  run: npx electron-builder --win --publish never
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    # Use Azure Trusted Signing (Option A) or legacy CSC_LINK (Option B)
    AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
    AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
    AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
    AZURE_ENDPOINT: ${{ secrets.AZURE_ENDPOINT }}
    AZURE_CODE_SIGNING_ACCOUNT: ${{ secrets.AZURE_CODE_SIGNING_ACCOUNT }}
    AZURE_CERT_PROFILE: ${{ secrets.AZURE_CERT_PROFILE }}
```

> When secrets are not configured, electron-builder gracefully skips signing. This means
> Phase 1 (unsigned builds) works out of the box, and signing is activated by simply adding
> the secrets — no workflow changes needed.

---

## Implementation Checklist

### Phase 1: Core Binary Build

- [ ] Update `package.json` → `build.mac.target` with explicit dmg + arch
- [ ] Update `package.json` → `build.dmg` section
- [ ] Update `package.json` → `build.nsis.artifactName` and `build.portable.artifactName`
- [ ] Simplify `dist` npm script (remove hdiutil)
- [ ] Simplify `dist:win` npm script (remove --dir)
- [ ] Rewrite `.github/workflows/release.yml` with build matrix
- [ ] Add artifact upload/download steps
- [ ] Update release job to attach artifacts
- [ ] Test workflow on a feature branch

### Phase 2: Code Signing

- [ ] (Maintainer) Obtain Apple Developer certificate
- [ ] (Maintainer) Create app-specific password for notarization
- [ ] (Maintainer) Add macOS secrets to GitHub repo
- [ ] Add macOS signing env vars to workflow
- [ ] Update `package.json` with `hardenedRuntime` and `notarize: true`
- [ ] (Maintainer) Obtain Windows code signing certificate (see options in 2.2)
- [ ] (Maintainer) Add Windows secrets to GitHub repo
- [ ] Add Windows signing env vars to workflow
- [ ] Update `package.json` with Windows signing config
- [ ] Test signed builds

---

## Notes

### Native Dependencies Handling

| Dependency        | Behavior                                                           | CI Handling                                                     |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `@github/copilot` | Optional deps per platform; only installs matching platform binary | `npm ci` on each platform handles this                          |
| `node-pty`        | Native C++ module                                                  | Rebuilt via `@electron/rebuild` on each platform                |
| `ffmpeg-static`   | Downloads platform binary on install                               | Explicitly run `install.js` after `npm ci --ignore-scripts`     |
| `vosk-koffi`      | Downloads platform native libs on postinstall                      | Explicitly run `postinstall.js` after `npm ci --ignore-scripts` |
| `whisper-cpp`     | Pre-built binary checked into `public/whisper-cpp/`                | Included via `files` glob — must be present in repo             |
| `whisper-model`   | Model files checked into `public/whisper-model/`                   | Included via `files` glob — must be present in repo             |

### Why No Linux Builds

Linux binaries are out of scope for this plan because:

1. The app relies on macOS-specific features (`whisper-cpp` arm64 binary, `hdiutil`-based workflows)
2. Linux distribution is fragmented (`.deb`, `.rpm`, `.AppImage`, Snap, Flatpak) — each requires its own packaging and testing
3. No current user demand has been identified

This can be revisited in a future phase if there is demand.

### Why No Cross-Compilation

Cross-compilation is not viable because:

1. `node-pty` requires platform-native compilation
2. `@github/copilot` optional dependencies only install the current platform's binary
3. `ffmpeg-static` downloads platform-specific binaries at install time

Each platform must build on its native GitHub Actions runner.

### Cost Considerations

- **macOS signing**: Apple Developer Program ($99/year)
- **Windows signing**: Azure Trusted Signing (pay-as-you-go, ~$10/month) or SSL.com eSigner (~$200-400/year)
- **GitHub Actions**: Free for public repos; private repos have minute limits (macOS runners use 10x minutes)

### CI Performance

- **Electron download cache**: The `actions/setup-node` `cache: npm` setting caches `node_modules`,
  but the Electron binary itself is downloaded to `~/.cache/electron`. Consider adding an explicit
  cache step for `~/.cache/electron` if build times are slow.
- **Expected artifact sizes**: DMG ~150-250MB, NSIS installer ~150-250MB, Portable ~150-250MB
  (varies based on bundled native dependencies like whisper models and ffmpeg).
- **Artifact retention**: Set to 5 days — artifacts are only needed until the release job
  downloads them. Increase if debugging failed releases requires keeping artifacts longer.
