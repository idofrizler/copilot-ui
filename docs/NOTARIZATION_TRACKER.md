# Notarization Fix Tracker

## Current Status: Shipping unsigned/unnotarized builds first

Last updated: 2026-02-09

---

## Decision: Ship Without Notarization First

Notarization has been the primary blocker. Decision: skip it for now, get working builds out.

**What ships now:**

- macOS: Signed DMG (Developer ID cert, but NOT notarized — users right-click > Open first time)
- Windows: NSIS installer + portable .exe (unsigned — SmartScreen warning)

**Notarization deferred to follow-up.** Root cause identified (see below) but not yet fixed.

---

## Confirmed Facts

### Certificate

- **Type:** Developer ID Application: Ori Bar-ilan (LP7V4Q4SRT)
- **Hash:** 63BF8598E7B97A19948D5A4AD02A26087EC5E75B
- **Verdict:** Correct type.

### electron-builder Built-in Signing (@electron/osx-sign)

- **Hangs on CI.** Confirmed 3+ times.
- `apple-actions/import-codesign-certs@v3` keychain setup does NOT fix the hang.
- **Verdict:** Cannot use. Bypassed with custom `sign.js`.

### Custom sign.js (build/sign.js)

- Completes successfully on CI (~12s for 70+ binaries).
- Apple rejects notarization with "not signed with a valid Developer ID certificate."
- Needs investigation — possibly ad-hoc fallback, chain issue, or post-signing modification.

### Notarization Submissions

- 3 Invalid (cert/signature issues — failed fast)
- 13+ In Progress (zombied — stuck for hours, likely malformed binaries per Apple scanner)
- Pattern: Invalid = fails fast, In Progress = scanner hung

### Invalid Submission Log (bc805359)

- ALL 35 binaries rejected: "not signed with a valid Developer ID certificate"
- Systematic — every binary fails the same way
- Cert IS correct type, so issue is in signing process, not cert

---

## Current Pipeline

```
push to main/staging → validate → build (macOS + Windows) → release (GitHub Release)
```

### macOS Build

1. `apple-actions/import-codesign-certs@v3` — imports cert to keychain
2. Extract signing identity hash
3. `electron-builder --mac` with custom `sign.js` via `CSC_NAME`
4. Upload DMG artifact

### Windows Build

1. `electron-builder --win` — produces NSIS installer + portable
2. Upload .exe artifacts

### Release

- Creates GitHub Release with all artifacts
- Pre-release for `staging`, full release for `main`

---

## Follow-up: Notarization

When we return to notarization, investigate:

1. Add pre-submission `codesign --verify --strict` on every binary
2. Check `codesign -dvv` Authority chain — must show Developer ID CA, not ad-hoc
3. Possible: `sign.js` keychain access fails silently, codesign falls back to ad-hoc
4. Possible: electron-builder modifies app after `sign.js` runs, breaking seals
5. Research from user suggests: malformed Mach-O → hangs, cert issues → fails fast

---

## Files

| File                            | Purpose                                   |
| ------------------------------- | ----------------------------------------- |
| `.github/workflows/release.yml` | Release workflow (build + sign + release) |
| `build/sign.js`                 | Custom macOS code signing script          |
| `build/entitlements.mac.plist`  | macOS entitlements                        |
| `docs/NOTARIZATION_TRACKER.md`  | This file (not committed)                 |
