import React from 'react';
import ralphImage from '../../assets/ralph-head.png';
import lisaImage from '../../assets/lisa-head.webp';

export interface IconProps {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
}

const defaultProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// Individual icon exports for tree-shaking
export const ChevronDownIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const ChevronRightIcon: React.FC<IconProps> = ({
  size = 24,
  className,
  strokeWidth = 2,
}) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const PlusIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M5 12h14" />
  </svg>
);

export const MoonIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const SunIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

export const MonitorIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

export const UploadIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

export const FolderIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
  </svg>
);

export const GitBranchIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M6 3v12" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

export const CommitIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="8" />
    <line x1="12" y1="16" x2="12" y2="22" />
  </svg>
);

export const FileIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  </svg>
);

export const EditIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export const StopIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const GlobeIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const RepeatIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const TerminalIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

export const BookIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

export const PaletteIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

export const ImageIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

export const PaperclipIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

export const MicrophoneIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

export const HistoryIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l4 2" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

export const EyeIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// Zap/Bolt icon for active state
export const ZapIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

// External link icon - for "Reveal in Folder" functionality
export const ExternalLinkIcon: React.FC<IconProps> = ({
  size = 24,
  className,
  strokeWidth = 2,
}) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// Copy icon - for copying content to clipboard
export const CopyIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

// Check icon - for success/confirmation states
export const CheckIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// Ralph Wiggum icon - uses the Ralph Wiggum image
export const RalphIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <div
    className={`rounded-full bg-white flex items-center justify-center overflow-hidden ${className || ''}`}
    style={{ width: size, height: size }}
  >
    <img src={ralphImage} alt="Ralph" width={size} height={size} style={{ objectFit: 'contain' }} />
  </div>
);

// Lisa Simpson icon - uses the Lisa Simpson image
export const LisaIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <div
    className={`rounded-full bg-white flex items-center justify-center overflow-hidden ${className || ''}`}
    style={{ width: size, height: size }}
  >
    <img src={lisaImage} alt="Lisa" width={size} height={size} style={{ objectFit: 'cover' }} />
  </div>
);

export const WarningIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// Menu/Hamburger icon - for mobile navigation
export const MenuIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// Play icon - for "Run in Terminal" functionality
export const PlayIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

// Archive/Untrack icon - for excluding files from commit
export const ArchiveIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

// Unarchive/Retrack icon - for including files back in commit
export const UnarchiveIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <path d="M12 12v6M9 15l3-3 3 3" />
  </svg>
);

// List icon - for flat view mode
export const ListIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// Tree/hierarchy icon - for tree view mode
export const TreeIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M3 3v18h18" />
    <path d="M7 14h4" />
    <path d="M7 10h8" />
    <path d="M7 6h12" />
  </svg>
);

// Folder open icon - for expanded folders in tree view
export const FolderOpenIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M5 19a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h9a2 2 0 0 1 2 2v1" />
    <path d="M5 19l2.9-8.4c.24-.7.9-1.1 1.6-1.1H22l-3.5 9.5a2 2 0 0 1-1.9 1.5H5a2 2 0 0 1-2-2v-1" />
  </svg>
);

// Settings/Gear icon
export const SettingsIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// Volume/Speaker icon for sound settings
export const VolumeIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

// Volume muted icon
export const VolumeMuteIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

// Help circle icon - for tooltips and explanations
export const HelpCircleIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// Microphone icon for voice settings
export const MicIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

// Star icon (outline) for favorites
export const StarIcon: React.FC<IconProps> = ({ size = 24, className, strokeWidth = 2 }) => (
  <svg width={size} height={size} className={className} {...defaultProps} strokeWidth={strokeWidth}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// Star icon (filled) for favorites
export const StarFilledIcon: React.FC<IconProps> = ({ size = 24, className }) => (
  <svg
    width={size}
    height={size}
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="1"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// Icons object for convenient access
export const Icons = {
  ChevronDown: ChevronDownIcon,
  ChevronRight: ChevronRightIcon,
  Close: CloseIcon,
  Plus: PlusIcon,
  Minus: MinusIcon,
  Moon: MoonIcon,
  Sun: SunIcon,
  Monitor: MonitorIcon,
  Upload: UploadIcon,
  Clock: ClockIcon,
  Folder: FolderIcon,
  FolderOpen: FolderOpenIcon,
  GitBranch: GitBranchIcon,
  Commit: CommitIcon,
  File: FileIcon,
  Edit: EditIcon,
  Stop: StopIcon,
  Globe: GlobeIcon,
  Trash: TrashIcon,
  Repeat: RepeatIcon,
  Terminal: TerminalIcon,
  Book: BookIcon,
  Palette: PaletteIcon,
  Image: ImageIcon,
  Paperclip: PaperclipIcon,
  Microphone: MicrophoneIcon,
  History: HistoryIcon,
  Search: SearchIcon,
  Zap: ZapIcon,
  ExternalLink: ExternalLinkIcon,
  Copy: CopyIcon,
  Check: CheckIcon,
  Ralph: RalphIcon,
  Lisa: LisaIcon,
  Warning: WarningIcon,
  Menu: MenuIcon,
  Play: PlayIcon,
  Archive: ArchiveIcon,
  Unarchive: UnarchiveIcon,
  List: ListIcon,
  Tree: TreeIcon,
  Settings: SettingsIcon,
  Volume: VolumeIcon,
  VolumeMute: VolumeMuteIcon,
  Mic: MicIcon,
  HelpCircle: HelpCircleIcon,
  Star: StarIcon,
  StarFilled: StarFilledIcon,
};

export default Icons;
