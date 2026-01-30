#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const now = new Date()
const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 12) // YYYYMMDDHHMM

// Get git info
const gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()

// Read package.json (for base version only, don't modify it)
const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

// Extract base version (e.g., 1.0.0 from 1.0.0+whatever)
const baseVersion = pkg.version.split('+')[0].split('-')[0]
const newVersion = `${baseVersion}+${timestamp}`

// Read release notes for the current version
const releaseNotesPath = path.join(__dirname, '..', 'RELEASE_NOTES.md')
let releaseNotes = ''
try {
  if (fs.existsSync(releaseNotesPath)) {
    const content = fs.readFileSync(releaseNotesPath, 'utf8')
    // Extract notes for the current base version
    const versionRegex = new RegExp(`^## ${baseVersion.replace(/\./g, '\\.')}([\\s\\S]*?)(?=^## \\d+\\.\\d+\\.\\d+|$)`, 'm')
    const match = content.match(versionRegex)
    if (match) {
      releaseNotes = match[1].trim()
    }
  }
} catch (err) {
  console.warn('⚠ Could not read release notes:', err.message)
}

// Create build-info.json in src/renderer
const buildInfo = {
  version: newVersion,
  baseVersion,
  buildTimestamp: now.toISOString(),
  buildDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
  buildTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  gitSha,
  gitBranch,
  releaseNotes
}

const buildInfoPath = path.join(__dirname, '..', 'src', 'renderer', 'build-info.json')
fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n')

console.log(`✓ Version updated to: ${newVersion}`)
console.log(`✓ Build info written to: src/renderer/build-info.json`)
console.log(`  - Branch: ${gitBranch}`)
console.log(`  - Commit: ${gitSha}`)
if (releaseNotes) {
  console.log(`  - Release notes: included for v${baseVersion}`)
}
