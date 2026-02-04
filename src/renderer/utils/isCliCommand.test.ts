import { describe, it, expect } from 'vitest'
import { isCliCommand, hasCliLanguageClass, looksLikeCliCommand } from './isCliCommand'

describe('isCliCommand utility', () => {
  describe('hasCliLanguageClass', () => {
    it('returns true for bash language class', () => {
      expect(hasCliLanguageClass('language-bash')).toBe(true)
    })

    it('returns true for sh language class', () => {
      expect(hasCliLanguageClass('language-sh')).toBe(true)
    })

    it('returns true for shell language class', () => {
      expect(hasCliLanguageClass('language-shell')).toBe(true)
    })

    it('returns true for zsh language class', () => {
      expect(hasCliLanguageClass('language-zsh')).toBe(true)
    })

    it('returns true for console language class', () => {
      expect(hasCliLanguageClass('language-console')).toBe(true)
    })

    it('returns true for terminal language class', () => {
      expect(hasCliLanguageClass('language-terminal')).toBe(true)
    })

    it('returns false for javascript language class', () => {
      expect(hasCliLanguageClass('language-javascript')).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(hasCliLanguageClass(undefined)).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(hasCliLanguageClass('')).toBe(false)
    })
  })

  describe('looksLikeCliCommand', () => {
    it('returns true for npm commands', () => {
      expect(looksLikeCliCommand('npm install')).toBe(true)
      expect(looksLikeCliCommand('npm run build')).toBe(true)
      expect(looksLikeCliCommand('npm test')).toBe(true)
    })

    it('returns true for yarn commands', () => {
      expect(looksLikeCliCommand('yarn add react')).toBe(true)
      expect(looksLikeCliCommand('yarn install')).toBe(true)
    })

    it('returns true for git commands', () => {
      expect(looksLikeCliCommand('git status')).toBe(true)
      expect(looksLikeCliCommand('git commit -m "test"')).toBe(true)
      expect(looksLikeCliCommand('git push origin main')).toBe(true)
    })

    it('returns true for docker commands', () => {
      expect(looksLikeCliCommand('docker build -t myapp .')).toBe(true)
      expect(looksLikeCliCommand('docker run -p 3000:3000 myapp')).toBe(true)
    })

    it('returns true for commands with pipes', () => {
      expect(looksLikeCliCommand('cat file.txt | grep hello')).toBe(true)
    })

    it('returns true for commands with redirects', () => {
      expect(looksLikeCliCommand('echo "hello" > file.txt')).toBe(true)
    })

    it('returns true for commands with env vars', () => {
      expect(looksLikeCliCommand('NODE_ENV=production npm start')).toBe(true)
    })

    it('returns true for executable paths', () => {
      expect(looksLikeCliCommand('./script.sh')).toBe(true)
      expect(looksLikeCliCommand('/usr/bin/node app.js')).toBe(true)
    })

    it('returns false for JavaScript code', () => {
      expect(looksLikeCliCommand('const x = 1')).toBe(false)
      expect(looksLikeCliCommand('let name = "test"')).toBe(false)
      expect(looksLikeCliCommand('function hello() {}')).toBe(false)
      expect(looksLikeCliCommand('import React from "react"')).toBe(false)
      expect(looksLikeCliCommand('export default App')).toBe(false)
    })

    it('returns false for Python code', () => {
      expect(looksLikeCliCommand('def hello():')).toBe(false)
      expect(looksLikeCliCommand('class MyClass:')).toBe(false)
      expect(looksLikeCliCommand('from os import path')).toBe(false)
    })

    it('returns false for HTML/JSX', () => {
      expect(looksLikeCliCommand('<div>Hello</div>')).toBe(false)
      expect(looksLikeCliCommand('<Component prop="value" />')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(looksLikeCliCommand('')).toBe(false)
    })

    it('returns false for very long content', () => {
      const longContent = 'x'.repeat(600)
      expect(looksLikeCliCommand(longContent)).toBe(false)
    })

    it('handles multi-line CLI commands', () => {
      expect(looksLikeCliCommand('npm install\nnpm run build')).toBe(true)
      expect(looksLikeCliCommand('git add .\ngit commit -m "test"')).toBe(true)
    })

    it('returns false for multi-line code', () => {
      expect(looksLikeCliCommand('const x = 1\nconst y = 2')).toBe(false)
    })
  })

  describe('isCliCommand', () => {
    it('returns true for bash language class regardless of content', () => {
      expect(isCliCommand('language-bash', 'anything')).toBe(true)
    })

    it('returns false for javascript language class even with CLI-like content', () => {
      expect(isCliCommand('language-javascript', 'npm install')).toBe(false)
    })

    it('uses heuristics when no language class is provided', () => {
      expect(isCliCommand(undefined, 'npm install')).toBe(true)
      expect(isCliCommand(undefined, 'const x = 1')).toBe(false)
    })

    it('returns false when no language and no content', () => {
      expect(isCliCommand(undefined, undefined)).toBe(false)
      expect(isCliCommand(undefined, '')).toBe(false)
    })

    it('handles common CLI scenarios', () => {
      // Package manager commands
      expect(isCliCommand(undefined, 'pnpm add typescript')).toBe(true)
      expect(isCliCommand(undefined, 'bun install')).toBe(true)
      
      // Build tools
      expect(isCliCommand(undefined, 'make build')).toBe(true)
      expect(isCliCommand(undefined, 'cargo build --release')).toBe(true)
      
      // Cloud tools
      expect(isCliCommand(undefined, 'aws s3 ls')).toBe(true)
      expect(isCliCommand(undefined, 'kubectl get pods')).toBe(true)
    })
  })
})
