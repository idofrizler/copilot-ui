import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import yaml from 'js-yaml';
import {
  CloseIcon,
  ExternalLinkIcon,
  ListIcon,
  TreeIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
} from '../Icons';
import { Spinner } from '../Spinner';
import { CodeBlockWithCopy } from '../CodeBlock';
import { isAsciiDiagram } from '../../utils/isAsciiDiagram';
import { isCliCommand } from '../../utils/isCliCommand';
import type { Agent, Instruction, Skill } from '../../types';

export interface EnvironmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  instructions: Instruction[];
  skills: Skill[];
  agents: Agent[];
  cwd?: string;
  initialTab?: 'instructions' | 'skills' | 'agents';
  initialAgentPath?: string | null;
  fileViewMode?: 'flat' | 'tree';
  onViewModeChange?: (mode: 'flat' | 'tree') => void;
  onTabChange?: (tab: 'instructions' | 'skills' | 'agents') => void;
}

interface FileContent {
  success: boolean;
  content?: string;
  fileSize?: number;
  fileName?: string;
  error?: string;
  errorType?: 'not_found' | 'too_large' | 'binary' | 'read_error';
}

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

interface SkillFileEntry {
  path: string;
  relativePath: string;
}

interface SkillTreeNode {
  name: string;
  relativePath: string;
  fullPath?: string;
  isDirectory: boolean;
  children: SkillTreeNode[];
}

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

const isAbsolutePath = (value: string): boolean =>
  value.startsWith('/') || /^[a-zA-Z]:/.test(value);

const resolvePath = (value: string, cwd?: string): string => {
  if (!value) return value;
  if (isAbsolutePath(value) || !cwd) return value;
  return `${cwd.replace(/\/$/, '')}/${value}`;
};

const buildFileTree = (files: string[]): FileTreeNode[] => {
  const root: FileTreeNode[] = [];
  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b));

  for (const filePath of sortedFiles) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLastPart = i === parts.length - 1;

      let existingNode = currentLevel.find((n) => n.name === part);

      if (!existingNode) {
        const newNode: FileTreeNode = {
          name: part,
          path: isLastPart ? filePath : currentPath,
          isDirectory: !isLastPart,
          children: [],
        };
        currentLevel.push(newNode);
        existingNode = newNode;
      }

      if (!isLastPart) {
        currentLevel = existingNode.children;
      }
    }
  }

  return root;
};

const buildSkillTree = (entries: SkillFileEntry[]): SkillTreeNode[] => {
  const root: SkillTreeNode[] = [];
  const sortedEntries = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const entry of sortedEntries) {
    const normalizedPath = normalizePath(entry.relativePath);
    const parts = normalizedPath.split('/').filter(Boolean);
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLastPart = i === parts.length - 1;

      let existingNode = currentLevel.find((n) => n.name === part);

      if (!existingNode) {
        const newNode: SkillTreeNode = {
          name: part,
          relativePath: currentPath,
          fullPath: isLastPart ? entry.path : undefined,
          isDirectory: !isLastPart,
          children: [],
        };
        currentLevel.push(newNode);
        existingNode = newNode;
      }

      if (!isLastPart) {
        currentLevel = existingNode.children;
      }
    }
  }

  return root;
};

const parseMarkdownFrontmatter = (
  content: string
): { frontmatter: Record<string, unknown> | null; body: string } => {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { frontmatter: null, body: content };
  }

  let frontmatter: Record<string, unknown> | null = null;
  try {
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === 'object') {
      frontmatter = parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.error('Failed to parse frontmatter:', error);
  }

  return { frontmatter, body: content.slice(match[0].length) };
};

const formatFrontmatterValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((entry) => formatFrontmatterValue(entry)).join(', ');
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value ?? '');
};

