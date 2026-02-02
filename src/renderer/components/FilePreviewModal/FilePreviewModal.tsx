import React, { useEffect, useState, useCallback } from 'react'
import { CloseIcon, ExternalLinkIcon } from '../Icons'
import { Spinner } from '../Spinner'

export interface FilePreviewModalProps {
  isOpen: boolean
  onClose: () => void
  filePath: string
  cwd?: string
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

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  onClose,
  filePath,
  cwd,
}) => {
  const [loading, setLoading] = useState(true)
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null)

  const loadFileContent = useCallback(async () => {
    if (!filePath || !cwd) return
    
    setLoading(true)
    try {
      // Get the diff for this file
      const result = await window.electronAPI.git.getDiff(cwd, [filePath])
      
      if (result.success && result.diff) {
        // Parse the diff to extract metadata
        const diffLines = result.diff.split('\n')
        let linesAdded = 0
        let linesRemoved = 0
        let isNew = false
        
        // Check if it's a new file or modified file
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
      } else {
        setFileDiff({
          success: false,
          error: result.error || 'Failed to load diff',
        })
      }
    } catch (error) {
      setFileDiff({
        success: false,
        error: `Failed to load file diff: ${String(error)}`,
      })
    } finally {
      setLoading(false)
    }
  }, [filePath, cwd])

  useEffect(() => {
    if (isOpen && filePath) {
      loadFileContent()
    }
  }, [isOpen, filePath, loadFileContent])

  // Handle escape key
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
      await window.electronAPI.file.revealInFolder(filePath)
    } catch (error) {
      console.error('Failed to reveal in folder:', error)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  const fileName = filePath.split(/[/\\]/).pop() || filePath

  // Helper function to render diff with colors
  const renderDiff = (diff: string) => {
    const lines = diff.split('\n')
    return lines.map((line, index) => {
      let className = 'font-mono text-[11px] leading-relaxed'
      let displayLine = line
      
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
          {displayLine || '\u00A0'}
        </div>
      )
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      data-testid="file-preview-modal"
    >
      <div
        className="bg-copilot-surface border border-copilot-border rounded-lg shadow-xl flex flex-col overflow-hidden"
        style={{ width: '80%', maxWidth: '900px', maxHeight: '80vh' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-copilot-border flex items-center justify-between shrink-0">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2">
              <h3 id="file-preview-title" className="text-sm font-medium text-copilot-text truncate">
                {fileName}
              </h3>
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
            </div>
            <p className="text-xs text-copilot-text-muted truncate mt-0.5" title={filePath}>
              {filePath}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRevealInFolder}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-bg rounded transition-colors"
              title="Reveal in Folder"
            >
              <ExternalLinkIcon size={14} />
              <span>Reveal in Folder</span>
            </button>
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
        <div className="flex-1 overflow-auto p-4 min-h-0 min-w-0 bg-copilot-bg">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Spinner size={24} />
            </div>
          ) : fileDiff?.success && fileDiff?.diff ? (
            <div className="text-xs leading-relaxed">
              {renderDiff(fileDiff.diff)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <p className="text-copilot-text-muted text-sm mb-2">
                ⚠️ Error loading diff
              </p>
              <p className="text-copilot-text-muted text-xs">
                {fileDiff?.error || 'Unknown error'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default FilePreviewModal
