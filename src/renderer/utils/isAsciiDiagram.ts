/**
 * Detects if content appears to be an ASCII art diagram.
 *
 * ASCII diagrams typically contain Unicode box-drawing characters (U+2500–U+257F)
 * or classic ASCII art patterns like +---+ boxes.
 *
 * @param content - The text content to analyze
 * @returns true if the content appears to be an ASCII diagram
 */
export function isAsciiDiagram(content: string): boolean {
  // Handle edge cases
  if (!content || typeof content !== 'string') {
    return false;
  }

  // Unicode box-drawing characters range: U+2500 to U+257F
  // This includes: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬ etc.
  const boxDrawingRegex = /[\u2500-\u257F]/g;

  // Classic ASCII art patterns (+ - | corners and lines)
  // Matches patterns like +---+, |   |, +===+
  const classicAsciiRegex = /\+[-=]+\+|\|.+\|/g;

  // Arrow characters commonly used in diagrams
  const arrowChars = /[▼▲◀▶→←↑↓↔↕⇒⇐⇑⇓]/g;

  // Count box-drawing characters
  const boxMatches = content.match(boxDrawingRegex);
  const boxCount = boxMatches ? boxMatches.length : 0;

  // Count classic ASCII art patterns
  const classicMatches = content.match(classicAsciiRegex);
  const classicCount = classicMatches ? classicMatches.length : 0;

  // Count arrow characters
  const arrowMatches = content.match(arrowChars);
  const arrowCount = arrowMatches ? arrowMatches.length : 0;

  // Threshold: require at least 3 box-drawing characters OR
  // at least 2 classic ASCII patterns OR
  // combination of box chars + arrows that suggests a diagram
  const isBoxDiagram = boxCount >= 3;
  const isClassicDiagram = classicCount >= 2;
  const isMixedDiagram = boxCount >= 2 && arrowCount >= 1;

  return isBoxDiagram || isClassicDiagram || isMixedDiagram;
}

/**
 * Extracts text content from React children.
 * Handles strings, numbers, and nested arrays.
 *
 * @param children - React children (can be string, number, array, or React elements)
 * @returns The extracted text content as a string
 */
export function extractTextContent(children: unknown): string {
  if (typeof children === 'string') {
    return children;
  }

  if (typeof children === 'number') {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map(extractTextContent).join('');
  }

  // For React elements or other objects, try to get their children
  if (children && typeof children === 'object' && 'props' in children) {
    const element = children as { props?: { children?: unknown } };
    if (element.props?.children) {
      return extractTextContent(element.props.children);
    }
  }

  return '';
}
