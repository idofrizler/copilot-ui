import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ClockIcon, FileIcon, VolumeMuteIcon, CodeBlockWithCopy } from './';
import { ToolActivitySection } from '../features/chat';
import { SubagentActivitySection } from '../features/chat/SubagentActivitySection';
import { extractTextContent } from '../utils/isAsciiDiagram';
import { isAsciiDiagram } from '../utils/isAsciiDiagram';
import { isCliCommand } from '../utils/isCliCommand';
import { Message, ActiveTool, ImageAttachment, FileAttachment } from '../types';

interface MessageItemProps {
  message: Message;
  index: number;
  lastAssistantIndex: number;
  isVoiceSpeaking: boolean;
  activeTools?: ActiveTool[];
  activeSubagents?: any[];
  onStopSpeaking: () => void;
  onImageClick: (src: string, alt: string) => void;
}

export const MessageItem = memo<MessageItemProps>(
  ({
    message,
    index,
    lastAssistantIndex,
    isVoiceSpeaking,
    activeTools,
    activeSubagents,
    onStopSpeaking,
    onImageClick,
  }) => {
    return (
      <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
        <div
          className={`max-w-[85%] rounded-lg px-4 py-2.5 overflow-hidden relative ${
            message.role === 'user'
              ? message.isPendingInjection
                ? 'bg-copilot-warning text-white border border-dashed border-copilot-warning/50'
                : 'bg-copilot-success text-copilot-text-inverse'
              : 'bg-copilot-surface text-copilot-text'
          }`}
        >
          {/* Stop speaking overlay on last assistant message */}
          {message.role === 'assistant' && index === lastAssistantIndex && isVoiceSpeaking && (
            <button
              onClick={onStopSpeaking}
              className="absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-copilot-warning text-white rounded-md hover:bg-copilot-warning/80 transition-colors z-10"
              title="Stop reading aloud"
            >
              <VolumeMuteIcon size={12} />
              Stop
            </button>
          )}
          {/* Pending injection indicator */}
          {message.isPendingInjection && (
            <div className="flex items-center gap-1.5 text-[10px] opacity-80 mb-1.5">
              <ClockIcon size={10} />
              <span>Pending — will be read by agent</span>
            </div>
          )}
          <div className="text-sm break-words overflow-hidden">
            {message.role === 'user' ? (
              <>
                {/* User message images */}
                {message.imageAttachments && message.imageAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {message.imageAttachments.map((img) => (
                      <img
                        key={img.id}
                        src={img.previewUrl}
                        alt={img.name}
                        className="max-h-32 w-auto rounded border border-white/30 object-contain cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => onImageClick(img.previewUrl, img.name)}
                        title="Click to enlarge"
                      />
                    ))}
                  </div>
                )}
                {/* User message files */}
                {message.fileAttachments && message.fileAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {message.fileAttachments.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-black/20 rounded-lg"
                      >
                        <FileIcon size={16} className="opacity-60 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs truncate max-w-[150px]" title={file.name}>
                            {file.name}
                          </span>
                          <span className="text-[10px] opacity-50">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Render user message content - use ReactMarkdown if it contains code blocks */}
                {message.content.includes('```') ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={userMarkdownComponents}>
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{message.content}</span>
                )}
              </>
            ) : (
              <>
                {/* Tool Activity Section for assistant messages */}
                {(() => {
                  const isLive = message.isStreaming && message.content;
                  const toolsToShow = isLive ? activeTools : message.tools;
                  const subagentsToShow = isLive ? activeSubagents : message.subagents;
                  if (toolsToShow && toolsToShow.length > 0) {
                    return <ToolActivitySection tools={toolsToShow} isLive={!!isLive} />;
                  }
                  if (subagentsToShow && subagentsToShow.length > 0) {
                    return (
                      <SubagentActivitySection subagents={subagentsToShow} isLive={!!isLive} />
                    );
                  }
                  return null;
                })()}
                {message.content ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={assistantMarkdownComponents}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : null}
              </>
            )}
            {message.isStreaming && message.content && (
              <span className="inline-block w-2 h-4 ml-1 bg-copilot-accent animate-pulse rounded-sm" />
            )}
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison to optimize re-renders
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.isStreaming === nextProps.message.isStreaming &&
      prevProps.message.isPendingInjection === nextProps.message.isPendingInjection &&
      prevProps.index === nextProps.index &&
      prevProps.lastAssistantIndex === nextProps.lastAssistantIndex &&
      prevProps.isVoiceSpeaking === nextProps.isVoiceSpeaking &&
      prevProps.activeTools === nextProps.activeTools &&
      prevProps.activeSubagents === nextProps.activeSubagents &&
      prevProps.message.tools === nextProps.message.tools &&
      prevProps.message.subagents === nextProps.message.subagents &&
      prevProps.message.imageAttachments === nextProps.message.imageAttachments &&
      prevProps.message.fileAttachments === nextProps.message.fileAttachments
    );
  }
);

