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
}

export const TerminalOutputShrinkModal: React.FC<TerminalOutputShrinkModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  output,
  lineCount,
}) => {
  const [truncateEnabled, setTruncateEnabled] = useState(true);
  const [truncateLines, setTruncateLines] = useState(DEFAULT_LAST_LINES_COUNT);
  const [smartCompressEnabled, setSmartCompressEnabled] = useState(true);

  const processedOutput = useMemo(() => {
    return compressOutput(output, {
      truncateLines: truncateEnabled ? truncateLines : null,
      smartCompress: smartCompressEnabled,
    });
  }, [output, truncateEnabled, truncateLines, smartCompressEnabled]);

  const processedLineCount = useMemo(() => countLines(processedOutput), [processedOutput]);

  const handleConfirm = useCallback(() => {
    onConfirm(processedOutput, processedLineCount);
    onClose();
  }, [processedOutput, processedLineCount, onConfirm, onClose]);

  const handleSendOriginal = useCallback(() => {
    onConfirm(output, lineCount);
    onClose();
  }, [output, lineCount, onConfirm, onClose]);

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
      <Modal.Body data-clarity-mask="true">
        <div className="space-y-3">
          <p className="text-sm text-copilot-text-muted">
            The terminal output is{' '}
            <span className="text-copilot-accent font-medium">{lineCount} lines</span>. To save
            context, you can compress it before sending to the agent.
          </p>

          {/* Truncate option */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={truncateEnabled}
              onChange={(e) => setTruncateEnabled(e.target.checked)}
              className="w-4 h-4 accent-copilot-accent"
            />
            <span className="text-sm text-copilot-text">Keep only last</span>
            <input
              type="number"
              value={truncateLines}
              onChange={(e) => setTruncateLines(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={!truncateEnabled}
              className="w-16 px-2 py-0.5 text-sm rounded border border-copilot-border bg-copilot-bg text-copilot-text disabled:opacity-50 focus:border-copilot-accent focus:outline-none"
              min="1"
            />
            <span className="text-sm text-copilot-text">lines</span>
          </label>

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
        <Button variant="ghost" onClick={handleSendOriginal}>
          Send Original
        </Button>
        <Button variant="primary" onClick={handleConfirm}>
          Send Compressed
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default TerminalOutputShrinkModal;
