import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ActiveTool } from '../../types/session';
import { formatToolOutput } from '../../utils/session';

interface ToolActivitySectionProps {
  tools: ActiveTool[];
  isLive?: boolean; // True when message is still streaming
}

type GroupedTool = { tool: ActiveTool; count: number };

const getDescription = (tool: ActiveTool): string => {
  const input = tool.input || {};
  const rawPath = input.path;
  // Handle path as string or array (MCP tools can pass arrays)
  const path = Array.isArray(rawPath) ? rawPath.join(', ') : (rawPath as string | undefined);
  const shortPath = path && typeof path === 'string' ? path.split('/').slice(-2).join('/') : '';

  if (tool.toolName === 'grep') {
    const pattern = (input.pattern as string) || '';
    return pattern ? `"${pattern}"` : '';
  }

  if (tool.toolName === 'glob') {
    return (input.pattern as string) || '';
  }

  if (tool.toolName === 'view') {
    return shortPath || path || '';
  }

  if (tool.toolName === 'edit' || tool.toolName === 'create') {
    return shortPath || path || '';
  }

  if (tool.toolName === 'bash') {
    const desc = (input.description as string) || '';
    const cmd = ((input.command as string) || '').slice(0, 40);
    return desc || (cmd ? `$ ${cmd}...` : '');
  }

  if (tool.toolName === 'read_bash' || tool.toolName === 'write_bash') {
    return 'session';
  }

  if (tool.toolName === 'web_fetch') {
    return ((input.url as string) || '').slice(0, 30);
  }

  return '';
};

const getGroupKey = (tool: ActiveTool): string => {
  const input = tool.input || {};
  const description = getDescription(tool);
  const summary = tool.status === 'done' ? formatToolOutput(tool.toolName, input, tool.output) : '';
  let key = `${tool.toolName}|${description}|${summary}`;

  // For edits, include first-line diff so unrelated edits don't collapse.
  if (tool.toolName === 'edit' && tool.status === 'done' && input.old_str) {
    const oldLine = String(input.old_str).split('\n')[0];
    const newLine = input.new_str !== undefined ? String(input.new_str).split('\n')[0] : '';
    key += `|${oldLine}|${newLine}`;
  }

  return key;
};

const groupTools = (tools: ActiveTool[]): GroupedTool[] => {
  const groups: GroupedTool[] = [];
  const groupMap = new Map<string, GroupedTool>();

  for (const tool of tools) {
    if (tool.status !== 'done') {
      groups.push({ tool, count: 1 });
      continue;
    }

    const key = getGroupKey(tool);
    const existing = groupMap.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    const entry = { tool, count: 1 };
    groupMap.set(key, entry);
    groups.push(entry);
  }

  return groups;
};

const getSummaryText = (tools: ActiveTool[]): string => {
  const running = tools.filter((t) => t.status === 'running').length;
  const done = tools.filter((t) => t.status === 'done').length;

  // Get unique tool names for summary
  const toolNames = [...new Set(tools.map((t) => t.toolName))];
  const toolsPreview = toolNames.slice(0, 3).join(', ');
  const moreCount = toolNames.length - 3;

  let summary = `${tools.length} operation${tools.length !== 1 ? 's' : ''}`;
  if (toolsPreview) {
    summary += ` (${toolsPreview}${moreCount > 0 ? `, +${moreCount}` : ''})`;
  }

  if (running > 0) {
    summary = `${running} running, ${done} done`;
  }

  return summary;
};

export function ToolActivitySection({ tools, isLive }: ToolActivitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(isLive || false);

  if (!tools || tools.length === 0) {
    return null;
  }

  const groups = groupTools(tools);
  const hasRunning = tools.some((t) => t.status === 'running');

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
        ) : (
          <span className="text-copilot-success">✓</span>
        )}
        <span>{getSummaryText(tools)}</span>
      </button>

      {/* Expanded tool list */}
      {isExpanded && (
        <div className="mt-1 ml-3 pl-2 border-l border-copilot-border">
          {groups.map(({ tool, count }) => {
            const input = tool.input || {};
            const isEdit = tool.toolName === 'edit';
            const description = getDescription(tool);

            return (
              <div key={`${tool.toolCallId}-g`} className="py-0.5">
                <div className="flex items-start gap-1.5 text-xs">
                  {tool.status === 'running' ? (
                    <span className="text-copilot-warning shrink-0">○</span>
                  ) : (
                    <span className="text-copilot-success shrink-0">✓</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-medium ${tool.status === 'done' ? 'text-copilot-text' : 'text-copilot-text-muted'}`}
                      >
                        {tool.toolName.charAt(0).toUpperCase() + tool.toolName.slice(1)}
                      </span>
                      {tool.serverName && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-copilot-accent/10 text-copilot-accent">
                          {tool.serverName}
                        </span>
                      )}
                      {tool.status === 'done' && count > 1 && (
                        <span className="text-[10px] text-copilot-text-muted">×{count}</span>
                      )}
                      {description && (
                        <span className="text-copilot-text-muted font-mono text-[10px] truncate">
                          {description}
                        </span>
                      )}
                    </div>
                    {tool.status === 'done' && (
                      <div className="text-copilot-text-muted text-[10px]">
                        {formatToolOutput(tool.toolName, input, tool.output)}
                      </div>
                    )}
                    {/* Rich output for MCP server tools */}
                    {tool.status === 'done' &&
                      tool.serverName &&
                      tool.output &&
                      (() => {
                        const raw =
                          typeof tool.output === 'string'
                            ? tool.output
                            : typeof tool.output === 'object' &&
                                (tool.output as Record<string, unknown>)?.output
                              ? String((tool.output as Record<string, unknown>).output)
                              : null;
                        if (!raw || raw.length < 20) return null;
                        return (
                          <div className="mt-1 text-[11px] text-copilot-text bg-copilot-surface rounded p-2 max-h-40 overflow-y-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {raw.slice(0, 2000)}
                            </ReactMarkdown>
                          </div>
                        );
                      })()}
                    {isEdit && tool.status === 'done' && !!input.old_str && (
                      <div className="mt-0.5 text-[10px] font-mono pl-2 border-l border-copilot-border">
                        <div className="text-copilot-error truncate">
                          − {(input.old_str as string).split('\n')[0].slice(0, 35)}
                        </div>
                        {input.new_str !== undefined && (
                          <div className="text-copilot-success truncate">
                            + {(input.new_str as string).split('\n')[0].slice(0, 35)}
                          </div>
                        )}
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