MessageItem.displayName = 'MessageItem';

// Memoized markdown components for user messages
const userMarkdownComponents = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  code: ({ className, children }: any) => {
    const textContent = String(children).replace(/\n$/, '');
    const hasLanguageClass = className?.startsWith('language-');
    const isMultiLine = textContent.includes('\n');
    const isBlock = hasLanguageClass || isMultiLine;

    if (isBlock) {
      return (
        <CodeBlockWithCopy isDiagram={false} textContent={textContent} isCliCommand={false}>
          {children}
        </CodeBlockWithCopy>
      );
    } else {
      return (
        <code className="bg-copilot-bg px-1 py-0.5 rounded text-copilot-warning text-xs break-all">
          {children}
        </code>
      );
    }
  },
  pre: ({ children }: any) => <div className="overflow-x-auto max-w-full">{children}</div>,
};

// Memoized markdown components for assistant messages
const assistantMarkdownComponents = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: any) => (
    <strong className="font-semibold text-copilot-text">{children}</strong>
  ),
  em: ({ children }: any) => <em className="italic">{children}</em>,
  ul: ({ children }: any) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
  ),
  li: ({ children }: any) => <li className="ml-2">{children}</li>,
  code: ({ children, className }: any) => {
    const textContent = extractTextContent(children);
    const hasLanguageClass = className?.includes('language-');
    const isMultiLine = textContent.includes('\n');
    const isBlock = hasLanguageClass || isMultiLine;
    const isDiagram = isAsciiDiagram(textContent);
    const isCliCmd = isCliCommand(className, textContent);

    if (isBlock) {
      return (
        <CodeBlockWithCopy isDiagram={isDiagram} textContent={textContent} isCliCommand={isCliCmd}>
          {children}
        </CodeBlockWithCopy>
      );
    } else {
      return (
        <code className="bg-copilot-bg px-1 py-0.5 rounded text-copilot-warning text-xs break-all">
          {children}
        </code>
      );
    }
  },
  pre: ({ children }: any) => <div className="overflow-x-auto max-w-full">{children}</div>,
  a: ({ href, children }: any) => (
    <a
      href={href}
      className="text-copilot-accent hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  h1: ({ children }: any) => (
    <h1 className="text-lg font-bold mb-2 text-copilot-text">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-base font-bold mb-2 text-copilot-text">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-bold mb-1 text-copilot-text">{children}</h3>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-copilot-border pl-3 my-2 text-copilot-text-muted italic">
      {children}
    </blockquote>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse border border-copilot-border text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="bg-copilot-bg">{children}</thead>,
  tbody: ({ children }: any) => <tbody>{children}</tbody>,
  tr: ({ children }: any) => <tr className="border-b border-copilot-border">{children}</tr>,
  th: ({ children }: any) => (
    <th className="px-3 py-2 text-left font-semibold text-copilot-text border border-copilot-border">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-3 py-2 text-copilot-text border border-copilot-border">{children}</td>
  ),
};