export const EnvironmentModal: React.FC<EnvironmentModalProps> = ({
  isOpen,
  onClose,
  instructions,
  skills,
  agents,
  cwd,
  initialTab = 'instructions',
  initialAgentPath = null,
  fileViewMode = 'flat',
  onViewModeChange,
  onTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<'instructions' | 'skills' | 'agents'>(initialTab);
  const [selectedInstructionFile, setSelectedInstructionFile] = useState<string | null>(null);
  const [selectedSkillFile, setSelectedSkillFile] = useState<string | null>(null);
  const [selectedAgentFile, setSelectedAgentFile] = useState<string | null>(null);
  const [expandedInstructionFolders, setExpandedInstructionFolders] = useState<Set<string>>(
    new Set()
  );
  const [expandedSkillFolders, setExpandedSkillFolders] = useState<Set<string>>(new Set());
  const [expandedSkillRoots, setExpandedSkillRoots] = useState<Set<string>>(new Set());
  const [expandedAgentFolders, setExpandedAgentFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [frontmatter, setFrontmatter] = useState<Record<string, unknown> | null>(null);
  const [markdownBody, setMarkdownBody] = useState<string | null>(null);

  const instructionPaths = useMemo(
    () => instructions.map((instruction) => instruction.path).sort(),
    [instructions]
  );

  const skillEntries = useMemo(() => {
    return skills.map((skill) => {
      const basePath = normalizePath(skill.path).replace(/\/+$/, '');
      const files = (skill.files || []).slice();
      const fileEntries = files
        .map((filePath) => {
          const normalizedFile = normalizePath(filePath);
          const relativePath = normalizedFile.startsWith(basePath)
            ? normalizedFile.slice(basePath.length).replace(/^\/+/, '')
            : normalizedFile;
          return { path: filePath, relativePath };
        })
        .filter((entry) => entry.relativePath.length > 0)
        .sort((a, b) => {
          const aBase = a.relativePath.split('/').pop()?.toLowerCase() || '';
          const bBase = b.relativePath.split('/').pop()?.toLowerCase() || '';
          if (aBase === 'skill.md' && bBase !== 'skill.md') return -1;
          if (bBase === 'skill.md' && aBase !== 'skill.md') return 1;
          return a.relativePath.localeCompare(b.relativePath);
        });

      return {
        ...skill,
        fileEntries,
        tree: buildSkillTree(fileEntries),
      };
    });
  }, [skills]);

  const skillFilePaths = useMemo(
    () =>
      skillEntries
        .flatMap((entry) => entry.fileEntries.map((file) => file.path))
        .sort((a, b) => a.localeCompare(b)),
    [skillEntries]
  );

  const skillFullTree = useMemo(() => buildFileTree(skillFilePaths), [skillFilePaths]);

  const agentPaths = useMemo(() => agents.map((agent) => agent.path).sort(), [agents]);
  const agentTree = useMemo(() => buildFileTree(agentPaths), [agentPaths]);
  const instructionCount = instructionPaths.length;
  const skillCount = skillEntries.length;
  const agentCount = agentPaths.length;

  const selectedFile =
    activeTab === 'instructions'
      ? selectedInstructionFile
      : activeTab === 'skills'
        ? selectedSkillFile
        : selectedAgentFile;

  const selectedFileName = selectedFile?.split(/[/\\]/).pop() || '';
  const isSkillMarkdown = activeTab === 'skills' && selectedFileName.toLowerCase() === 'skill.md';
  const isMarkdownFile =
    activeTab === 'instructions' ||
    activeTab === 'agents' ||
    selectedFileName.toLowerCase().endsWith('.md') ||
    selectedFileName.toLowerCase().endsWith('.markdown');

  const ensureDefaultInstructionSelection = useCallback(() => {
    if (instructionPaths.length === 0) {
      setSelectedInstructionFile(null);
      return;
    }
    if (!selectedInstructionFile || !instructionPaths.includes(selectedInstructionFile)) {
      setSelectedInstructionFile(instructionPaths[0]);
    }
  }, [instructionPaths, selectedInstructionFile]);

  const ensureDefaultSkillSelection = useCallback(() => {
    const allFiles = skillEntries.flatMap((entry) => entry.fileEntries);
    if (allFiles.length === 0) {
      setSelectedSkillFile(null);
      return;
    }
    const defaultSkillFile =
      allFiles.find((entry) => entry.relativePath.split('/').pop()?.toLowerCase() === 'skill.md')
        ?.path || allFiles[0].path;
    if (!selectedSkillFile || !allFiles.some((entry) => entry.path === selectedSkillFile)) {
      setSelectedSkillFile(defaultSkillFile);
    }
  }, [skillEntries, selectedSkillFile]);

  const ensureDefaultAgentSelection = useCallback(() => {
    if (agentPaths.length === 0) {
      setSelectedAgentFile(null);
      return;
    }
    if (initialAgentPath && agentPaths.includes(initialAgentPath)) {
      setSelectedAgentFile(initialAgentPath);
      return;
    }
    if (!selectedAgentFile || !agentPaths.includes(selectedAgentFile)) {
      setSelectedAgentFile(agentPaths[0]);
    }
  }, [agentPaths, initialAgentPath, selectedAgentFile]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== 'agents') {
      setSelectedAgentFile(initialAgentPath ?? null);
    }
  }, [activeTab, initialAgentPath, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    ensureDefaultInstructionSelection();
  }, [ensureDefaultInstructionSelection, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    ensureDefaultSkillSelection();
  }, [ensureDefaultSkillSelection, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    ensureDefaultAgentSelection();
  }, [ensureDefaultAgentSelection, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const instructionFolders = new Set<string>();
    const collectInstructionFolders = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.isDirectory) {
          instructionFolders.add(node.path);
          collectInstructionFolders(node.children);
        }
      }
    };
    collectInstructionFolders(buildFileTree(instructionPaths));

    const skillFolderSet = new Set<string>();
    const collectSkillFolders = (nodes: SkillTreeNode[], rootPath: string) => {
      for (const node of nodes) {
        if (node.isDirectory) {
          skillFolderSet.add(`${rootPath}/${node.relativePath}`);
          collectSkillFolders(node.children, rootPath);
        }
      }
    };
    for (const entry of skillEntries) {
      collectSkillFolders(entry.tree, entry.path);
    }

    const skillFullFolderSet = new Set<string>();
    const collectSkillFullFolders = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.isDirectory) {
          skillFullFolderSet.add(node.path);
          collectSkillFullFolders(node.children);
        }
      }
    };
    collectSkillFullFolders(skillFullTree);

    const agentFolders = new Set<string>();
    const collectAgentFolders = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.isDirectory) {
          agentFolders.add(node.path);
          collectAgentFolders(node.children);
        }
      }
    };
    collectAgentFolders(agentTree);

    if (fileViewMode === 'tree') {
      setExpandedInstructionFolders(instructionFolders);
      setExpandedSkillRoots(new Set<string>(skillEntries.map((entry) => entry.path)));
      setExpandedSkillFolders(skillFullFolderSet);
      setExpandedAgentFolders(agentFolders);
    } else {
      setExpandedInstructionFolders(new Set());
      setExpandedSkillRoots(new Set());
      setExpandedSkillFolders(skillFolderSet);
      setExpandedAgentFolders(new Set());
    }
  }, [agentTree, fileViewMode, instructionPaths, skillEntries, skillFullTree, isOpen]);

  const toggleInstructionFolder = useCallback((path: string) => {
    setExpandedInstructionFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleSkillRoot = useCallback((path: string) => {
    setExpandedSkillRoots((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleSkillFolder = useCallback((path: string) => {
    setExpandedSkillFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const toggleAgentFolder = useCallback((path: string) => {
    setExpandedAgentFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const loadFileContent = useCallback(async () => {
    if (!selectedFile) return;
    setLoading(true);
    setFrontmatter(null);
    setMarkdownBody(null);
    try {
      const resolvedPath =
        activeTab === 'instructions' ? resolvePath(selectedFile, cwd) : selectedFile;
      const result = await window.electronAPI.file.readContent(resolvedPath);
      setFileContent(result);
      const shouldParseFrontmatter =
        (activeTab === 'skills' && isSkillMarkdown) || activeTab === 'agents';
      if (result.success && result.content && shouldParseFrontmatter) {
        const parsed = parseMarkdownFrontmatter(result.content);
        setFrontmatter(parsed.frontmatter);
        setMarkdownBody(parsed.body);
      }
    } catch (error) {
      setFileContent({
        success: false,
        error: `Failed to load file content: ${String(error)}`,
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, cwd, isSkillMarkdown, selectedFile]);

  useEffect(() => {
    if (isOpen && selectedFile) {
      loadFileContent();
    }
  }, [isOpen, selectedFile, loadFileContent]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRevealInFolder = async () => {
    if (!selectedFile) return;
    try {
      const resolvedPath =
        activeTab === 'instructions' ? resolvePath(selectedFile, cwd) : selectedFile;
      await window.electronAPI.file.revealInFolder(resolvedPath, cwd);
    } catch (error) {
      console.error('Failed to reveal in folder:', error);
    }
  };

  const renderMarkdown = (content: string) => (
    <div className="prose prose-sm prose-invert max-w-none">
      <div className="text-copilot-text">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-semibold text-copilot-text mb-3">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-base font-semibold text-copilot-text mt-6 mb-3 pb-2 border-b border-copilot-border">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-semibold text-copilot-text mt-5 mb-2 pb-1 border-b border-copilot-border/70">
                {children}
              </h3>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-1 text-copilot-text text-sm">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-1 text-copilot-text text-sm">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="text-copilot-text-muted">
                <span className="text-copilot-text">{children}</span>
              </li>
            ),
            p: ({ children }) => (
              <p className="text-copilot-text-muted text-sm leading-6 mb-3">{children}</p>
            ),
            strong: ({ children }) => (
              <strong className="text-copilot-text font-semibold">{children}</strong>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-copilot-border pl-3 my-3 text-copilot-text-muted italic">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="border-copilot-border my-4" />,
            table: ({ children }) => (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full border-collapse border border-copilot-border text-sm">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-copilot-bg/50">{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => <tr className="border-b border-copilot-border">{children}</tr>,
            th: ({ children }) => (
              <th className="px-3 py-2 text-left font-semibold text-copilot-text border border-copilot-border">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-copilot-text border border-copilot-border">
                {children}
              </td>
            ),
            code: ({ inline, children }) =>
              inline ? (
                <code className="bg-copilot-bg px-1 py-0.5 rounded text-copilot-text text-[11px] font-mono">
                  {children}
                </code>
              ) : (
                <code className="text-[11px] font-mono text-copilot-text">{children}</code>
              ),
            pre: ({ children }) => (
              <pre className="bg-copilot-bg/70 border border-copilot-border rounded p-3 overflow-auto">
                {children}
              </pre>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );

  const renderInstructionItem = (path: string, paddingLeft: number, inTreeView: boolean) => {
    const name = path.split(/[/\\]/).pop() || path;
    const displayName = inTreeView ? name : path;
    const isSelected = selectedInstructionFile === path;

    return (
      <div
        key={path}
        className={`flex items-center gap-1.5 py-1 px-2 text-[11px] cursor-pointer transition-colors ${
          isSelected
            ? 'bg-copilot-accent/20 text-copilot-text'
            : 'text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text'
        }`}
        style={{ paddingLeft }}
        onClick={() => setSelectedInstructionFile(path)}
      >
        <FileIcon size={12} className="shrink-0 text-copilot-success" />
        <span className="truncate font-mono flex-1" title={path}>
          {displayName}
        </span>
      </div>
    );
  };

  const renderInstructionTreeNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedInstructionFolders.has(node.path);
    const paddingLeft = 12 + level * 16;
    const filePaddingLeft = paddingLeft + 16;

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleInstructionFolder(node.path)}
            className="w-full flex items-center gap-1.5 py-1 px-2 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text transition-colors"
            style={{ paddingLeft }}
          >
            <ChevronRightIcon
              size={10}
              className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            {isExpanded ? (
              <FolderOpenIcon size={12} className="shrink-0 text-copilot-accent" />
            ) : (
              <FolderIcon size={12} className="shrink-0 text-copilot-accent" />
            )}
            <span className="truncate font-mono">{node.name}</span>
          </button>
          {isExpanded && node.children.map((child) => renderInstructionTreeNode(child, level + 1))}
        </div>
      );
    }

    return renderInstructionItem(node.path, filePaddingLeft, true);
  };

  const renderAgentItem = (path: string, paddingLeft: number, inTreeView: boolean) => {
    const name = path.split(/[/\\]/).pop() || path;
    const displayName = inTreeView ? name : path;
    const isSelected = selectedAgentFile === path;

    return (
      <div
        key={path}
        className={`flex items-center gap-1.5 py-1 px-2 text-[11px] cursor-pointer transition-colors ${
          isSelected
            ? 'bg-copilot-accent/20 text-copilot-text'
            : 'text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text'
        }`}
        style={{ paddingLeft }}
        onClick={() => setSelectedAgentFile(path)}
      >
        <FileIcon size={12} className="shrink-0 text-copilot-success" />
        <span className="truncate font-mono flex-1" title={path}>
          {displayName}
        </span>
      </div>
    );
  };

  const renderAgentTreeNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedAgentFolders.has(node.path);
    const paddingLeft = 12 + level * 16;
    const filePaddingLeft = paddingLeft + 16;

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleAgentFolder(node.path)}
            className="w-full flex items-center gap-1.5 py-1 px-2 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text transition-colors"
            style={{ paddingLeft }}
          >
            <ChevronRightIcon
              size={10}
              className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            {isExpanded ? (
              <FolderOpenIcon size={12} className="shrink-0 text-copilot-accent" />
            ) : (
              <FolderIcon size={12} className="shrink-0 text-copilot-accent" />
            )}
            <span className="truncate font-mono">{node.name}</span>
          </button>
          {isExpanded && node.children.map((child) => renderAgentTreeNode(child, level + 1))}
        </div>
      );
    }

    return renderAgentItem(node.path, filePaddingLeft, true);
  };

  const renderSkillFileItem = (
    skillPath: string,
    filePath: string,
    label: string,
    paddingLeft: number
  ) => {
    const isSelected = selectedSkillFile === filePath;
    return (
      <div
        key={`${skillPath}:${filePath}`}
        className={`flex items-center gap-1.5 py-1 px-2 text-[11px] cursor-pointer transition-colors ${
          isSelected
            ? 'bg-copilot-accent/20 text-copilot-text'
            : 'text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text'
        }`}
        style={{ paddingLeft }}
        onClick={() => setSelectedSkillFile(filePath)}
      >
        <FileIcon size={12} className="shrink-0 text-copilot-success" />
        <span className="truncate font-mono flex-1" title={filePath}>
          {label}
        </span>
      </div>
    );
  };

  const renderSkillFullTreeNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedSkillFolders.has(node.path);
    const paddingLeft = 12 + level * 16;
    const filePaddingLeft = paddingLeft + 16;

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleSkillFolder(node.path)}
            className="w-full flex items-center gap-1.5 py-1 px-2 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text transition-colors"
            style={{ paddingLeft }}
          >
            <ChevronRightIcon
              size={10}
              className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            {isExpanded ? (
              <FolderOpenIcon size={12} className="shrink-0 text-copilot-accent" />
            ) : (
              <FolderIcon size={12} className="shrink-0 text-copilot-accent" />
            )}
            <span className="truncate font-mono">{node.name}</span>
          </button>
          {isExpanded && node.children.map((child) => renderSkillFullTreeNode(child, level + 1))}
        </div>
      );
    }

    return renderSkillFileItem(node.path, node.path, node.name, filePaddingLeft);
  };

  const renderSkillTreeNode = (
    skillPath: string,
    node: SkillTreeNode,
    level: number
  ): React.ReactNode => {
    const folderKey = `${skillPath}/${node.relativePath}`;
    const isExpanded = expandedSkillFolders.has(folderKey);
    const paddingLeft = 12 + level * 16;
    const filePaddingLeft = paddingLeft + 16;

    if (node.isDirectory) {
      return (
        <div key={folderKey}>
          <button
            onClick={() => toggleSkillFolder(folderKey)}
            className="w-full flex items-center gap-1.5 py-1 px-2 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text transition-colors"
            style={{ paddingLeft }}
          >
            <ChevronRightIcon
              size={10}
              className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            {isExpanded ? (
              <FolderOpenIcon size={12} className="shrink-0 text-copilot-accent" />
            ) : (
              <FolderIcon size={12} className="shrink-0 text-copilot-accent" />
            )}
            <span className="truncate font-mono">{node.name}</span>
          </button>
          {isExpanded &&
            node.children.map((child) => renderSkillTreeNode(skillPath, child, level + 1))}
        </div>
      );
    }

    if (!node.fullPath) return null;
    return renderSkillFileItem(skillPath, node.fullPath, node.name, filePaddingLeft);
  };

  const renderSkillRoot = (skill: (typeof skillEntries)[number]) => {
    const isExpanded = expandedSkillRoots.has(skill.path);
    const skillLabel = skill.path.split(/[/\\]/).pop() || skill.name;
    return (
      <div key={skill.path}>
        <button
          onClick={() => toggleSkillRoot(skill.path)}
          className="w-full flex items-center gap-1.5 py-1 px-2 text-[11px] text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text transition-colors"
          title={skill.path}
        >
          <ChevronRightIcon
            size={10}
            className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
          {isExpanded ? (
            <FolderOpenIcon size={12} className="shrink-0 text-copilot-accent" />
          ) : (
            <FolderIcon size={12} className="shrink-0 text-copilot-accent" />
          )}
          <span className="truncate font-mono">{skillLabel}</span>
        </button>
        {isExpanded && skill.tree.map((node) => renderSkillTreeNode(skill.path, node, 1))}
      </div>
    );
  };

  return (
    <div
      className="fixed top-[var(--titlebar-height)] left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      data-testid="environment-modal"
    >
      <div
        className="bg-copilot-surface border border-copilot-border rounded-lg shadow-xl flex flex-col overflow-hidden"
        style={{
          width: '90%',
          maxWidth: '1200px',
          maxHeight: '85vh',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="environment-modal-title"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-copilot-border shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h3 id="environment-modal-title" className="text-sm font-medium text-copilot-text">
                Environment
              </h3>
              <div className="inline-flex items-center gap-1 rounded-md border border-copilot-border bg-copilot-bg/60 p-0.5">
                {(['instructions', 'skills', 'agents'] as const).map((tab) => {
                  const isActive = activeTab === tab;
                  const label =
                    tab === 'instructions'
                      ? `Instructions (${instructionCount})`
                      : tab === 'skills'
                        ? `Skills (${skillCount})`
                        : `Agents (${agentCount})`;
                  return (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab);
                        onTabChange?.(tab);
                      }}
                      title={label}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                        isActive
                          ? 'bg-copilot-surface text-copilot-text shadow-sm'
                          : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onViewModeChange && (
                <button
                  onClick={() => onViewModeChange(fileViewMode === 'flat' ? 'tree' : 'flat')}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-bg rounded transition-colors"
                  title={fileViewMode === 'tree' ? 'Switch to flat view' : 'Switch to tree view'}
                >
                  {fileViewMode === 'tree' ? <ListIcon size={14} /> : <TreeIcon size={14} />}
                  <span>{fileViewMode === 'tree' ? 'Flat' : 'Tree'}</span>
                </button>
              )}
              {selectedFile && (
                <button
                  onClick={handleRevealInFolder}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-bg rounded transition-colors"
                  title="Reveal in Folder"
                >
                  <ExternalLinkIcon size={14} />
                  <span>Reveal</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="text-copilot-text-muted hover:text-copilot-text transition-colors p-1"
                aria-label="Close modal"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0 min-w-0">
          {/* Left sidebar */}
          <div className="w-64 shrink-0 border-r border-copilot-border flex flex-col bg-copilot-surface">
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'instructions' ? (
                instructionPaths.length === 0 ? (
                  <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                    No instruction files found
                  </div>
                ) : fileViewMode === 'tree' ? (
                  <div className="py-1">
                    {buildFileTree(instructionPaths).map((node) => renderInstructionTreeNode(node))}
                  </div>
                ) : (
                  <div className="py-1">
                    {instructionPaths.map((path) => renderInstructionItem(path, 12, false))}
                  </div>
                )
              ) : activeTab === 'skills' ? (
                skillEntries.length === 0 ? (
                  <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                    No skills found
                  </div>
                ) : fileViewMode === 'tree' ? (
                  <div className="py-1">
                    {skillFullTree.map((node) => renderSkillFullTreeNode(node))}
                  </div>
                ) : (
                  <div className="py-1">{skillEntries.map((skill) => renderSkillRoot(skill))}</div>
                )
              ) : agentPaths.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                  No agents found
                </div>
              ) : fileViewMode === 'tree' ? (
                <div className="py-1">{agentTree.map((node) => renderAgentTreeNode(node))}</div>
              ) : (
                <div className="py-1">
                  {agentPaths.map((path) => renderAgentItem(path, 12, false))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col min-w-0 bg-copilot-bg">
            {selectedFile && (
              <div className="px-4 py-2 border-b border-copilot-border bg-copilot-surface flex items-center gap-2">
                <span className="text-xs font-medium text-copilot-text truncate">
                  {selectedFileName || 'Untitled'}
                </span>
                <span
                  className="text-[10px] text-copilot-text-muted truncate ml-auto"
                  title={selectedFile}
                >
                  {selectedFile}
                </span>
              </div>
            )}
            <div className="flex-1 overflow-auto p-4 min-h-0 min-w-0">
              {!selectedFile ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-copilot-text-muted text-sm">Select a file to preview</p>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center h-32">
                  <Spinner size={24} />
                </div>
              ) : fileContent?.success && fileContent?.content !== undefined ? (
                activeTab === 'skills' && !isMarkdownFile ? (
                  <CodeBlockWithCopy
                    textContent={fileContent.content}
                    isDiagram={isAsciiDiagram(fileContent.content)}
                    isCliCommand={isCliCommand(fileContent.content)}
                  >
                    {fileContent.content}
                  </CodeBlockWithCopy>
                ) : (
                  <div>
                    {frontmatter && Object.keys(frontmatter).length > 0 && (
                      <div className="mb-4 border border-copilot-border rounded-md bg-copilot-surface p-3 text-xs">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-copilot-text-muted">
                          Frontmatter
                        </div>
                        <div className="mt-2 space-y-1">
                          {Object.entries(frontmatter).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-copilot-text-muted w-24 shrink-0">{key}</span>
                              <span className="text-copilot-text break-words">
                                {formatFrontmatterValue(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {renderMarkdown(markdownBody ?? fileContent.content)}
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <p className="text-copilot-text-muted text-sm mb-2">⚠️ Error loading file</p>
                  <p className="text-copilot-text-muted text-xs">
                    {fileContent?.error || 'Unknown error'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentModal;
