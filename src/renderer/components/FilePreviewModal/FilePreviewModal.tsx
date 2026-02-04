import React, { useEffect, useState, useCallback } from 'react'
import { 
  CloseIcon, 
  ExternalLinkIcon, 
  ListIcon, 
  TreeIcon, 
  FileIcon, 
  FolderIcon, 
  FolderOpenIcon,
  ChevronRightIcon,
  ArchiveIcon,
  UnarchiveIcon
} from '../Icons'
import { Spinner } from '../Spinner'

export interface FilePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  filePath: string
  cwd?: string
  isGitRepo?: boolean
  // New props for full files preview overlay
  editedFiles?: string[]
  untrackedFiles?: string[]
  conflictedFiles?: string[]
  fileViewMode?: 'flat' | 'tree'
  onUntrackFile?: (filePath: string) => void
  onRetrackFile?: (filePath: string) => void
  onViewModeChange?: (mode: 'flat' | 'tree') => void
}

interface FileContent {
  success: boolean
  content?: string
  fileSize?: number
  fileName?: string
  error?: string
  errorType?: 'not_found' | 'too_large' | 'binary' | 'read_error'
}

interface FileDiff {
  success: boolean
  diff?: string
  error?: string
  isNew?: boolean
  isModified?: boolean
  linesAdded?: number
  linesRemoved?: number
}

// File tree node interface for tree view
interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: FileTreeNode[]
}

