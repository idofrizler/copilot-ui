import React, { useState, useMemo, useCallback } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import {
  compressOutput,
  countLines,
  DEFAULT_LAST_LINES_COUNT,
} from '../../utils/cliOutputCompression';

export interface TerminalOutputShrinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (output: string, lineCount: number) => void;
  output: string;
  lineCount: number;
  lastCommandStart?: number; // Line number where the last command started
}

export const TerminalOutputShrinkModal: React.FC<TerminalOutputShrinkModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  output,
  lineCount,
  lastCommandStart,
}) => {
  // Truncation mode: 'none' | 'lastRun' | 'lastLines'
  const [truncationMode, setTruncationMode] = useState<'none' | 'lastRun' | 'lastLines'>('lastRun');
  const [truncateLines, setTruncateLines] = useState(DEFAULT_LAST_LINES_COUNT);
  const [smartCompressEnabled, setSmartCompressEnabled] = useState(true);

  // Extract last command run using the recorded line number
  const extractLastRunFromLine = useCallback((text: string, startLine: number): string => {
    const lines = text.split('\n');
    if (startLine >= 0 && startLine < lines.length) {
      // Return from the command line to the end
      let endLine = lines.length;

      // Exclude trailing empty lines
      while (endLine > startLine && lines[endLine - 1].trim() === '') {
        endLine--;
      }

      return lines.slice(startLine, endLine).join('\n');
    }
    return text;
  }, []);

  const processedOutput = useMemo(() => {
    let result = output;

    // Apply truncation based on mode
    if (truncationMode === 'lastRun' && lastCommandStart !== undefined) {
      result = extractLastRunFromLine(result, lastCommandStart);
    }

    // Then apply compression options
    return compressOutput(result, {
      truncateLines: truncationMode === 'lastLines' ? truncateLines : null,
      smartCompress: smartCompressEnabled,
    });
  }, [
    output,
    truncationMode,
    truncateLines,
    smartCompressEnabled,
    lastCommandStart,
    extractLastRunFromLine,
  ]);

  const processedLineCount = useMemo(() => countLines(processedOutput), [processedOutput]);

  const handleConfirm = useCallback(() => {
    onConfirm(processedOutput, processedLineCount);
    onClose();
  }, [processedOutput, processedLineCount, onConfirm, onClose]);

  // Calculate reduction percentage
  const reductionPercent = Math.round((1 - processedOutput.length / output.length) * 100);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Shrink Terminal Output"
      width="450px"
      testId="terminal-shrink-modal"
    >
      <Modal.Body>
        <div className="space-y-3">
          <p className="text-sm text-copilot-text-muted">
            The terminal output is{' '}
            <span className="text-copilot-accent font-medium">{lineCount} lines</span>. To save
            context, you can compress it before sending to the agent.
          </p>

          {/* Truncation options - radio group */}
          <div className="space-y-2">
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="truncation"
                  checked={truncationMode === 'lastRun'}
                  onChange={() => setTruncationMode('lastRun')}
                  className="w-4 h-4 accent-copilot-accent"
                />
                <span className="text-sm text-copilot-text">Last command only</span>
              </label>
              <p className="text-xs text-copilot-text-muted ml-6 mt-1">
                Extract only the output from the most recent command
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="truncation"
                checked={truncationMode === 'lastLines'}
                onChange={() => setTruncationMode('lastLines')}
                className="w-4 h-4 accent-copilot-accent"
              />
              <span className="text-sm text-copilot-text">Keep only last</span>
              <input
                type="number"
                value={truncateLines}
                onChange={(e) => setTruncateLines(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={truncationMode !== 'lastLines'}
                className="w-16 px-2 py-0.5 text-sm rounded border border-copilot-border bg-copilot-bg text-copilot-text disabled:opacity-50 focus:border-copilot-accent focus:outline-none"
                min="1"
              />
              <span className="text-sm text-copilot-text">lines</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="truncation"
                checked={truncationMode === 'none'}
                onChange={() => setTruncationMode('none')}
                className="w-4 h-4 accent-copilot-accent"
              />
              <span className="text-sm text-copilot-text">Keep all output</span>
            </label>
          </div>

          {/* Divider */}
          <div className="border-t border-copilot-border" />

          {/* Smart compression option */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={smartCompressEnabled}
                onChange={(e) => setSmartCompressEnabled(e.target.checked)}
                className="w-4 h-4 accent-copilot-accent"
              />
              <span className="text-sm text-copilot-text">Smart compression</span>
            </label>
            <p className="text-xs text-copilot-text-muted ml-6 mt-1">
              Replaces long strings (base64, hashes) with placeholders
            </p>
          </div>

          {/* Preview stats */}
          <div className="p-3 rounded bg-copilot-bg border border-copilot-border">
            <div className="flex justify-between text-xs">
              <span className="text-copilot-text-muted">Original:</span>
              <span className="text-copilot-text">
                {lineCount} lines, {output.length.toLocaleString()} chars
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-copilot-text-muted">Compressed:</span>
              <span className="text-copilot-accent font-medium">
                {processedLineCount} lines, {processedOutput.length.toLocaleString()} chars
                {reductionPercent > 0 && (
                  <span className="text-copilot-success ml-1">(-{reductionPercent}%)</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer className="p-4 border-t border-copilot-border">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleConfirm}>
          Send
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TerminalOutputShrinkModal;
