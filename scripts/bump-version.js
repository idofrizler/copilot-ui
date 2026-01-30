#!/usr/bin/env node
/**
 * Version Bump Script
 * 
 * This script is used by the release workflow to bump the version in package.json.
 * It supports major, minor, and patch version bumps.
 * 
 * Usage:
 *   node scripts/bump-version.js patch   # 1.0.0 -> 1.0.1
 *   node scripts/bump-version.js minor   # 1.0.0 -> 1.1.0
 *   node scripts/bump-version.js major   # 1.0.0 -> 2.0.0
 */

const fs = require('fs')
const path = require('path')

const bumpType = process.argv[2] || 'minor'

if (!['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('Invalid bump type. Use: major, minor, or patch')
  process.exit(1)
}

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

// Extract base version (remove any build metadata)
const currentVersion = pkg.version.split('+')[0].split('-')[0]
const [major, minor, patch] = currentVersion.split('.').map(Number)

let newVersion
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`
    break
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`
    break
  case 'patch':
    newVersion = `${major}.${minor}.${patch + 1}`
    break
}

pkg.version = newVersion
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`✓ Version bumped: ${currentVersion} → ${newVersion}`)