// Build a tree structure from flat file paths
const buildFileTree = (files: string[]): FileTreeNode[] => {
  const root: FileTreeNode[] = []
  const sortedFiles = [...files].sort((a, b) => a.localeCompare(b))
  
  for (const filePath of sortedFiles) {
    const normalizedPath = filePath.replace(/\\/g, '/')
    const parts = normalizedPath.split('/')
    let currentLevel = root
    let currentPath = ''
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLastPart = i === parts.length - 1
      
      let existingNode = currentLevel.find(n => n.name === part)
      
      if (!existingNode) {
        const newNode: FileTreeNode = {
          name: part,
          path: isLastPart ? filePath : currentPath,
          isDirectory: !isLastPart,
          children: [],
        }
        currentLevel.push(newNode)
        existingNode = newNode
      }
      
      if (!isLastPart) {
        currentLevel = existingNode.children
      }
    }
  }
  
  return root
}

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
  onUntrackFile,
  onRetrackFile,
  onViewModeChange,
}) => {
  const [loading, setLoading] = useState(true)
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null)
  const [fileContent, setFileContent] = useState<FileContent | null>(null)
  const [selectedFile, setSelectedFile] = useState<string>(initialFilePath)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Determine if this is a full overlay (multiple files) or single file preview
  const isFullOverlay = editedFiles.length > 0

  // Initialize expanded folders when tree view is active
  useEffect(() => {
    if (fileViewMode === 'tree' && editedFiles.length > 0) {
      const allFolders = new Set<string>()
      const collectFolders = (nodes: FileTreeNode[]) => {
        for (const node of nodes) {
          if (node.isDirectory) {
            allFolders.add(node.path)
            collectFolders(node.children)
          }
        }
      }
      collectFolders(buildFileTree(editedFiles))
      setExpandedFolders(allFolders)
    }
  }, [fileViewMode, editedFiles])

  // Update selected file when initial file path changes
  useEffect(() => {
    if (initialFilePath) {
      setSelectedFile(initialFilePath)
    }
  }, [initialFilePath])

  const loadFileContent = useCallback(async () => {
    if (!selectedFile || !cwd) return
    
    setLoading(true)
    try {
      if (isGitRepo) {
        const result = await window.electronAPI.git.getDiff(cwd, [selectedFile])
        
        if (result.success && result.diff) {
          const diffLines = result.diff.split('\n')
          let linesAdded = 0
          let linesRemoved = 0
          let isNew = false
          
          for (const line of diffLines) {
            if (line.startsWith('new file mode')) {
              isNew = true
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
              linesAdded++
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              linesRemoved++
            }
          }
          
          setFileDiff({
            success: true,
            diff: result.diff,
            isNew,
            isModified: !isNew && (linesAdded > 0 || linesRemoved > 0),
            linesAdded,
            linesRemoved,
          })
          setFileContent(null)
        } else {
          // No diff available (e.g., untracked new file) - fall back to file content
          const absolutePath = !filePath.startsWith('/') && !filePath.match(/^[a-zA-Z]:/)
            ? `${cwd}/${filePath}`
            : filePath
          const contentResult = await window.electronAPI.file.readContent(absolutePath)
          if (contentResult.success) {
            setFileContent(contentResult)
            setFileDiff({ success: true, isNew: true, linesAdded: contentResult.content?.split('\n').length || 0, linesRemoved: 0 })
          } else {
            setFileDiff({
              success: false,
              error: result.error || contentResult.error || 'Failed to load file',
            })
            setFileContent(null)
          }
        }
      } else {
        const result = await window.electronAPI.file.readContent(selectedFile)
        setFileContent(result)
        setFileDiff(null)
      }
    } catch (error) {
      if (isGitRepo) {
        setFileDiff({
          success: false,
          error: `Failed to load file diff: ${String(error)}`,
        })
      } else {
        setFileContent({
          success: false,
          error: `Failed to load file content: ${String(error)}`,
        })
      }
    } finally {
      setLoading(false)
    }
  }, [selectedFile, cwd, isGitRepo])

  useEffect(() => {
    if (isOpen && selectedFile) {
      loadFileContent()
    }
  }, [isOpen, selectedFile, loadFileContent])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleRevealInFolder = async () => {
    try {
      await window.electronAPI.file.revealInFolder(selectedFile)
    } catch (error) {
      console.error('Failed to reveal in folder:', error)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }, [])

  if (!isOpen) return null

  const fileName = selectedFile?.split(/[/\\]/).pop() || selectedFile || 'No file selected'
  const nonUntrackedFiles = editedFiles.filter(f => !untrackedFiles.includes(f))
  const untrackedFilesInList = editedFiles.filter(f => untrackedFiles.includes(f))

  const renderDiff = (diff: string) => {
    const lines = diff.split('\n')
    return lines.map((line, index) => {
      let className = 'font-mono text-[11px] leading-relaxed'
      
      if (line.startsWith('+++') || line.startsWith('---')) {
        className += ' text-copilot-text-muted font-semibold'
      } else if (line.startsWith('+')) {
        className += ' bg-green-500/10 text-green-400'
      } else if (line.startsWith('-')) {
        className += ' bg-red-500/10 text-red-400'
      } else if (line.startsWith('@@')) {
        className += ' text-copilot-accent font-semibold'
      } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('new file mode')) {
        className += ' text-copilot-text-muted text-[10px]'
      } else {
        className += ' text-copilot-text'
      }
      
      return (
        <div key={index} className={className}>
          {line || '\u00A0'}
        </div>
      )
    })
  }

  // Render a single file item in the sidebar
  // When inTreeView=true, show only filename; when false (flat view), show full path
  const renderFileItem = (path: string, isUntracked: boolean, paddingLeft = 12, inTreeView = false) => {
    const name = path.split(/[/\\]/).pop() || path
    const displayName = inTreeView ? name : path  // Show full path in flat view
    const isSelected = selectedFile === path
    const isConflicted = isGitRepo && conflictedFiles.some(cf => 
      path.endsWith(cf) || cf.endsWith(name)
    )

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
        <span className={`truncate font-mono flex-1 ${isUntracked ? 'line-through' : ''}`} title={path}>
          {displayName}
        </span>
        {isConflicted && <span className="text-[9px] text-copilot-error shrink-0">!</span>}
        {isUntracked && <span className="text-[9px] text-copilot-text-muted shrink-0">(untracked)</span>}
        {(onUntrackFile || onRetrackFile) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (isUntracked && onRetrackFile) {
                onRetrackFile(path)
              } else if (!isUntracked && onUntrackFile) {
                onUntrackFile(path)
              }
            }}
            className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text transition-all"
            title={isUntracked ? 'Retrack file (include in commit)' : 'Untrack file (exclude from commit)'}
          >
            {isUntracked ? <UnarchiveIcon size={12} /> : <ArchiveIcon size={12} />}
          </button>
        )}
      </div>
    )
  }

  // Render tree node recursively
  const renderTreeNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path)
    const paddingLeft = 12 + level * 16

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
          {isExpanded && node.children.map(child => renderTreeNode(child, level + 1))}
        </div>
      )
    }

    const isUntracked = untrackedFiles.includes(node.path)
    return renderFileItem(node.path, isUntracked, paddingLeft, true)  // inTreeView=true
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      data-testid="file-preview-modal"
    >
      <div
        className="bg-copilot-surface border border-copilot-border rounded-lg shadow-xl flex flex-col overflow-hidden"
        style={{ 
          width: isFullOverlay ? '90%' : '80%', 
          maxWidth: isFullOverlay ? '1200px' : '900px', 
          maxHeight: '85vh' 
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
        data-clarity-mask="true"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-copilot-border flex items-center justify-between shrink-0">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2">
              <h3 id="file-preview-title" className="text-sm font-medium text-copilot-text">
                {isFullOverlay ? 'Files Preview' : fileName}
              </h3>
              {isFullOverlay && (
                <span className="text-xs text-copilot-text-muted">
                  ({nonUntrackedFiles.length} files{untrackedFilesInList.length > 0 ? `, +${untrackedFilesInList.length} untracked` : ''})
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
              onClick={onClose}
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
                    {buildFileTree(nonUntrackedFiles).map(node => renderTreeNode(node))}
                  </div>
                ) : (
                  <div className="py-1">
                    {nonUntrackedFiles.map(path => renderFileItem(path, false, 12, false))}
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
                        {buildFileTree(untrackedFilesInList).map(node => renderTreeNode(node))}
                      </div>
                    ) : (
                      <div className="py-1">
                        {untrackedFilesInList.map(path => renderFileItem(path, true, 12, false))}
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
                <span className="text-[10px] text-copilot-text-muted truncate ml-auto" title={selectedFile}>
                  {selectedFile}
                </span>
              </div>
            )}

            {/* Diff content */}
            <div className="flex-1 overflow-auto p-4 min-h-0 min-w-0">
              {!selectedFile ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-copilot-text-muted text-sm">
                    Select a file to preview
                  </p>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center h-32">
                  <Spinner size={24} />
                </div>
              ) : fileDiff?.success && fileDiff?.diff ? (
                <div className="text-xs leading-relaxed">
                  {renderDiff(fileDiff.diff)}
                </div>
              ) : fileContent?.success && fileContent?.content !== undefined ? (
                <pre className="font-mono text-[11px] leading-relaxed text-copilot-text whitespace-pre-wrap break-words">
                  {fileContent.content}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <p className="text-copilot-text-muted text-sm mb-2">
                    ⚠️ {isGitRepo ? 'Error loading diff' : 'Error loading file'}
                  </p>
                  <p className="text-copilot-text-muted text-xs">
                    {fileDiff?.error || fileContent?.error || 'Unknown error'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FilePreviewModal
