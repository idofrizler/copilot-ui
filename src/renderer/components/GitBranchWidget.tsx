import React, { useState, useEffect, useRef } from 'react';

interface GitBranchWidgetProps {
  cwd?: string;
  refreshKey?: number;
  onBranchChange?: () => void;
}

export const GitBranchWidget: React.FC<GitBranchWidgetProps> = ({
  cwd,
  refreshKey,
  onBranchChange,
}) => {
  const [branch, setBranch] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWorktree, setIsWorktree] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cwd) {
      setBranch(null);
      setError(null);
      setIsWorktree(false);
      return;
    }

    const fetchBranch = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await window.electronAPI.git.getBranch(cwd);
        if (result.success && result.branch) {
          setBranch(result.branch);
        } else {
          setBranch(null);
          if (!result.success) {
            setError('Not a git repository');
          }
        }

        // Check if this is a worktree session
        const worktreeSession = await window.electronAPI.worktree.findSession({
          repoPath: cwd,
          branch: result.branch || '',
        });
        // Also check if cwd itself is a worktree path
        const isWorktreePath = cwd.includes('.copilot-sessions');
        setIsWorktree(!!worktreeSession || isWorktreePath);
      } catch (err) {
        console.error('Failed to get git branch:', err);
        setError('Failed to get branch');
        setBranch(null);
        setIsWorktree(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBranch();
  }, [cwd, refreshKey]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setBranchFilter('');
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Focus the filter input when dropdown opens
      setTimeout(() => filterInputRef.current?.focus(), 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleBranchClick = async () => {
    if (!cwd || isWorktree) return;

    setIsDropdownOpen(!isDropdownOpen);
    setBranchFilter('');

    if (!isDropdownOpen) {
      // Fetch branches when opening dropdown
      setIsLoadingBranches(true);
      try {
        const result = await window.electronAPI.git.listBranches(cwd);
        if (result.success && result.branches) {
          setBranches(result.branches);
        }
      } catch (err) {
        console.error('Failed to list branches:', err);
      } finally {
        setIsLoadingBranches(false);
      }
    }
  };

  const handleSwitchBranch = async (targetBranch: string) => {
    if (!cwd || targetBranch === branch) {
      setIsDropdownOpen(false);
      setBranchFilter('');
      return;
    }

    setIsSwitching(true);
    try {
      const result = await window.electronAPI.git.switchBranch(cwd, targetBranch);
      if (result.success) {
        setBranch(targetBranch);
        onBranchChange?.();
      } else {
        console.error('Failed to switch branch:', result.error);
        // Show user-friendly error message
        let errorMsg = 'Failed to switch branch';
        if (result.error?.includes('uncommitted') || result.error?.includes('overwritten')) {
          errorMsg =
            'Cannot switch: you have uncommitted changes. Please commit or stash them first.';
        } else if (result.error?.includes('not found') || result.error?.includes('did not match')) {
          errorMsg = `Branch "${targetBranch}" not found`;
        }
        alert(errorMsg);
      }
    } catch (err) {
      console.error('Failed to switch branch:', err);
      alert('Failed to switch branch. See console for details.');
    } finally {
      setIsSwitching(false);
      setIsDropdownOpen(false);
      setBranchFilter('');
    }
  };

  const filteredBranches = branches.filter((b) =>
    b.toLowerCase().includes(branchFilter.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-xs text-copilot-text-muted min-w-0">
        <svg
          className="w-3 h-3 animate-spin shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
        <span className="truncate">Loading...</span>
      </div>
    );
  }

  if (error || !branch) {
    return (
      <div
        className="text-xs text-copilot-text-muted min-w-0 truncate"
        title={error || 'Not a git repository'}
      >
        {error || 'Not a git repository'}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={`flex items-center gap-1.5 text-xs min-w-0 ${!isWorktree ? 'cursor-pointer hover:bg-copilot-surface-hover rounded px-1 -mx-1 py-0.5' : ''}`}
        data-testid="git-branch-widget"
        onClick={handleBranchClick}
        title={isWorktree ? branch : `${branch} - Click to switch branch`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-copilot-accent shrink-0"
        >
          <path d="M6 3v12" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="15" r="3" />
          <path d="M18 9a9 9 0 01-9 9" />
        </svg>
        <span className="text-copilot-text font-mono truncate">
          {isSwitching ? 'Switching...' : branch}
        </span>
        {isWorktree && (
          <span
            className="px-1.5 py-0.5 bg-copilot-accent/20 text-copilot-accent rounded text-[10px] font-medium shrink-0"
            title="This session is running in an isolated worktree"
          >
            worktree
          </span>
        )}
        {!isWorktree && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-copilot-text-muted shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </div>

      {isDropdownOpen && !isWorktree && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-copilot-surface border border-copilot-border rounded-md shadow-lg min-w-[200px] max-w-[300px] max-h-[300px] overflow-hidden flex flex-col">
          <div className="p-2 border-b border-copilot-border">
            <input
              ref={filterInputRef}
              type="text"
              placeholder="Filter branches..."
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-copilot-bg border border-copilot-border rounded text-copilot-text placeholder-copilot-text-muted focus:outline-none focus:border-copilot-accent"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsDropdownOpen(false);
                  setBranchFilter('');
                } else if (e.key === 'Enter' && filteredBranches.length === 1) {
                  handleSwitchBranch(filteredBranches[0]);
                }
              }}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {isLoadingBranches ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4">
                <svg
                  className="w-4 h-4 animate-spin text-copilot-accent"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                <span className="text-xs text-copilot-text-muted">Loading branches...</span>
              </div>
            ) : filteredBranches.length === 0 ? (
              <div className="px-3 py-2 text-xs text-copilot-text-muted">No branches found</div>
            ) : (
              filteredBranches.map((b) => (
                <button
                  key={b}
                  onClick={() => handleSwitchBranch(b)}
                  disabled={isSwitching}
                  className={`w-full px-3 py-1.5 text-xs text-left font-mono truncate hover:bg-copilot-surface-hover disabled:opacity-50 ${
                    b === branch ? 'bg-copilot-accent/10 text-copilot-accent' : 'text-copilot-text'
                  }`}
                  title={b}
                >
                  {b === branch && <span className="mr-1.5">✓</span>}
                  {b}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
