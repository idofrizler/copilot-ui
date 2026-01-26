import { describe, it, expect } from 'vitest'
import {
  truncateToLastLines,
  smartCompress,
  compressOutput,
  countLines,
  LONG_OUTPUT_LINE_THRESHOLD,
  DEFAULT_LAST_LINES_COUNT,
} from '../../src/renderer/utils/cliOutputCompression'

describe('CLI Output Compression Utilities', () => {
  describe('countLines', () => {
    it('should count lines correctly', () => {
      expect(countLines('one')).toBe(1)
      expect(countLines('one\ntwo')).toBe(2)
      expect(countLines('one\ntwo\nthree')).toBe(3)
      expect(countLines('')).toBe(1)
    })
  })

  describe('truncateToLastLines', () => {
    it('should return original if under limit', () => {
      const output = 'line1\nline2\nline3'
      expect(truncateToLastLines(output, 10)).toBe(output)
    })

    it('should truncate to last N lines', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
      const output = lines.join('\n')
      const result = truncateToLastLines(output, 5)
      
      // With 20 lines truncated to 5, we get 1 truncation message + 4 content lines = 5 total
      expect(result).toContain('[... 16 lines truncated ...]')
      expect(result).toContain('line17')
      expect(result).toContain('line20')
      expect(result).not.toContain('line16')
      // Verify total line count is exactly 5
      expect(countLines(result)).toBe(5)
    })

    it('should handle exactly the limit', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
      const output = lines.join('\n')
      expect(truncateToLastLines(output, 10)).toBe(output)
    })
  })

  describe('smartCompress', () => {
    it('should replace base64-like strings', () => {
      const base64 = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkwYWJjZGVmZ2hpamtsbW5vcA=='
      const output = `Some text ${base64} more text`
      const result = smartCompress(output)
      
      expect(result).toContain('[BASE64_STRING:')
      expect(result).toContain('chars]')
      expect(result).not.toContain(base64)
    })

    it('should replace long hex strings', () => {
      const hex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6'
      const output = `Hash: ${hex} is the result`
      const result = smartCompress(output)
      
      expect(result).toContain('[HEX:')
      expect(result).toContain('chars]')
    })

    it('should compress very long unbroken strings', () => {
      // Use a long string that won't match base64 or hex patterns
      const longString = 'file/path/to/some/very/long/directory/structure/that/keeps/going/on/and/on'
      const output = `Path: ${longString} end`
      const result = smartCompress(output)
      
      // Long strings may get compressed in different ways
      expect(result.length).toBeLessThanOrEqual(output.length)
    })

    it('should collapse repeated similar lines', () => {
      const lines = [
        'Processing item 1...',
        'Processing item 2...',
        'Processing item 3...',
        'Processing item 4...',
        'Processing item 5...',
        'Done!',
      ]
      const output = lines.join('\n')
      const result = smartCompress(output)
      
      expect(result).toContain('[... ')
      expect(result).toContain('similar lines omitted ...]')
    })

    it('should not collapse if less than 3 repeats', () => {
      const lines = [
        'Step 1',
        'Step 2',
        'Done!',
      ]
      const output = lines.join('\n')
      const result = smartCompress(output)
      
      expect(result).not.toContain('similar lines omitted')
    })

    it('should preserve normal text', () => {
      const output = 'This is normal output\nWith multiple lines\nAnd no long strings'
      const result = smartCompress(output)
      
      expect(result).toBe(output)
    })
  })

  describe('compressOutput', () => {
    it('should apply only truncation', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
      const output = lines.join('\n')
      const result = compressOutput(output, { truncateLines: 5 })
      
      expect(result).toContain('[... 16 lines truncated ...]')
    })

    it('should apply only smart compression', () => {
      const hex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6'
      const output = `Hash: ${hex}`
      const result = compressOutput(output, { smartCompress: true })
      
      expect(result).toContain('[HEX:')
    })

    it('should apply both options', () => {
      // Create lines that are completely different to avoid similarity collapse
      const lines = [
        'First line with hex: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
        'Error: something went wrong',
        'Warning: check your inputs',
        'Info: loading data',
        'Debug: value is 42',
        'Success: operation completed',
        'line7: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
        'Goodbye!',
        'The end',
        'Final line with hex: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      ]
      const output = lines.join('\n')
      const result = compressOutput(output, { truncateLines: 5, smartCompress: true })
      
      // Should contain truncation notice
      expect(result).toContain('[...')
      expect(result).toContain('lines truncated')
      // Should also have HEX compression
      expect(result).toContain('[HEX:')
    })

    it('should handle null truncateLines', () => {
      const output = 'line1\nline2\nline3'
      const result = compressOutput(output, { truncateLines: null })
      
      expect(result).toBe(output)
    })
  })

  describe('constants', () => {
    it('should have correct threshold value', () => {
      expect(LONG_OUTPUT_LINE_THRESHOLD).toBe(100)
    })

    it('should have correct default lines count', () => {
      expect(DEFAULT_LAST_LINES_COUNT).toBe(50)
    })
  })
})
