import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CloseIcon,
  ExternalLinkIcon,
  EditIcon,
  EyeIcon,
  ListIcon,
  TreeIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  ArchiveIcon,
  UnarchiveIcon,
} from '../Icons';
import { Spinner } from '../Spinner';

export interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  cwd?: string;
  isGitRepo?: boolean;
  // New props for full files preview overlay
  editedFiles?: string[];
  untrackedFiles?: string[];
  conflictedFiles?: string[];
  fileViewMode?: 'flat' | 'tree';
  overlayTitle?: string;
  contentMode?: 'diff' | 'markdown';
  forceFullOverlay?: boolean;
  onUntrackFile?: (filePath: string) => void;
  onRetrackFile?: (filePath: string) => void;
  onViewModeChange?: (mode: 'flat' | 'tree') => void;
}

interface FileContent {
  success: boolean;
  content?: string;
  fileSize?: number;
  fileName?: string;
  error?: string;
  errorType?: 'not_found' | 'too_large' | 'binary' | 'read_error';
}

interface FileDiff {
  success: boolean;
  diff?: string;
  error?: string;
  isNew?: boolean;
  isModified?: boolean;
  linesAdded?: number;
  linesRemoved?: number;
}

// File tree node interface for tree view
interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

// Build a tree structure from flat file paths
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

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  onClose,
  filePath: initialFilePath,
  cwd,
  isGitRepo = true,
  editedFiles = [],
  untrackedFiles = [],
  conflictedFiles = [],
  fileViewMode = 'flat',
  overlayTitle,
  contentMode = 'diff',
  forceFullOverlay = false,
  onUntrackFile,
  onRetrackFile,
  onViewModeChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>(initialFilePath);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState<string>('');
  const [originalEditContent, setOriginalEditContent] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Track current request to prevent race conditions when selectedFile changes rapidly
  const loadRequestRef = useRef<number>(0);

  // Determine if this is a full overlay (multiple files) or single file preview
  const isFullOverlay = forceFullOverlay || editedFiles.length > 0;
  const isMarkdownView = contentMode === 'markdown';

  // Initialize expanded folders when tree view is active
  useEffect(() => {
    if (fileViewMode === 'tree' && editedFiles.length > 0) {
      const allFolders = new Set<string>();
      const collectFolders = (nodes: FileTreeNode[]) => {
        for (const node of nodes) {
          if (node.isDirectory) {
            allFolders.add(node.path);
            collectFolders(node.children);
          }
        }
      };
      collectFolders(buildFileTree(editedFiles));
      setExpandedFolders(allFolders);
    }
  }, [fileViewMode, editedFiles]);

  // Update selected file when initial file path changes
  useEffect(() => {
    if (initialFilePath) {
      setSelectedFile(initialFilePath);
    }
  }, [initialFilePath]);

  // Reset edit mode when selected file changes
  useEffect(() => {
    setEditMode(false);
    setEditContent('');
    setOriginalEditContent('');
    setSaveError(null);
  }, [selectedFile]);

  const loadFileContent = useCallback(async () => {
    if (!selectedFile) return;

    // Increment request ID to track this specific request
    const currentRequestId = ++loadRequestRef.current;

    setLoading(true);
    try {
      if (isMarkdownView) {
        const resolvedPath =
          !selectedFile.startsWith('/') && !selectedFile.match(/^[a-zA-Z]:/) && cwd
            ? `${cwd}/${selectedFile}`
            : selectedFile;
        const result = await window.electronAPI.file.readContent(resolvedPath);
        // Only update state if this is still the current request
        if (loadRequestRef.current !== currentRequestId) return;
        setFileContent(result);
        setFileDiff(null);
        return;
      }

      if (isGitRepo) {
        if (!cwd) return;
        const result = await window.electronAPI.git.getDiff(cwd, [selectedFile]);
        // Only update state if this is still the current request
        if (loadRequestRef.current !== currentRequestId) return;

        if (result.success && result.diff) {
          const diffLines = result.diff.split('\n');
          let linesAdded = 0;
          let linesRemoved = 0;
          let isNew = false;

          for (const line of diffLines) {
            if (line.startsWith('new file mode')) {
              isNew = true;
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
              linesAdded++;
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              linesRemoved++;
            }
          }

          setFileDiff({
            success: true,
            diff: result.diff,
            isNew,
            isModified: !isNew && (linesAdded > 0 || linesRemoved > 0),
            linesAdded,
            linesRemoved,
          });
          setFileContent(null);
        } else {
          // No diff available (e.g., untracked new file) - fall back to file content
          const absolutePath =
            !selectedFile.startsWith('/') && !selectedFile.match(/^[a-zA-Z]:/)
              ? `${cwd}/${selectedFile}`
              : selectedFile;
          const contentResult = await window.electronAPI.file.readContent(absolutePath);
          // Only update state if this is still the current request
          if (loadRequestRef.current !== currentRequestId) return;
          if (contentResult.success) {
            setFileContent(contentResult);
            setFileDiff({
              success: true,
              isNew: true,
              linesAdded: contentResult.content?.split('\n').length || 0,
              linesRemoved: 0,
            });
          } else {
            setFileDiff({
              success: false,
              error: result.error || contentResult.error || 'Failed to load file',
            });
            setFileContent(null);
          }
        }
      } else {
        const result = await window.electronAPI.file.readContent(selectedFile);
        // Only update state if this is still the current request
        if (loadRequestRef.current !== currentRequestId) return;
        setFileContent(result);
        setFileDiff(null);
      }
    } catch (error) {
      // Only update state if this is still the current request
      if (loadRequestRef.current !== currentRequestId) return;
      if (isGitRepo && !isMarkdownView) {
        setFileDiff({
          success: false,
          error: `Failed to load file diff: ${String(error)}`,
        });
      } else {
        setFileContent({
          success: false,
          error: `Failed to load file content: ${String(error)}`,
        });
      }
    } finally {
      // Only update loading state if this is still the current request
      if (loadRequestRef.current === currentRequestId) {
        setLoading(false);
      }
    }
  }, [selectedFile, cwd, isGitRepo, isMarkdownView]);

  useEffect(() => {
    if (isOpen && selectedFile) {
      loadFileContent();
    }
  }, [isOpen, selectedFile, loadFileContent]);

  // Load file content for editing
  const loadEditContent = useCallback(async () => {
    if (!selectedFile || !cwd) return;
    const resolvedPath =
      !selectedFile.startsWith('/') && !selectedFile.match(/^[a-zA-Z]:/)
        ? `${cwd}/${selectedFile}`
        : selectedFile;
    const result = await window.electronAPI.file.readContent(resolvedPath);
    if (result.success && result.content !== undefined) {
      setEditContent(result.content);
      setOriginalEditContent(result.content);
    }
  }, [selectedFile, cwd]);

  const handleSave = useCallback(async () => {
    if (!selectedFile || !cwd) return;
    setSaving(true);
    setSaveError(null);
    try {
      const resolvedPath =
        !selectedFile.startsWith('/') && !selectedFile.match(/^[a-zA-Z]:/)
          ? `${cwd}/${selectedFile}`
          : selectedFile;
      const result = await window.electronAPI.file.writeContent(resolvedPath, editContent);
      if (result.success) {
        setOriginalEditContent(editContent);
        setEditMode(false);
        loadFileContent();
      } else {
        setSaveError(result.error || 'Failed to save');
      }
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }, [selectedFile, cwd, editContent, loadFileContent]);

  const handleToggleEdit = useCallback(async () => {
    if (!editMode) {
      await loadEditContent();
      setEditMode(true);
    } else {
      if (editContent !== originalEditContent) {
        if (!window.confirm('Discard unsaved changes?')) return;
      }
      setEditMode(false);
      setSaveError(null);
    }
  }, [editMode, editContent, originalEditContent, loadEditContent]);

  const hasUnsavedChanges = editMode && editContent !== originalEditContent;

  const handleCloseWithCheck = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('Discard unsaved changes?')) return;
    }
    setEditMode(false);
    setSaveError(null);
    onClose();
  }, [hasUnsavedChanges, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCloseWithCheck();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCloseWithCheck]);

  const handleRevealInFolder = async () => {
    try {
      await window.electronAPI.file.revealInFolder(selectedFile, cwd);
    } catch (error) {
      console.error('Failed to reveal in folder:', error);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCloseWithCheck();
    }
  };

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  if (!isOpen) return null;

  const fileName = selectedFile?.split(/[/\\]/).pop() || selectedFile || 'No file selected';
  const nonUntrackedFiles = editedFiles.filter((f) => !untrackedFiles.includes(f));
  const untrackedFilesInList = editedFiles.filter((f) => untrackedFiles.includes(f));
  const modalTitle = isFullOverlay ? overlayTitle || 'Files Preview' : fileName;

  const renderDiff = (diff: string) => {
    const lines = diff.split('\n');
    return lines.map((line, index) => {
      let className = 'font-mono text-[11px] leading-relaxed';

      if (line.startsWith('+++') || line.startsWith('---')) {
        className += ' text-copilot-text-muted font-semibold';
      } else if (line.startsWith('+')) {
        className += ' bg-green-500/10 text-green-400';
      } else if (line.startsWith('-')) {
        className += ' bg-red-500/10 text-red-400';
      } else if (line.startsWith('@@')) {
        className += ' text-copilot-accent font-semibold';
      } else if (
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('new file mode')
      ) {
        className += ' text-copilot-text-muted text-[10px]';
      } else {
        className += ' text-copilot-text';
      }

      return (
        <div key={index} className={className}>
          {line || '\u00A0'}
        </div>
      );
    });
  };

  // Render a single file item in the sidebar
  // When inTreeView=true, show only filename; when false (flat view), show full path
  const renderFileItem = (
    path: string,
    isUntracked: boolean,
    paddingLeft = 12,
    inTreeView = false
  ) => {
    const name = path.split(/[/\\]/).pop() || path;
    const displayName = inTreeView ? name : path; // Show full path in flat view
    const isSelected = selectedFile === path;
    const isConflicted =
      isGitRepo && conflictedFiles.some((cf) => path.endsWith(cf) || cf.endsWith(name));

    return (
      <div
        key={path}
        className={`group flex items-center gap-1.5 py-1 px-2 text-[11px] cursor-pointer transition-colors ${
          isSelected
            ? 'bg-copilot-accent/20 text-copilot-text'
            : isUntracked
              ? 'text-copilot-text-muted/50 hover:bg-copilot-surface'
              : isConflicted
                ? 'text-copilot-error hover:bg-copilot-surface'
                : 'text-copilot-text-muted hover:bg-copilot-surface hover:text-copilot-text'
        }`}
        style={{ paddingLeft }}
        onClick={() => setSelectedFile(path)}
      >
        <FileIcon
          size={12}
          className={`shrink-0 ${
            isUntracked
              ? 'text-copilot-text-muted/50'
              : isConflicted
                ? 'text-copilot-error'
                : 'text-copilot-success'
          }`}
        />
        <span
          className={`truncate font-mono flex-1 ${isUntracked ? 'line-through' : ''}`}
          title={path}
        >
          {displayName}
        </span>
        {isConflicted && <span className="text-[9px] text-copilot-error shrink-0">!</span>}
        {isUntracked && (
          <span className="text-[9px] text-copilot-text-muted shrink-0">(untracked)</span>
        )}
        {(onUntrackFile || onRetrackFile) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isUntracked && onRetrackFile) {
                onRetrackFile(path);
              } else if (!isUntracked && onUntrackFile) {
                onUntrackFile(path);
              }
            }}
            className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text transition-all"
            title={
              isUntracked
                ? 'Retrack file (include in commit)'
                : 'Untrack file (exclude from commit)'
            }
          >
            {isUntracked ? <UnarchiveIcon size={12} /> : <ArchiveIcon size={12} />}
          </button>
        )}
      </div>
    );
  };

  // Render tree node recursively
  const renderTreeNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path);
    const paddingLeft = 12 + level * 16;
    const filePaddingLeft = paddingLeft + 16;

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
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
          {isExpanded && node.children.map((child) => renderTreeNode(child, level + 1))}
        </div>
      );
    }

    const isUntracked = untrackedFiles.includes(node.path);
    return renderFileItem(node.path, isUntracked, filePaddingLeft, true); // inTreeView=true
  };

  return (
    <div
      className="fixed top-[var(--titlebar-height)] left-0 right-0 bottom-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      data-testid="file-preview-modal"
    >
      <div
        className="bg-copilot-surface border border-copilot-border rounded-lg shadow-xl flex flex-col overflow-hidden"
        style={{
          width: isFullOverlay ? '90%' : '80%',
          maxWidth: isFullOverlay ? '1200px' : '900px',
          maxHeight: '85vh',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-copilot-border flex items-center justify-between shrink-0">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2">
              <h3 id="file-preview-title" className="text-sm font-medium text-copilot-text">
                {modalTitle}
              </h3>
              {isFullOverlay && (
                <span className="text-xs text-copilot-text-muted">
                  ({nonUntrackedFiles.length} files
                  {untrackedFilesInList.length > 0
                    ? `, +${untrackedFilesInList.length} untracked`
                    : ''}
                  )
                </span>
              )}
              {!isFullOverlay && (
                <>
                  {!isGitRepo && (
                    <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-copilot-text-muted/20 text-copilot-text-muted rounded">
                      FILE CONTENT
                    </span>
                  )}
                  {fileDiff?.isNew && (
                    <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-green-500/20 text-green-400 rounded">
                      ADDED
                    </span>
                  )}
                  {fileDiff?.isModified && !fileDiff?.isNew && (
                    <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-500/20 text-blue-400 rounded">
                      MODIFIED
                    </span>
                  )}
                </>
              )}
            </div>
            {!isFullOverlay && (
              <p className="text-xs text-copilot-text-muted truncate mt-0.5" title={selectedFile}>
                {selectedFile}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Edit / Save controls */}
            {selectedFile && contentMode === 'diff' && (
              <>
                {editMode && hasUnsavedChanges && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-copilot-accent text-white rounded hover:bg-copilot-accent/80 disabled:opacity-50 transition-colors"
                    title="Save changes (Ctrl/Cmd+S)"
                  >
                    <span>{saving ? 'Saving...' : 'Save'}</span>
                  </button>
                )}
                <button
                  onClick={handleToggleEdit}
                  className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
                    editMode
                      ? 'text-copilot-accent bg-copilot-accent/10 hover:bg-copilot-accent/20'
                      : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-bg'
                  }`}
                  title={editMode ? 'Back to diff view' : 'Edit file'}
                >
                  {editMode ? <EyeIcon size={14} /> : <EditIcon size={14} />}
                  <span>{editMode ? 'Preview' : 'Edit'}</span>
                </button>
              </>
            )}
            {isFullOverlay && onViewModeChange && (
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
              onClick={handleCloseWithCheck}
              className="text-copilot-text-muted hover:text-copilot-text transition-colors p-1"
              aria-label="Close modal"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex min-h-0 min-w-0">
          {/* Left sidebar - File list (only in full overlay mode) */}
          {isFullOverlay && (
            <div className="w-64 shrink-0 border-r border-copilot-border flex flex-col bg-copilot-surface">
              <div className="flex-1 overflow-y-auto">
                {/* Non-untracked files */}
                {fileViewMode === 'tree' ? (
                  <div className="py-1">
                    {buildFileTree(nonUntrackedFiles).map((node) => renderTreeNode(node))}
                  </div>
                ) : (
                  <div className="py-1">
                    {nonUntrackedFiles.map((path) => renderFileItem(path, false, 12, false))}
                  </div>
                )}

                {/* Untracked files section */}
                {untrackedFilesInList.length > 0 && (
                  <div className="border-t border-copilot-border mt-2 pt-2">
                    <div className="px-3 py-1 text-[10px] font-semibold text-copilot-text-muted uppercase tracking-wider">
                      Untracked ({untrackedFilesInList.length})
                    </div>
                    {fileViewMode === 'tree' ? (
                      <div className="py-1">
                        {buildFileTree(untrackedFilesInList).map((node) => renderTreeNode(node))}
                      </div>
                    ) : (
                      <div className="py-1">
                        {untrackedFilesInList.map((path) => renderFileItem(path, true, 12, false))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right panel - Diff/Content view */}
          <div className="flex-1 flex flex-col min-w-0 bg-copilot-bg">
            {/* File info bar (in full overlay mode) */}
            {isFullOverlay && selectedFile && (
              <div className="px-4 py-2 border-b border-copilot-border bg-copilot-surface flex items-center gap-2">
                <span className="text-xs font-medium text-copilot-text truncate">
                  {selectedFile.split(/[/\\]/).pop()}
                </span>
                {fileDiff?.isNew && (
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-green-500/20 text-green-400 rounded">
                    ADDED
                  </span>
                )}
                {fileDiff?.isModified && !fileDiff?.isNew && (
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-500/20 text-blue-400 rounded">
                    MODIFIED
                  </span>
                )}
                {(fileDiff?.linesAdded || fileDiff?.linesRemoved) && (
                  <span className="text-[10px] text-copilot-text-muted">
                    {fileDiff.linesAdded > 0 && (
                      <span className="text-green-400">+{fileDiff.linesAdded}</span>
                    )}
                    {fileDiff.linesAdded > 0 && fileDiff.linesRemoved > 0 && ' '}
                    {fileDiff.linesRemoved > 0 && (
                      <span className="text-red-400">-{fileDiff.linesRemoved}</span>
                    )}
                  </span>
                )}
                <span
                  className="text-[10px] text-copilot-text-muted truncate ml-auto"
                  title={selectedFile}
                >
                  {selectedFile}
                </span>
                {editMode && (
                  <span className="text-[9px] font-semibold text-copilot-accent shrink-0">
                    EDITING{hasUnsavedChanges ? ' •' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Save error banner */}
            {saveError && (
              <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs">
                {saveError}
              </div>
            )}

            {/* Editor / Diff content */}
            {editMode && selectedFile ? (
              <div className="flex-1 flex min-h-0 min-w-0">
                {/* Line numbers gutter */}
                <div
                  className="shrink-0 pt-4 pb-4 pl-3 pr-2 text-right select-none bg-copilot-bg border-r border-copilot-border overflow-hidden"
                  aria-hidden="true"
                >
                  {editContent.split('\n').map((_, i) => (
                    <div
                      key={i}
                      className="font-mono text-[11px] leading-relaxed text-copilot-text-muted/50"
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    // Ctrl/Cmd+S to save
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                      e.preventDefault();
                      handleSave();
                    }
                    // Tab inserts two spaces
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const target = e.target as HTMLTextAreaElement;
                      const start = target.selectionStart;
                      const end = target.selectionEnd;
                      const newValue =
                        editContent.substring(0, start) + '  ' + editContent.substring(end);
                      setEditContent(newValue);
                      requestAnimationFrame(() => {
                        target.selectionStart = target.selectionEnd = start + 2;
                      });
                    }
                  }}
                  className="flex-1 p-4 pl-3 bg-copilot-bg text-copilot-text font-mono text-[11px] leading-relaxed resize-none focus:outline-none overflow-auto"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-4 min-h-0 min-w-0">
                {!selectedFile ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <p className="text-copilot-text-muted text-sm">Select a file to preview</p>
                  </div>
                ) : loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Spinner size={24} />
                  </div>
                ) : contentMode === 'diff' && fileDiff?.success && fileDiff?.diff ? (
                  <div className="text-xs leading-relaxed">{renderDiff(fileDiff.diff)}</div>
                ) : fileContent?.success && fileContent?.content !== undefined ? (
                  isMarkdownView ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <div className="text-copilot-text">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => (
                              <h1 className="text-xl font-semibold text-copilot-text mb-3">
                                {children}
                              </h1>
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
                              <p className="text-copilot-text-muted text-sm leading-6 mb-3">
                                {children}
                              </p>
                            ),
                            strong: ({ children }) => (
                              <strong className="text-copilot-text font-semibold">
                                {children}
                              </strong>
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
                            thead: ({ children }) => (
                              <thead className="bg-copilot-bg/50">{children}</thead>
                            ),
                            tbody: ({ children }) => <tbody>{children}</tbody>,
                            tr: ({ children }) => (
                              <tr className="border-b border-copilot-border">{children}</tr>
                            ),
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
                                <code className="text-[11px] font-mono text-copilot-text">
                                  {children}
                                </code>
                              ),
                            pre: ({ children }) => (
                              <pre className="bg-copilot-bg/70 border border-copilot-border rounded p-3 overflow-auto">
                                {children}
                              </pre>
                            ),
                          }}
                        >
                          {fileContent.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <pre className="font-mono text-[11px] leading-relaxed text-copilot-text whitespace-pre-wrap break-words">
                      {fileContent.content}
                    </pre>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <p className="text-copilot-text-muted text-sm mb-2">
                      ⚠️{' '}
                      {isGitRepo && !isMarkdownView ? 'Error loading diff' : 'Error loading file'}
                    </p>
                    <p className="text-copilot-text-muted text-xs">
                      {fileDiff?.error || fileContent?.error || 'Unknown error'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
