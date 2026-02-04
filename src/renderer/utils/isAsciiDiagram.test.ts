import { describe, it, expect } from 'vitest';
import { isAsciiDiagram, extractTextContent } from './isAsciiDiagram';

describe('isAsciiDiagram', () => {
  describe('Unicode box-drawing characters', () => {
    it('returns true for content with multiple box-drawing characters', () => {
      const diagram = `
┌─────────────┐
│  Hello      │
└─────────────┘
`;
      expect(isAsciiDiagram(diagram)).toBe(true);
    });

    it('returns true for complex diagrams with corners and lines', () => {
      const diagram = `
┌──────────────────────────────────────────────┐
│ SESSION LIFECYCLE                            │
├──────────────────────────────────────────────┤
│ 1. SESSION START                             │
│ ├─ Generate session ID                       │
│ └─ npm install                               │
└──────────────────────────────────────────────┘
`;
      expect(isAsciiDiagram(diagram)).toBe(true);
    });

    it('returns true for nested boxes', () => {
      const diagram = `
┌────────────────────────┐
│ ┌──────────────────┐   │
│ │ Inner box        │   │
│ └──────────────────┘   │
└────────────────────────┘
`;
      expect(isAsciiDiagram(diagram)).toBe(true);
    });

    it('returns true for double-line box characters', () => {
      const diagram = `
╔═══════════════╗
║   Title       ║
╚═══════════════╝
`;
      expect(isAsciiDiagram(diagram)).toBe(true);
    });
  });

  describe('Classic ASCII art patterns', () => {
    it('returns true for +---+ style boxes', () => {
      const diagram = `
+---------------+
|  Hello World  |
+---------------+
`;
      expect(isAsciiDiagram(diagram)).toBe(true);
    });

    it('returns true for +===+ style boxes', () => {
      const diagram = `
+===============+
|  Title        |
+===============+
`;
      expect(isAsciiDiagram(diagram)).toBe(true);
    });
  });

  describe('Mixed diagrams with arrows', () => {
    it('returns true for diagrams with box chars and arrows', () => {
      const diagram = `
┌─────┐
│ Box │
└──┬──┘
   ▼
`;
      expect(isAsciiDiagram(diagram)).toBe(true);
    });
  });

  describe('Edge cases and false positives', () => {
    it('returns false for empty content', () => {
      expect(isAsciiDiagram('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isAsciiDiagram(null as unknown as string)).toBe(false);
      expect(isAsciiDiagram(undefined as unknown as string)).toBe(false);
    });

    it('returns false for regular JavaScript code', () => {
      const code = `
function hello() {
  const x = 1;
  if (x > 0) {
    console.log("Hello");
  }
  return x;
}
`;
      expect(isAsciiDiagram(code)).toBe(false);
    });

    it('returns false for Python code', () => {
      const code = `
def hello():
    x = 1
    if x > 0:
        print("Hello")
    return x
`;
      expect(isAsciiDiagram(code)).toBe(false);
    });

    it('returns false for single box character (below threshold)', () => {
      expect(isAsciiDiagram('│')).toBe(false);
      expect(isAsciiDiagram('─')).toBe(false);
    });

    it('returns false for two box characters (below threshold)', () => {
      expect(isAsciiDiagram('│ │')).toBe(false);
    });

    it('returns false for regular text with pipes', () => {
      const text = 'Use the | operator for OR';
      expect(isAsciiDiagram(text)).toBe(false);
    });

    it('returns true for markdown tables (has classic ASCII patterns)', () => {
      // Markdown tables use | characters which match our classic ASCII pattern
      // This is acceptable - tables also benefit from the ASCII diagram styling
      const table = `
| Name | Age |
| John | 30  |
`;
      expect(isAsciiDiagram(table)).toBe(true);
    });
  });

  describe('threshold behavior', () => {
    it('returns true when exactly at threshold (3 box chars)', () => {
      expect(isAsciiDiagram('┌─┐')).toBe(true);
    });

    it('returns false when below threshold', () => {
      expect(isAsciiDiagram('┌─')).toBe(false);
    });
  });
});

describe('extractTextContent', () => {
  it('returns string as-is', () => {
    expect(extractTextContent('hello')).toBe('hello');
  });

  it('converts number to string', () => {
    expect(extractTextContent(42)).toBe('42');
  });

  it('joins array elements', () => {
    expect(extractTextContent(['hello', ' ', 'world'])).toBe('hello world');
  });

  it('handles nested arrays', () => {
    expect(extractTextContent(['a', ['b', 'c'], 'd'])).toBe('abcd');
  });

  it('returns empty string for null/undefined', () => {
    expect(extractTextContent(null)).toBe('');
    expect(extractTextContent(undefined)).toBe('');
  });

  it('extracts text from React-like element structure', () => {
    const element = {
      props: {
        children: 'hello',
      },
    };
    expect(extractTextContent(element)).toBe('hello');
  });

  it('handles empty objects', () => {
    expect(extractTextContent({})).toBe('');
  });
});
