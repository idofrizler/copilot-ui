import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';

interface WizardStep {
  title: string;
  description: string;
  locationHint?: string;
  icon: React.ReactNode;
}

const steps: WizardStep[] = [
  {
    title: '🗂️ Multiple Sessions',
    description:
      'Work with multiple sessions simultaneously. Each tab maintains its own working directory, model, and conversation history. Switch contexts instantly without losing your place.',
    locationHint:
      '📍 Look at the left sidebar — each tab is a separate session. Click + to add more.',
    icon: (
      <svg
        className="w-12 h-12 text-copilot-accent"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
        />
      </svg>
    ),
  },
  {
    title: '🌳 Git Worktree Sessions',
    description:
      'Create isolated git worktrees for different branches. Paste a GitHub issue URL to automatically create a worktree in ~/.copilot-sessions/. Work on multiple issues simultaneously without branch switching.',
    locationHint:
      '📍 In the left sidebar, click "New from Issue" or use ⌘N to create a worktree session.',
    icon: (
      <svg
        className="w-12 h-12 text-copilot-accent"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
  },
  {
    title: '💻 Embedded Terminal',
    description:
      'Each session has a built-in terminal running in its working directory. Click "Add to Message" to attach terminal output to your next prompt. No copy-paste needed—full context in one click.',
    locationHint: '📍 Click the >_ terminal icon at the LEFT of the input box to toggle it.',
    icon: (
      <svg
        className="w-12 h-12 text-copilot-accent"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    ),
  },
  {
    title: '🔁 Ralph Wiggum Mode',
    description:
      'Iterative agent mode that loops until tasks are complete. Set completion criteria and the agent will work, check results, and continue automatically until done—up to N iterations.',
    locationHint:
      '📍 Click the "Loops" selector in the top bar of the chat area to configure Agent Loops (Ralph & Lisa).',
    icon: (
      <svg
        className="w-12 h-12 text-copilot-accent"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  },
  {
    title: '🔐 Command Allowlisting',
    description:
      'Control command execution with per-session and global allowlists. Review and approve commands before they run. Build trust gradually with visual command management.',
    locationHint:
      '📍 When Copilot wants to run a command, a prompt appears — approve/deny/allowlist from there.',
    icon: (
      <svg
        className="w-12 h-12 text-copilot-accent"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
  },
  {
    title: '🎨 Themes & Models',
    description:
      'Customize your experience with custom themes (including nostalgic ones like ICQ!). Switch between GPT-4.1, GPT-5, Claude Opus-4, Sonnet, Haiku, Gemini, and more models per session.',
    locationHint:
      '📍 Click the ⚙️ gear icon in the sidebar, or use the Models selector in the top bar.',
    icon: (
      <svg
        className="w-12 h-12 text-copilot-accent"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
        />
      </svg>
    ),
  },
];

export interface WelcomeWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const WelcomeWizard: React.FC<WelcomeWizardProps> = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  // Reset to first step when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete();
    onClose();
  };

  const handleFinish = () => {
    onComplete();
    onClose();
  };

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleSkip}
      title="Welcome to Cooper! 🎉"
      width="600px"
      testId="welcome-wizard"
    >
      <Modal.Body className="p-6">
        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'w-8 bg-copilot-accent'
                    : index < currentStep
                      ? 'w-2 bg-copilot-accent/50'
                      : 'w-2 bg-copilot-border'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="flex flex-col items-center text-center space-y-4 min-h-[280px]">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-copilot-accent/10">
              {currentStepData.icon}
            </div>

            <h3 className="text-xl font-semibold text-copilot-text">{currentStepData.title}</h3>

            <p className="text-copilot-text-muted leading-relaxed max-w-md">
              {currentStepData.description}
            </p>

            {currentStepData.locationHint && (
              <div className="mt-2 px-4 py-2 bg-copilot-accent/10 rounded-lg border border-copilot-accent/30">
                <p className="text-sm text-copilot-accent font-medium">
                  {currentStepData.locationHint}
                </p>
              </div>
            )}
          </div>

          {/* Step counter */}
          <div className="text-center text-sm text-copilot-text-muted">
            {currentStep + 1} of {steps.length}
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer className="p-4 border-t border-copilot-border">
        <div className="flex flex-col w-full gap-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-copilot-text-muted hover:text-copilot-text"
            >
              Skip Tutorial
            </Button>

            <div className="flex gap-2">
              {currentStep > 0 && (
                <Button variant="ghost" onClick={handlePrevious}>
                  Previous
                </Button>
              )}
              <Button variant="primary" onClick={handleNext}>
                {isLastStep ? 'Get Started' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      </Modal.Footer>
    </Modal>
  );
};

export default WelcomeWizard;
