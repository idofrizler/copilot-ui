import { useState } from 'react';
import type { ActiveSubagent } from '../../types/session';

interface SubagentActivitySectionProps {
  subagents: ActiveSubagent[];
  isLive?: boolean; // True when message is still streaming
}

const formatDuration = (startTime: number, endTime?: number): string => {
  const duration = (endTime || Date.now()) - startTime;
  const seconds = duration / 1000;
  if (seconds < 1) return '<1s';
  return `${seconds.toFixed(1)}s`;
};

const getSummaryText = (subagents: ActiveSubagent[]): string => {
  const running = subagents.filter((s) => s.status === 'running').length;
  const completed = subagents.filter((s) => s.status === 'completed').length;
  const failed = subagents.filter((s) => s.status === 'failed').length;

  if (running > 0) {
    return `${running} subagent${running !== 1 ? 's' : ''} running`;
  }

  if (failed > 0) {
    return `${completed} completed, ${failed} failed`;
  }

  return `${subagents.length} subagent${subagents.length !== 1 ? 's' : ''} completed`;
};

export function SubagentActivitySection({ subagents, isLive }: SubagentActivitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(isLive || false);

  if (!subagents || subagents.length === 0) {
    return null;
  }

  const hasRunning = subagents.some((s) => s.status === 'running');
  const hasFailed = subagents.some((s) => s.status === 'failed');

  return (
    <div className="mb-2">
      {/* Collapsed header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-copilot-text-muted hover:text-copilot-text transition-colors w-full text-left"
      >
        <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▸</span>
        {hasRunning ? (
          <span className="text-copilot-warning">○</span>
        ) : hasFailed ? (
          <span className="text-copilot-error">✗</span>
        ) : (
          <span className="text-copilot-success">✓</span>
        )}
        <span className="font-medium">🤖</span>
        <span>{getSummaryText(subagents)}</span>
      </button>

      {/* Expanded subagent list */}
      {isExpanded && (
        <div className="mt-1 ml-3 pl-2 border-l border-copilot-border">
          {subagents.map((subagent) => {
            const isRunning = subagent.status === 'running';
            const isFailed = subagent.status === 'failed';
            const duration = formatDuration(subagent.startTime, subagent.endTime);

            return (
              <div key={subagent.toolCallId} className="py-0.5">
                <div className="flex items-start gap-1.5 text-xs">
                  {isRunning ? (
                    <span className="text-copilot-warning shrink-0">○</span>
                  ) : isFailed ? (
                    <span className="text-copilot-error shrink-0">✗</span>
                  ) : (
                    <span className="text-copilot-success shrink-0">✓</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-medium ${isFailed ? 'text-copilot-error' : isRunning ? 'text-copilot-text-muted' : 'text-copilot-text'}`}
                      >
                        {subagent.agentDisplayName}
                      </span>
                      {!isRunning && (
                        <span className="text-[10px] text-copilot-text-muted">{duration}</span>
                      )}
                    </div>
                    {subagent.agentDescription && isExpanded && (
                      <div className="text-copilot-text-muted text-[10px] mt-0.5">
                        {subagent.agentDescription}
                      </div>
                    )}
                    {isFailed && subagent.error && (
                      <div className="text-copilot-error text-[10px] mt-0.5">
                        Error: {subagent.error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
