#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const now = new Date()
const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 12) // YYYYMMDDHHMM

// Get git info
const gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()

// Read package.json
const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

// Extract base version (e.g., 1.0.0 from 1.0.0+whatever)
const baseVersion = pkg.version.split('+')[0].split('-')[0]
const newVersion = `${baseVersion}+${timestamp}`

// Update package.json version
pkg.version = newVersion
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

// Create build-info.json in src/renderer
const buildInfo = {
  version: newVersion,
  baseVersion,
  buildTimestamp: now.toISOString(),
  buildDate: now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
  buildTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  gitSha,
  gitBranch
}

const buildInfoPath = path.join(__dirname, '..', 'src', 'renderer', 'build-info.json')
fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2) + '\n')

console.log(`✓ Version updated to: ${newVersion}`)
console.log(`✓ Build info written to: src/renderer/build-info.json`)
console.log(`  - Branch: ${gitBranch}`)
console.log(`  - Commit: ${gitSha}`)
