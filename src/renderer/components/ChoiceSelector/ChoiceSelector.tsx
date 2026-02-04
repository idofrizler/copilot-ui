import React from 'react';
import type { DetectedChoice } from '../../types';

interface ChoiceSelectorProps {
  choices: DetectedChoice[];
  onSelect: (choice: DetectedChoice) => void;
  disabled?: boolean;
  question?: string;
}

export const ChoiceSelector: React.FC<ChoiceSelectorProps> = ({
  choices,
  onSelect,
  disabled = false,
  question,
}) => {
  if (!choices || choices.length === 0) return null;

  return (
    <div className="mt-3 bg-copilot-accent-muted/30 border border-copilot-accent/30 rounded-lg p-3 max-w-md">
      {/* Header with question icon */}
      <div className="flex items-center gap-2 mb-2.5 text-copilot-text-muted">
        <svg className="w-4 h-4 text-copilot-accent" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 3.672a.75.75 0 0 0-1.06 1.06l.022.023A3.488 3.488 0 0 0 4.5 6.5a3.5 3.5 0 1 0 7 0 3.488 3.488 0 0 0-.241-1.744l.022-.023a.75.75 0 0 0-1.06-1.06l-.023.022A3.488 3.488 0 0 0 8.5 3.5h-1c-.61 0-1.188.155-1.697.195l-.023-.022ZM8 5.5a1 1 0 0 1 1 1v2.25a.75.75 0 0 1-1.5 0V6.5a1 1 0 0 1 .5-.866V5.5ZM8 12.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
        </svg>
        <span className="text-xs font-medium">{question || 'Choose an option:'}</span>
      </div>

      {/* Choice buttons */}
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => onSelect(choice)}
            disabled={disabled}
            className="group flex items-center gap-2 px-3 py-1.5 text-xs bg-copilot-surface hover:bg-copilot-accent/20 text-copilot-text border border-copilot-border hover:border-copilot-accent rounded-full transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-copilot-accent/50 focus:ring-offset-1 focus:ring-offset-transparent"
            title={choice.description}
          >
            {/* Radio-style indicator */}
            <span className="w-3 h-3 rounded-full border-2 border-copilot-text-muted group-hover:border-copilot-accent flex items-center justify-center transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-transparent group-hover:bg-copilot-accent transition-colors" />
            </span>
            <span className="group-hover:text-copilot-accent transition-colors font-medium">
              {choice.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChoiceSelector;
