import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Spinner } from '../Spinner';
import {
  RalphIcon,
  LisaIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
} from '../Icons/Icons';
import { ContextBuilderModal } from './ContextBuilderModal';
import type { ModelInfo } from '../../types';
import type {
  AgentMode,
  EvaluationConfig,
  EvaluationContext,
  DetectedInstructionFile,
} from '../../types/evaluation';

interface EvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoPath: string;
  availableModels: ModelInfo[];
  onStartEvaluation: (config: EvaluationConfig) => void;
}

export const EvaluationModal: React.FC<EvaluationModalProps> = ({
  isOpen,
  onClose,
  repoPath,
  availableModels,
  onStartEvaluation,
}) => {
  const [branchPrefix, setBranchPrefix] = useState('');
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState('');
  const [agentMode, setAgentMode] = useState<AgentMode>('default');
  const [ralphMaxIterations, setRalphMaxIterations] = useState(20);
  const [completeWithoutInput, setCompleteWithoutInput] = useState(true);
  const [ensureTestsPass, setEnsureTestsPass] = useState(true);
  const [commitChanges, setCommitChanges] = useState(false);
  const [pushChanges, setPushChanges] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Context/Instructions state
  const [showInstructions, setShowInstructions] = useState(false);
  const [detectedFiles, setDetectedFiles] = useState<DetectedInstructionFile[]>([]);
  const [homeInstructionsPath, setHomeInstructionsPath] = useState<string | null>(null);
  const [useDefaultContext, setUseDefaultContext] = useState(true);
  const [customContexts, setCustomContexts] = useState<EvaluationContext[]>([]);
  const [showContextBuilder, setShowContextBuilder] = useState(false);
  const [contextCounter, setContextCounter] = useState(1);

  useEffect(() => {
    if (isOpen) {
      setBranchPrefix('');
      setSelectedModels(new Set());
      setPrompt('');
      setAgentMode('default');
      setRalphMaxIterations(20);
      setCompleteWithoutInput(true);
      setEnsureTestsPass(true);
      setCommitChanges(false);
      setPushChanges(false);
      setIsStarting(false);
      setError(null);
      setShowInstructions(false);
      setDetectedFiles([]);
      setHomeInstructionsPath(null);
      setUseDefaultContext(true);
      setCustomContexts([]);
      setShowContextBuilder(false);
      setContextCounter(1);
    }
  }, [isOpen]);

  // Scan for existing instruction files when instructions section is expanded
  useEffect(() => {
    if (showInstructions && repoPath) {
      window.electronAPI.evaluation.getRepoInstructions(repoPath).then((result) => {
        setDetectedFiles(result.files as DetectedInstructionFile[]);
      });
      window.electronAPI.evaluation.getHomeInstructions().then((result) => {
        setHomeInstructionsPath(result.exists ? result.path : null);
      });
    }
  }, [showInstructions, repoPath]);

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const activeContextCount = (useDefaultContext ? 1 : 0) + customContexts.length;

  const totalWorktrees = selectedModels.size * Math.max(activeContextCount, 1);

  const canStart = branchPrefix.trim() && selectedModels.size > 0 && prompt.trim() && !isStarting;

  const handleStart = async () => {
    if (!canStart) return;

    setIsStarting(true);
    setError(null);

    try {
      onStartEvaluation({
        models: Array.from(selectedModels),
        prompt: prompt.trim(),
        repoPath,
        branchPrefix: branchPrefix.trim(),
        agentMode,
        ralphMaxIterations,
        completeWithoutInput,
        ensureTestsPass,
        commitChanges,
        pushChanges,
        contexts: customContexts,
        useDefaultContext,
      });
      onClose();
    } catch (err) {
      setError(String(err));
      setIsStarting(false);
    }
  };

  const handleAddContext = (context: EvaluationContext) => {
    setCustomContexts((prev) => [...prev, context]);
    setContextCounter((prev) => prev + 1);
  };

  const handleRemoveContext = (contextId: string) => {
    setCustomContexts((prev) => prev.filter((c) => c.id !== contextId));
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Evaluation" width="500px">
        <div className="max-h-[70vh] overflow-y-auto">
          <Modal.Body>
            {/* Repository */}
            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-1">Repository</label>
              <div className="text-sm text-copilot-text font-mono truncate bg-copilot-bg px-2 py-1.5 rounded border border-copilot-border">
                {repoPath}
              </div>
            </div>

            {/* Branch Prefix */}
            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-1">Branch Name</label>
              <input
                type="text"
                value={branchPrefix}
                onChange={(e) => setBranchPrefix(e.target.value)}
                placeholder="eval/my-feature"
                className="w-full px-3 py-2 bg-copilot-bg border border-copilot-border rounded text-sm text-copilot-text placeholder:text-copilot-text-muted focus:outline-none focus:border-copilot-accent"
                autoFocus
                disabled={isStarting}
              />
              <p className="text-xs text-copilot-text-muted mt-1">
                Each model gets a branch: {branchPrefix.trim() || 'eval/my-feature'}-model-name
              </p>
            </div>

            {/* Model Selection */}
            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-1">
                Models ({selectedModels.size} selected)
              </label>
              <div className="max-h-48 overflow-y-auto border border-copilot-border rounded bg-copilot-bg">
                {availableModels.map((model) => (
                  <label
                    key={model.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-copilot-surface-hover cursor-pointer border-b border-copilot-border last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels.has(model.id)}
                      onChange={() => toggleModel(model.id)}
                      className="w-4 h-4 accent-copilot-accent"
                      disabled={isStarting}
                    />
                    <span className="text-sm text-copilot-text">{model.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Agent Mode */}
            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-1">
                Agent Mode <span className="opacity-60">(optional)</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAgentMode('default')}
                  disabled={isStarting}
                  className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg border transition-all text-sm ${
                    agentMode === 'default'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                      : 'bg-copilot-bg border-copilot-border text-copilot-text-muted hover:border-copilot-border-hover'
                  }`}
                >
                  Default
                </button>
                <button
                  type="button"
                  onClick={() => setAgentMode('ralph')}
                  disabled={isStarting}
                  className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg border transition-all text-sm ${
                    agentMode === 'ralph'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                      : 'bg-copilot-bg border-copilot-border text-copilot-text-muted hover:border-copilot-border-hover'
                  }`}
                >
                  <RalphIcon size={16} />
                  Ralph
                </button>
                <button
                  type="button"
                  onClick={() => setAgentMode('lisa')}
                  disabled={isStarting}
                  className={`flex items-center justify-center gap-1 px-3 py-2 rounded-lg border transition-all text-sm ${
                    agentMode === 'lisa'
                      ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                      : 'bg-copilot-bg border-copilot-border text-copilot-text-muted hover:border-copilot-border-hover'
                  }`}
                >
                  <LisaIcon size={16} />
                  Lisa
                </button>
              </div>
              {agentMode === 'ralph' && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-copilot-text-muted">Max iterations:</span>
                  <input
                    type="number"
                    value={ralphMaxIterations}
                    onChange={(e) =>
                      setRalphMaxIterations(
                        Math.max(1, Math.min(100, parseInt(e.target.value) || 1))
                      )
                    }
                    className="w-14 bg-copilot-bg border border-copilot-border rounded px-2 py-1 text-xs text-copilot-text"
                    min={1}
                    max={100}
                    disabled={isStarting}
                  />
                </div>
              )}
            </div>

            {/* Prompt */}
            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-1">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the task for the models to work on..."
                className="w-full px-3 py-2 bg-copilot-bg border border-copilot-border rounded text-sm text-copilot-text placeholder:text-copilot-text-muted focus:outline-none focus:border-copilot-accent resize-y min-h-[80px]"
                rows={4}
                disabled={isStarting}
              />
            </div>

            {/* Completion Options */}
            <div className="mb-4">
              <label className="block text-xs text-copilot-text-muted mb-2">
                Completion Options
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={completeWithoutInput}
                    onChange={(e) => setCompleteWithoutInput(e.target.checked)}
                    className="w-4 h-4 accent-copilot-accent"
                    disabled={isStarting}
                  />
                  <span className="text-sm text-copilot-text">
                    Complete without asking for input
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ensureTestsPass}
                    onChange={(e) => setEnsureTestsPass(e.target.checked)}
                    className="w-4 h-4 accent-copilot-accent"
                    disabled={isStarting}
                  />
                  <span className="text-sm text-copilot-text">Ensure tests pass</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={commitChanges}
                    onChange={(e) => {
                      setCommitChanges(e.target.checked);
                      if (!e.target.checked) setPushChanges(false);
                    }}
                    className="w-4 h-4 accent-copilot-accent"
                    disabled={isStarting}
                  />
                  <span className="text-sm text-copilot-text">Commit changes when completed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushChanges}
                    onChange={(e) => {
                      setPushChanges(e.target.checked);
                      if (e.target.checked) setCommitChanges(true);
                    }}
                    className="w-4 h-4 accent-copilot-accent"
                    disabled={isStarting}
                  />
                  <span className="text-sm text-copilot-text">Push changes</span>
                </label>
              </div>
            </div>

            {/* Custom Instructions Section */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowInstructions(!showInstructions)}
                className="flex items-center gap-1 text-xs text-copilot-text-muted hover:text-copilot-text"
              >
                {showInstructions ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                Custom Instructions {activeContextCount > 1 && `(${activeContextCount} contexts)`}
              </button>

              {showInstructions && (
                <div className="mt-2 space-y-3">
                  {/* Home instructions warning */}
                  {homeInstructionsPath && (
                    <div className="text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
                      ⚠ Home instructions found at{' '}
                      <span className="font-mono">{homeInstructionsPath}</span> — this file will be
                      used in all evaluations.
                    </div>
                  )}

                  {/* Default context */}
                  <div className="border border-copilot-border rounded bg-copilot-bg">
                    <div className="flex items-center justify-between px-3 py-2">
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={useDefaultContext}
                          onChange={(e) => setUseDefaultContext(e.target.checked)}
                          className="w-4 h-4 accent-copilot-accent"
                          disabled={isStarting}
                        />
                        <span className="text-sm text-copilot-text">Default (repo files)</span>
                      </label>
                    </div>
                    {useDefaultContext && detectedFiles.length > 0 && (
                      <div className="px-3 pb-2 border-t border-copilot-border pt-2">
                        {detectedFiles.map((file) => (
                          <div
                            key={file.path}
                            className="text-xs text-copilot-text-muted font-mono truncate"
                          >
                            {file.path}
                          </div>
                        ))}
                      </div>
                    )}
                    {useDefaultContext && detectedFiles.length === 0 && (
                      <div className="px-3 pb-2 border-t border-copilot-border pt-2">
                        <span className="text-xs text-copilot-text-muted">
                          No instruction files found in repo
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Custom contexts */}
                  {customContexts.map((ctx) => (
                    <div
                      key={ctx.id}
                      className="border border-copilot-border rounded bg-copilot-bg"
                    >
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex-1">
                          <span className="text-sm text-copilot-text">{ctx.name}</span>
                          <span className="text-xs text-copilot-text-muted ml-2">
                            {ctx.files.length} file{ctx.files.length !== 1 ? 's' : ''}
                            {ctx.overrideExisting && ' · overrides repo'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveContext(ctx.id)}
                          className="p-1 text-copilot-text-muted hover:text-copilot-error transition-colors"
                          title="Remove context"
                        >
                          <CloseIcon size={12} />
                        </button>
                      </div>
                      <div className="px-3 pb-2 border-t border-copilot-border pt-2">
                        {ctx.files.map((file, i) => (
                          <div
                            key={i}
                            className="text-xs text-copilot-text-muted font-mono truncate"
                          >
                            {file.name}{' '}
                            <span className="opacity-60">
                              ({file.isPathSpecific ? 'path-specific' : 'global'})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Add context button */}
                  <Button
                    variant="secondary"
                    onClick={() => setShowContextBuilder(true)}
                    disabled={isStarting}
                  >
                    <PlusIcon size={14} /> Add Context
                  </Button>

                  {/* Worktree count info */}
                  {activeContextCount > 1 && selectedModels.size > 0 && (
                    <div className="text-xs text-copilot-text-muted">
                      {selectedModels.size} model{selectedModels.size !== 1 ? 's' : ''} ×{' '}
                      {activeContextCount} context{activeContextCount !== 1 ? 's' : ''} ={' '}
                      {totalWorktrees} worktree{totalWorktrees !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="text-copilot-error text-sm mb-4 p-3 bg-copilot-error-muted rounded">
                {error}
              </div>
            )}
          </Modal.Body>
        </div>
        <Modal.Body className="pt-0">
          <Modal.Footer>
            <Button variant="secondary" onClick={onClose} disabled={isStarting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleStart} disabled={!canStart}>
              {isStarting ? (
                <>
                  <Spinner /> Starting...
                </>
              ) : (
                `Start Evaluation (${totalWorktrees} worktree${totalWorktrees !== 1 ? 's' : ''})`
              )}
            </Button>
          </Modal.Footer>
        </Modal.Body>
      </Modal>

      {/* Context Builder Modal */}
      <ContextBuilderModal
        isOpen={showContextBuilder}
        onClose={() => setShowContextBuilder(false)}
        onSave={handleAddContext}
        contextNumber={contextCounter}
      />
    </>
  );
};

export default EvaluationModal;
