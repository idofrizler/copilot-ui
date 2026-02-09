import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import logo from './assets/logo.png';
import { useTheme } from './context/ThemeContext';
import {
  Spinner,
  Dropdown,
  Modal,
  Button,
  IconButton,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  MonitorIcon,
  ClockIcon,
  FolderIcon,
  CopyIcon,
  CheckIcon,
  CommitIcon,
  FileIcon,
  EditIcon,
  StopIcon,
  GlobeIcon,
  RalphIcon,
  LisaIcon,
  TerminalIcon,
  BookIcon,
  ImageIcon,
  HistoryIcon,
  GitBranchIcon,
  TerminalPanel,
  TerminalOutputShrinkModal,
  ChoiceSelector,
  PaperclipIcon,
  MicButton,
  SessionHistory,
  FilePreviewModal,
  EnvironmentModal,
  UpdateAvailableModal,
  SpotlightTour,
  ReleaseNotesModal,
  CodeBlockWithCopy,
  RepeatIcon,
  StarIcon,
  StarFilledIcon,
  WarningIcon,
  SidebarDrawer,
  MenuIcon,
  ZapIcon,
  SettingsModal,
  SettingsIcon,
  HelpCircleIcon,
  VolumeMuteIcon,
  TitleBar,
  EyeIcon,
} from './components';
import { GitBranchWidget, CommitModal, useCommitModal } from './features/git';
import { CreateWorktreeSession } from './features/sessions';
import { ToolActivitySection } from './features/chat';
import { buildLisaPhasePrompt } from './features/agent-loops';
import { enrichSessionsWithWorktreeData } from './features/sessions';
import { getCleanEditedFiles } from './features/git';
import {
  Status,
  Message,
  ActiveTool,
  ModelInfo,
  ModelCapabilities,
  ImageAttachment,
  FileAttachment,
  PendingConfirmation,
  PendingInjection,
  TabState,
  DraftInput,
  PreviousSession,
  MCPServerConfig,
  MCPLocalServerConfig,
  MCPRemoteServerConfig,
  RalphConfig,
  LisaConfig,
  LisaPhase,
  DetectedChoice,
  RALPH_COMPLETION_SIGNAL,
  RALPH_STATE_FILENAME,
  RALPH_PROGRESS_FILENAME,
  LISA_PHASE_COMPLETE_SIGNAL,
  LISA_REVIEW_APPROVE_SIGNAL,
  LISA_REVIEW_REJECT_PREFIX,
  Skill,
  Instruction,
  Agent,
} from './types';
import { generateId, generateTabName, setTabCounter } from './utils/session';
import { playNotificationSound } from './utils/sound';
import { LONG_OUTPUT_LINE_THRESHOLD } from './utils/cliOutputCompression';
import { isAsciiDiagram, extractTextContent } from './utils/isAsciiDiagram';
import { isCliCommand } from './utils/isCliCommand';
import { groupAgents } from './utils/agentPicker';
import { useClickOutside, useResponsive, useVoiceSpeech } from './hooks';
import buildInfo from './build-info.json';
import { TerminalProvider } from './context/TerminalContext';

const COOPER_DEFAULT_AGENT: Agent = {
  name: 'Cooper (default)',
  path: 'system:cooper-default',
  type: 'system',
  source: 'copilot',
};

const groupBy = <T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, T[]> => {
  return items.reduce(
    (acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    },
    {} as Record<K, T[]>
  );
};

const INSTRUCTION_TYPE_LABELS: Record<Instruction['type'], string> = {
  personal: 'Personal instructions',
  project: 'Project instructions',
  cwd: 'Current directory',
  'custom-dir': 'Custom directory',
  agent: 'Agent reference files',
};
const INSTRUCTION_TYPE_ORDER: Instruction['type'][] = [
  'personal',
  'project',
  'cwd',
  'custom-dir',
  'agent',
];
const SKILL_TYPE_LABELS: Record<Skill['type'], string> = {
  personal: 'Personal skills',
  project: 'Project skills',
};
const SKILL_TYPE_ORDER: Skill['type'][] = ['personal', 'project'];
const App: React.FC = () => {
  const [status, setStatus] = useState<Status>('connecting');
  const [inputValue, setInputValue] = useState('');
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Drag-and-drop state for session reordering
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [favoriteModels, setFavoriteModels] = useState<string[]>([]);
  const [previousSessions, setPreviousSessions] = useState<PreviousSession[]>([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [showAllowedCommands, setShowAllowedCommands] = useState(false);
  const [globalSafeCommands, setGlobalSafeCommands] = useState<string[]>([]);
  const [showAddAllowedCommand, setShowAddAllowedCommand] = useState(false);
  const [addCommandScope, setAddCommandScope] = useState<'session' | 'global'>('session');
  const [addCommandValue, setAddCommandValue] = useState('');
  const [showEditedFiles, setShowEditedFiles] = useState(false);
  const [cwdCopied, setCwdCopied] = useState(false);
  const [filePreviewPath, setFilePreviewPath] = useState<string | null>(null);
  const [showEnvironmentModal, setShowEnvironmentModal] = useState(false);
  const [environmentTab, setEnvironmentTab] = useState<'instructions' | 'skills'>('instructions');
  const [isGitRepo, setIsGitRepo] = useState<boolean>(true);
  const commitModal = useCommitModal();
  const [allowMode, setAllowMode] = useState<'once' | 'session' | 'global'>('once');
  const [showAllowDropdown, setShowAllowDropdown] = useState(false);
  const allowDropdownRef = useRef<HTMLDivElement>(null);

  // Close allow dropdown when clicking outside
  const closeAllowDropdown = useCallback(() => {
    setShowAllowDropdown(false);
  }, []);
  useClickOutside(allowDropdownRef, closeAllowDropdown, showAllowDropdown);

  // Session context menu state (for right-click "Mark for Review")
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(
    null
  );
  // Note input modal state
  const [noteInputModal, setNoteInputModal] = useState<{
    tabId: string;
    currentNote?: string;
  } | null>(null);
  const [noteInputValue, setNoteInputValue] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);
  useClickOutside(contextMenuRef, closeContextMenu, contextMenu !== null);

  // Theme context
  const { themePreference, activeTheme, availableThemes, setTheme, importTheme } = useTheme();
  // MCP Server state
  const [mcpServers, setMcpServers] = useState<Record<string, MCPServerConfig>>({});
  const [showMcpServers, setShowMcpServers] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [showMcpJsonModal, setShowMcpJsonModal] = useState(false);
  const [editingMcpServer, setEditingMcpServer] = useState<{
    name: string;
    server: MCPServerConfig;
  } | null>(null);
  const [mcpFormData, setMcpFormData] = useState({
    name: '',
    type: 'local' as 'local' | 'http' | 'sse',
    command: '',
    args: '',
    url: '',
    tools: '*',
  });

  // Agent Skills state
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showSkills, setShowSkills] = useState(false);

  // Agent discovery state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [favoriteAgents, setFavoriteAgents] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('favorite-agents');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
    } catch {
      return [];
    }
  });
  const [selectedAgentByTab, setSelectedAgentByTab] = useState<Record<string, string | null>>({});

  // Copilot Instructions state
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [showInstructions, setShowInstructions] = useState(false);

  const instructionSections = useMemo(() => {
    const grouped = groupBy(instructions, (instruction) => instruction.type);
    return INSTRUCTION_TYPE_ORDER.map((type) => ({
      type,
      label: INSTRUCTION_TYPE_LABELS[type],
      items: grouped[type] || [],
    })).filter((section) => section.items.length > 0);
  }, [instructions]);

  const skillSections = useMemo(() => {
    const grouped = groupBy(skills, (skill) => skill.type);
    return SKILL_TYPE_ORDER.map((type) => ({
      type,
      label: SKILL_TYPE_LABELS[type],
      items: grouped[type] || [],
    })).filter((section) => section.items.length > 0);
  }, [skills]);

  const flatSkills = useMemo(
    () => skillSections.flatMap((section) => section.items),
    [skillSections]
  );

  const flatInstructions = useMemo(
    () => instructionSections.flatMap((section) => section.items),
    [instructionSections]
  );

  const mcpEntries = useMemo(() => Object.entries(mcpServers), [mcpServers]);

  // Voice control settings
  const [pushToTalk, setPushToTalk] = useState(() => {
    // Load from localStorage, default to false (click-to-toggle mode)
    const saved = localStorage.getItem('voice-push-to-talk');
    return saved === 'true';
  });

  const [alwaysListening, setAlwaysListening] = useState(() => {
    // Load from localStorage, default to false
    const saved = localStorage.getItem('voice-always-listening');
    return saved === 'true';
  });

  const [alwaysListeningError, setAlwaysListeningError] = useState<string | null>(null);

  const handleTogglePushToTalk = (enabled: boolean) => {
    setPushToTalk(enabled);
    localStorage.setItem('voice-push-to-talk', String(enabled));
  };

  const handleToggleAlwaysListening = (enabled: boolean) => {
    setAlwaysListening(enabled);
    localStorage.setItem('voice-always-listening', String(enabled));
    if (!enabled) {
      setAlwaysListeningError(null); // Clear error when disabled
    }
  };

  // Voice auto-send countdown state
  const [voiceAutoSendCountdown, setVoiceAutoSendCountdown] = useState<number | null>(null);
  const voiceAutoSendTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleSendMessageRef = useRef<() => void>(() => {});

  const startVoiceAutoSend = useCallback(() => {
    // Only start if always listening is enabled
    if (!alwaysListening) return;

    // Clear any existing timer
    if (voiceAutoSendTimerRef.current) {
      clearInterval(voiceAutoSendTimerRef.current);
    }

    setVoiceAutoSendCountdown(5);

    voiceAutoSendTimerRef.current = setInterval(() => {
      setVoiceAutoSendCountdown((prev) => {
        if (prev === null || prev <= 1) {
          // Time's up - send the message
          if (voiceAutoSendTimerRef.current) {
            clearInterval(voiceAutoSendTimerRef.current);
            voiceAutoSendTimerRef.current = null;
          }
          // Trigger send on next tick to avoid state issues
          setTimeout(() => {
            handleSendMessageRef.current();
          }, 0);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [alwaysListening]);

  const cancelVoiceAutoSend = useCallback(() => {
    if (voiceAutoSendTimerRef.current) {
      clearInterval(voiceAutoSendTimerRef.current);
      voiceAutoSendTimerRef.current = null;
    }
    setVoiceAutoSendCountdown(null);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (voiceAutoSendTimerRef.current) {
        clearInterval(voiceAutoSendTimerRef.current);
      }
    };
  }, []);

  // Ralph Wiggum loop state
  const [showRalphSettings, setShowRalphSettings] = useState(false);
  const [ralphEnabled, setRalphEnabled] = useState(false);
  const [ralphMaxIterations, setRalphMaxIterations] = useState(5);
  const [ralphRequireScreenshot, setRalphRequireScreenshot] = useState(false);
  const [ralphClearContext, setRalphClearContext] = useState(true); // New: Clear context between iterations (like Gemini Ralph)

  // Lisa Simpson loop state - multi-phase analytical workflow
  const [showLisaSettings, setShowLisaSettings] = useState(false);
  const [lisaEnabled, setLisaEnabled] = useState(false);

  // Top bar selector state (Models, Agents, Loops)
  const [openTopBarSelector, setOpenTopBarSelector] = useState<
    'models' | 'agents' | 'loops' | null
  >(null);

  // Worktree session state
  const [showCreateWorktree, setShowCreateWorktree] = useState(false);
  const [worktreeRepoPath, setWorktreeRepoPath] = useState('');

  // Terminal panel state - track which sessions have terminal open (per-session state)
  const [terminalOpenSessions, setTerminalOpenSessions] = useState<Set<string>>(new Set());
  // Track which sessions have had a terminal initialized (so we keep them alive)
  const [terminalInitializedSessions, setTerminalInitializedSessions] = useState<Set<string>>(
    new Set()
  );
  // Terminal output attachment state
  const [terminalAttachment, setTerminalAttachment] = useState<{
    output: string;
    lineCount: number;
  } | null>(null);
  // Terminal output shrink modal state (for long outputs)
  const [pendingTerminalOutput, setPendingTerminalOutput] = useState<{
    output: string;
    lineCount: number;
    lastCommandStart?: number;
  } | null>(null);

  // Image attachment state
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([]);
  const [modelCapabilities, setModelCapabilities] = useState<Record<string, ModelCapabilities>>({});
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Image lightbox state (for viewing enlarged images)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  // File attachment state
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track user-attached file paths per session for auto-approval
  const userAttachedPathsRef = useRef<Map<string, Set<string>>>(new Map());

  // Track last processed idle timestamp per session to prevent duplicate handling
  const lastIdleTimestampRef = useRef<Map<string, number>>(new Map());

  // Resizable panel state
  const [leftPanelWidth, setLeftPanelWidth] = useState(288); // default w-72
  const [rightPanelWidth, setRightPanelWidth] = useState(288); // default w-72
  const resizingPanel = useRef<'left' | 'right' | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Responsive state from hook
  const { isMobile, isTablet, isDesktop, isMobileOrTablet, width: windowWidth } = useResponsive();

  // Panel collapse state (for tablet/desktop) and drawer state (for mobile)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  // Track if user manually toggled panels (prevents auto-collapse override)
  const userToggledLeftRef = useRef(false);
  const userToggledRightRef = useRef(false);

  // Update and Release Notes state
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string;
    latestVersion: string;
    downloadUrl: string;
  } | null>(null);
  const [showReleaseNotesModal, setShowReleaseNotesModal] = useState(false);

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsDefaultSection, setSettingsDefaultSection] = useState<
    'themes' | 'voice' | 'sounds' | 'commands' | undefined
  >(undefined);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('copilot-sound-enabled');
    return saved !== null ? saved === 'true' : true; // Default to enabled
  });

  // Welcome wizard state
  const [showWelcomeWizard, setShowWelcomeWizard] = useState(false);
  const [shouldShowWizardWhenReady, setShouldShowWizardWhenReady] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeTabIdRef = useRef<string | null>(null);

  // Voice speech hook for STT/TTS
  const voiceSpeech = useVoiceSpeech();
  const { isRecording } = voiceSpeech;
  const voiceSpeakRef = useRef(voiceSpeech.speak);
  voiceSpeakRef.current = voiceSpeech.speak; // Keep ref updated

  // Voice model initialization state
  const [voiceModelLoading, setVoiceModelLoading] = useState(false);
  const [voiceModelLoaded, setVoiceModelLoaded] = useState(false);
  const [voiceInitError, setVoiceInitError] = useState<string | null>(null);
  const [voiceDownloadProgress, setVoiceDownloadProgress] = useState<{
    progress: number;
    status: string;
  } | null>(null);

  // Listen for download progress updates
  useEffect(() => {
    if (!window.electronAPI?.voiceServer?.onDownloadProgress) return;
    const cleanup = window.electronAPI.voiceServer.onDownloadProgress(
      (data: { progress: number; status: string }) => {
        setVoiceDownloadProgress(data);
      }
    );
    return cleanup;
  }, []);

  // Check if voice model is already loaded on mount
  useEffect(() => {
    if (!window.electronAPI?.voiceServer) return;
    window.electronAPI.voiceServer.checkModel().then((check) => {
      if (check.exists && check.binaryExists) {
        window.electronAPI.voice.loadModel().then((result) => {
          if (result.success) setVoiceModelLoaded(true);
        });
      }
    });
  }, []);

  // Voice initialization handler for settings page
  const handleInitVoice = useCallback(async () => {
    if (!window.electronAPI?.voiceServer) return;
    setVoiceModelLoading(true);
    setVoiceInitError(null);
    try {
      const check = await window.electronAPI.voiceServer.checkModel();
      if (!check.exists || !check.binaryExists) {
        const dlResult = await window.electronAPI.voiceServer.downloadModel();
        if (!dlResult.success) {
          setVoiceInitError(dlResult.error || 'Download failed');
          setVoiceModelLoading(false);
          return;
        }
      }
      const loadResult = await window.electronAPI.voice.loadModel();
      if (loadResult.success) {
        setVoiceModelLoaded(true);
      } else {
        setVoiceInitError(loadResult.error || 'Failed to load model');
      }
    } catch (e: any) {
      setVoiceInitError(e.message || 'Initialization failed');
    } finally {
      setVoiceModelLoading(false);
    }
  }, []);

  // Open settings modal on voice tab (optionally auto-init)
  const openSettingsVoice = useCallback(
    (autoInit = false) => {
      setSettingsDefaultSection('voice');
      setShowSettingsModal(true);
      if (autoInit && !voiceModelLoaded && !voiceModelLoading) {
        // Trigger init after a short delay so modal renders first
        setTimeout(() => handleInitVoice(), 100);
      }
    },
    [voiceModelLoaded, voiceModelLoading, handleInitVoice]
  );

  const prevActiveTabIdRef = useRef<string | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  // Keep soundEnabledRef in sync with state
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Keep ref in sync with state (update prevActiveTabIdRef BEFORE activeTabIdRef)
  useEffect(() => {
    prevActiveTabIdRef.current = activeTabIdRef.current;
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Expose test helpers for E2E testing (only when __ENABLE_TEST_HELPERS__ is set by test runner)
  useEffect(() => {
    // Check if test mode is enabled (set by Playwright before app loads)
    if ((window as any).__ENABLE_TEST_HELPERS__) {
      (window as any).__TEST_HELPERS__ = {
        setTabs,
        setActiveTabId,
        getTabs: () => tabs,
        getActiveTab: () => tabs.find((t) => t.id === activeTabId),
        injectMessages: (messages: Message[]) => {
          setTabs((prev) => {
            if (prev.length === 0) {
              // Create a new tab with the messages
              return [
                {
                  id: 'test-tab-1',
                  name: 'Test Conversation',
                  messages,
                  model: 'gpt-4',
                  cwd: '/tmp/test',
                  isProcessing: false,
                  activeTools: [],
                  hasUnreadCompletion: false,
                  pendingConfirmations: [],
                  needsTitle: false,
                  alwaysAllowed: [],
                  editedFiles: [],
                  untrackedFiles: [],
                  fileViewMode: 'flat',
                  currentIntent: null,
                  currentIntentTimestamp: null,
                  gitBranchRefresh: 0,
                },
              ];
            }
            return prev.map((tab, i) => (i === 0 ? { ...tab, messages } : tab));
          });
          if (!activeTabId) {
            setActiveTabId('test-tab-1');
          }
        },
      };
    }
    return () => {
      if ((window as any).__ENABLE_TEST_HELPERS__) {
        delete (window as any).__TEST_HELPERS__;
      }
    };
  }, [tabs, activeTabId]);

  // Check for updates and show release notes on startup
  useEffect(() => {
    const checkUpdatesAndReleaseNotes = async () => {
      try {
        // Check if this is a new version (show release notes)
        const { version: lastSeenVersion } = await window.electronAPI.updates.getLastSeenVersion();
        const currentVersion = buildInfo.baseVersion;

        if (lastSeenVersion !== currentVersion && buildInfo.releaseNotes) {
          // New version - show release notes
          setShowReleaseNotesModal(true);
          // Mark this version as seen
          await window.electronAPI.updates.setLastSeenVersion(currentVersion);
        }

        // Check for newer updates available
        const updateResult = await window.electronAPI.updates.checkForUpdate();
        if (updateResult.hasUpdate && updateResult.latestVersion && updateResult.downloadUrl) {
          setUpdateInfo({
            currentVersion: updateResult.currentVersion || currentVersion,
            latestVersion: updateResult.latestVersion,
            downloadUrl: updateResult.downloadUrl,
          });
          // Show update modal after release notes (if any) are dismissed
          if (!buildInfo.releaseNotes || lastSeenVersion === currentVersion) {
            setShowUpdateModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    // Delay the check slightly to not block initial render
    const timer = setTimeout(checkUpdatesAndReleaseNotes, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Check if user has seen welcome wizard on startup
  useEffect(() => {
    const checkWelcomeWizard = async () => {
      try {
        const { hasSeen } = await window.electronAPI.wizard.hasSeenWelcome();
        console.log('Welcome wizard check:', { hasSeen });
        if (!hasSeen) {
          // Mark that we should show wizard once data is loaded
          setShouldShowWizardWhenReady(true);
        }
      } catch (error) {
        console.error('Failed to check welcome wizard status:', error);
      }
    };

    checkWelcomeWizard();
  }, []);

  // Show wizard once data is loaded and we should show it
  useEffect(() => {
    console.log('Wizard show check:', { shouldShowWizardWhenReady, dataLoaded });
    if (shouldShowWizardWhenReady && dataLoaded) {
      // Small delay to ensure UI has rendered
      const timer = setTimeout(() => {
        console.log('Showing welcome wizard');
        setShowWelcomeWizard(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [shouldShowWizardWhenReady, dataLoaded]);

  // Focus input when active tab changes
  useEffect(() => {
    if (activeTabId) {
      inputRef.current?.focus();
    }
  }, [activeTabId]);

  // Get the active tab (defined early for use in effects below)
  const activeTab = tabs.find((t) => t.id === activeTabId);

  // Fetch model capabilities when active tab changes
  useEffect(() => {
    if (activeTab && activeTab.model && !modelCapabilities[activeTab.model]) {
      window.electronAPI.copilot
        .getModelCapabilities(activeTab.model)
        .then((capabilities) => {
          setModelCapabilities((prev) => ({
            ...prev,
            [activeTab.model]: {
              supportsVision: capabilities.supportsVision,
              visionLimits: capabilities.visionLimits,
            },
          }));
        })
        .catch(console.error);
    }
  }, [activeTab?.model]);

  // Save draft state to departing tab and restore from arriving tab on tab switch
  useEffect(() => {
    // Save current input state to the previous tab's draftInput (if it still exists)
    if (prevActiveTabIdRef.current && prevActiveTabIdRef.current !== activeTabId) {
      const prevTabId = prevActiveTabIdRef.current;
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === prevTabId
            ? {
                ...tab,
                draftInput: {
                  text: inputValue,
                  imageAttachments: [...imageAttachments],
                  fileAttachments: [...fileAttachments],
                  terminalAttachment: terminalAttachment ? { ...terminalAttachment } : null,
                },
              }
            : tab
        )
      );
    }

    // Restore draft state from the new active tab
    if (activeTabId) {
      const newActiveTab = tabs.find((t) => t.id === activeTabId);
      const draft = newActiveTab?.draftInput;
      if (draft) {
        setInputValue(draft.text);
        setImageAttachments(draft.imageAttachments);
        setFileAttachments(draft.fileAttachments);
        setTerminalAttachment(draft.terminalAttachment);
      } else {
        // No draft saved for this tab - clear inputs
        setInputValue('');
        setImageAttachments([]);
        setFileAttachments([]);
        setTerminalAttachment(null);
      }
    }
  }, [activeTabId]);

  // Save open sessions with models and cwd whenever tabs change
  useEffect(() => {
    if (tabs.length > 0) {
      const openSessions = tabs.map((t) => ({
        sessionId: t.id,
        model: t.model,
        cwd: t.cwd,
        name: t.name,
        editedFiles: t.editedFiles,
        alwaysAllowed: t.alwaysAllowed,
        markedForReview: t.markedForReview,
        reviewNote: t.reviewNote,
        untrackedFiles: t.untrackedFiles,
        fileViewMode: t.fileViewMode,
        yoloMode: t.yoloMode,
        activeAgentName: t.activeAgentName,
      }));
      window.electronAPI.copilot.saveOpenSessions(openSessions);
    }
  }, [tabs]);

  // Save message attachments whenever tabs/messages change
  useEffect(() => {
    tabs.forEach((tab) => {
      const attachments = tab.messages
        .map((msg, index) => ({
          messageIndex: index,
          imageAttachments: msg.imageAttachments,
          fileAttachments: msg.fileAttachments,
        }))
        .filter(
          (a) =>
            (a.imageAttachments && a.imageAttachments.length > 0) ||
            (a.fileAttachments && a.fileAttachments.length > 0)
        );

      if (attachments.length > 0) {
        window.electronAPI.copilot.saveMessageAttachments(tab.id, attachments);
      }
    });
  }, [tabs]);

  const scrollToBottom = (instant?: boolean) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  };

  // Track previous message count and session ID for scroll logic
  const prevMessageCountRef = useRef<number>(0);
  const prevSessionIdForScrollRef = useRef<string | null>(null);

  useEffect(() => {
    const currentMessageCount = activeTab?.messages?.length ?? 0;
    const currentSessionId = activeTab?.id ?? null;
    const prevMessageCount = prevMessageCountRef.current;
    const prevSessionId = prevSessionIdForScrollRef.current;

    // Update refs for next render
    prevMessageCountRef.current = currentMessageCount;
    prevSessionIdForScrollRef.current = currentSessionId;

    // Only scroll to bottom when:
    // 1. New messages are added to the SAME session (message count increased)
    // 2. NOT when switching sessions (session ID changed)
    if (currentSessionId === prevSessionId && currentMessageCount > prevMessageCount) {
      scrollToBottom();
    } else if (currentSessionId !== prevSessionId && currentMessageCount > 0) {
      // When switching sessions, instantly scroll to bottom (no animation)
      // This preserves the "show end of conversation" behavior without the annoying animated scroll
      scrollToBottom(true);
    }
  }, [activeTab?.messages, activeTab?.id]);

  // Resize handlers for side panels
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, panel: 'left' | 'right') => {
      e.preventDefault();
      resizingPanel.current = panel;
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = panel === 'left' ? leftPanelWidth : rightPanelWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [leftPanelWidth, rightPanelWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingPanel.current) return;

      const delta = e.clientX - resizeStartX.current;
      const minWidth = 120;
      const maxWidth = 400;

      if (resizingPanel.current === 'left') {
        const newWidth = Math.min(maxWidth, Math.max(minWidth, resizeStartWidth.current + delta));
        setLeftPanelWidth(newWidth);
      } else {
        // For right panel, dragging right decreases width
        const newWidth = Math.min(maxWidth, Math.max(minWidth, resizeStartWidth.current - delta));
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (resizingPanel.current) {
        resizingPanel.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Auto-collapse panels based on responsive breakpoints
  useEffect(() => {
    // Auto-collapse logic for tablet (only if user hasn't manually toggled)
    if (isTablet) {
      // On tablet, collapse right panel by default
      if (!userToggledRightRef.current && !rightPanelCollapsed) {
        setRightPanelCollapsed(true);
      }
    } else if (isDesktop) {
      // On desktop, expand panels if user hasn't toggled
      if (!userToggledLeftRef.current && leftPanelCollapsed) {
        setLeftPanelCollapsed(false);
      }
      if (!userToggledRightRef.current && rightPanelCollapsed) {
        setRightPanelCollapsed(false);
      }
    }

    // Close drawers when switching to desktop
    if (isDesktop) {
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
    }
  }, [isMobile, isTablet, isDesktop, leftPanelCollapsed, rightPanelCollapsed]);

  // Reset user toggle flags when switching to desktop
  useEffect(() => {
    if (isDesktop) {
      userToggledRightRef.current = false;
      userToggledLeftRef.current = false;
    }
  }, [isDesktop]);

  // Toggle handlers for manual panel collapse (tablet/desktop)
  const toggleLeftPanel = useCallback(() => {
    if (isMobileOrTablet) {
      setLeftDrawerOpen((prev) => !prev);
    } else {
      userToggledLeftRef.current = true;
      setLeftPanelCollapsed((prev) => !prev);
    }
  }, [isMobileOrTablet]);

  const toggleRightPanel = useCallback(() => {
    if (isMobileOrTablet) {
      setRightDrawerOpen((prev) => !prev);
    } else {
      userToggledRightRef.current = true;
      setRightPanelCollapsed((prev) => !prev);
    }
  }, [isMobileOrTablet]);

  // Reset textarea height when input is cleared, grow when content is set programmatically
  useEffect(() => {
    if (!inputRef.current) return;
    if (!inputValue) {
      inputRef.current.style.height = 'auto';
    } else {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [inputValue]);

  // Load MCP servers on startup
  useEffect(() => {
    const loadMcpConfig = async () => {
      try {
        const config = await window.electronAPI.mcp.getConfig();
        setMcpServers(config.mcpServers || {});
        const serverCount = Object.keys(config.mcpServers || {}).length;
        console.log('Loaded MCP servers:', Object.keys(config.mcpServers || {}));
        if (serverCount > 0) {
        }
      } catch (error) {
        console.error('Failed to load MCP config:', error);
      }
    };
    loadMcpConfig();
  }, []);

  // Load Agent Skills on startup and when active tab changes
  useEffect(() => {
    const loadSkills = async () => {
      try {
        const cwd = activeTab?.cwd;
        const result = await window.electronAPI.skills.getAll(cwd);
        setSkills(result.skills || []);
        if (result.errors?.length > 0) {
          console.warn('Some skills had errors:', result.errors);
        }
        console.log('Loaded skills:', result.skills?.length || 0);
      } catch (error) {
        console.error('Failed to load skills:', error);
      }
    };
    loadSkills();
  }, [activeTab?.cwd]);

  // Discover agents on startup and when active tab changes
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const cwd = activeTab?.cwd;
        const result = await window.electronAPI.agents.getAll(cwd);
        setAgents(result.agents || []);
      } catch {
        // Ignore agent discovery errors to avoid noisy console logs.
      }
    };
    loadAgents();
  }, [activeTab?.cwd]);

  // Load Copilot Instructions on startup and when active tab changes
  useEffect(() => {
    const loadInstructions = async () => {
      try {
        const cwd = activeTab?.cwd;
        const result = await window.electronAPI.instructions.getAll(cwd);
        setInstructions(result.instructions || []);
        if (result.errors?.length > 0) {
          console.warn('Some instructions had errors:', result.errors);
        }
      } catch (error) {
        console.error('Failed to load instructions:', error);
      }
    };
    loadInstructions();
  }, [activeTab?.cwd]);

  const handleOpenEnvironment = useCallback(
    (tab: 'instructions' | 'skills', event?: React.MouseEvent) => {
      event?.stopPropagation();
      setFilePreviewPath(null);
      setEnvironmentTab(tab);
      setShowEnvironmentModal(true);
    },
    []
  );

  // Helper to update a specific tab
  const updateTab = useCallback((tabId: string, updates: Partial<TabState>) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab)));
  }, []);

  // Persist lisaConfig to sessionStorage when it changes
  useEffect(() => {
    tabs.forEach((tab) => {
      if (tab.lisaConfig) {
        sessionStorage.setItem(`lisaConfig-${tab.id}`, JSON.stringify(tab.lisaConfig));
      }
    });
  }, [tabs]);

  // Set up IPC listeners
  useEffect(() => {
    const unsubscribeReady = window.electronAPI.copilot.onReady(async (data) => {
      console.log(
        'Copilot ready with sessions:',
        data.sessions.length,
        'previous:',
        data.previousSessions.length
      );
      setStatus('connected');
      setAvailableModels(data.models);

      // Set previous sessions immediately (without worktree enrichment for fast startup)
      setPreviousSessions(data.previousSessions);

      // Enrich previous sessions with worktree metadata in background (non-blocking)
      enrichSessionsWithWorktreeData(data.previousSessions)
        .then((enrichedSessions) => {
          setPreviousSessions(enrichedSessions);
        })
        .catch((err) => {
          console.error('Failed to enrich sessions with worktree data:', err);
        });

      // Load global safe commands in background (non-blocking)
      window.electronAPI.copilot
        .getGlobalSafeCommands()
        .then((globalCommands) => {
          setGlobalSafeCommands(globalCommands);
        })
        .catch((error) => {
          console.error('Failed to load global safe commands:', error);
        });

      // Load favorite models in background (non-blocking)
      window.electronAPI.copilot
        .getFavoriteModels()
        .then((favorites) => {
          setFavoriteModels(favorites);
        })
        .catch((error) => {
          console.error('Failed to load favorite models:', error);
        });

      // If no sessions exist, we need to create one (with trust check)
      if (data.sessions.length === 0) {
        // Check trust for current directory
        const cwd = await window.electronAPI.copilot.getCwd();
        const trustResult = await window.electronAPI.copilot.checkDirectoryTrust(cwd);
        if (!trustResult.trusted) {
          // User declined trust and no sessions to show - quit the app
          window.electronAPI.window.quit();
          return;
        }

        // Create initial session
        try {
          const result = await window.electronAPI.copilot.createSession();
          const newTab: TabState = {
            id: result.sessionId,
            name: generateTabName(),
            messages: [],
            model: result.model,
            cwd: result.cwd,
            isProcessing: false,
            activeTools: [],
            hasUnreadCompletion: false,
            pendingConfirmations: [],
            needsTitle: true,
            alwaysAllowed: [],
            editedFiles: [],
            untrackedFiles: [],
            fileViewMode: 'flat',
            currentIntent: null,
            currentIntentTimestamp: null,
            gitBranchRefresh: 0,
            activeAgentName: undefined,
          };
          setTabs([newTab]);
          setActiveTabId(result.sessionId);
        } catch (error) {
          console.error('Failed to create initial session:', error);
          setStatus('error');
        }
        return;
      }

      // Create tabs for all resumed/created sessions
      // Note: These are "pending" sessions - they will be fully resumed asynchronously
      // Message loading happens in the copilot:sessionResumed handler below
      // IMPORTANT: We must preserve any existing tabs that may have already been created
      // by early sessionResumed events (with pre-loaded messages)
      setTabs((existingTabs) => {
        const existingTabIds = new Set(existingTabs.map((t) => t.id));

        // Create new tabs only for sessions that don't already have a tab
        const newTabs: TabState[] = data.sessions
          .filter((s) => !existingTabIds.has(s.sessionId))
          .map((s, idx) => {
            // Restore lisaConfig from sessionStorage if available
            const storedLisaConfig = sessionStorage.getItem(`lisaConfig-${s.sessionId}`);
            const lisaConfig = storedLisaConfig ? JSON.parse(storedLisaConfig) : undefined;

            return {
              id: s.sessionId,
              name: s.name || `Session ${existingTabs.length + idx + 1}`,
              messages: [], // Will be loaded when session is actually resumed (copilot:sessionResumed)
              model: s.model,
              cwd: s.cwd,
              isProcessing: false,
              activeTools: [],
              hasUnreadCompletion: false,
              pendingConfirmations: [],
              needsTitle: !s.name, // Only need title if no name provided
              alwaysAllowed: s.alwaysAllowed || [],
              editedFiles: s.editedFiles || [],
              untrackedFiles: s.untrackedFiles || [],
              fileViewMode: s.fileViewMode || 'flat',
              currentIntent: null,
              currentIntentTimestamp: null,
              gitBranchRefresh: 0,
              lisaConfig,
              markedForReview: s.markedForReview,
              reviewNote: s.reviewNote,
              yoloMode: s.yoloMode,
              activeAgentName: s.activeAgentName,
            };
          });

        // Merge: keep existing tabs (with their messages), add new ones
        return [...existingTabs, ...newTabs];
      });

      // Update tab counter to avoid duplicate names
      setTabCounter(data.sessions.length);

      // Set active tab if not already set
      setActiveTabId((currentActive) => currentActive || data.sessions[0]?.sessionId || null);

      // Don't load messages here - sessions are still pending resumption
      // The copilot:sessionResumed handler below will load messages when each session is actually ready

      // Mark data as loaded for wizard
      setDataLoaded(true);
    });

    const unsubscribeSessionResumed = window.electronAPI.copilot.onSessionResumed((data) => {
      const s = data.session;

      // Check if messages were pre-loaded (early resumption includes them)
      const preloadedMessages = s.messages || [];

      // Add tab if it doesn't exist yet (this can happen if session was resumed before copilot:ready)
      setTabs((prev) => {
        if (prev.some((tab) => tab.id === s.sessionId)) {
          // Tab exists, update with pre-loaded messages if available
          if (preloadedMessages.length > 0) {
            return prev.map((tab) =>
              tab.id === s.sessionId
                ? {
                    ...tab,
                    messages: preloadedMessages.map((m, i) => ({
                      id: `hist-${i}`,
                      ...m,
                      isStreaming: false,
                    })),
                    needsTitle: false,
                    activeAgentName: s.activeAgentName ?? tab.activeAgentName,
                  }
                : tab
            );
          }
          return prev;
        }
        const storedLisaConfig = sessionStorage.getItem(`lisaConfig-${s.sessionId}`);
        const lisaConfig = storedLisaConfig ? JSON.parse(storedLisaConfig) : undefined;
        return [
          ...prev,
          {
            id: s.sessionId,
            name: s.name || `Session ${prev.length + 1}`,
            messages: preloadedMessages.map((m, i) => ({
              id: `hist-${i}`,
              ...m,
              isStreaming: false,
            })),
            model: s.model,
            cwd: s.cwd,
            isProcessing: false,
            activeTools: [],
            hasUnreadCompletion: false,
            pendingConfirmations: [],
            needsTitle: !s.name && preloadedMessages.length === 0,
            alwaysAllowed: s.alwaysAllowed || [],
            editedFiles: s.editedFiles || [],
            untrackedFiles: s.untrackedFiles || [],
            fileViewMode: s.fileViewMode || 'flat',
            currentIntent: null,
            currentIntentTimestamp: null,
            gitBranchRefresh: 0,
            lisaConfig,
            yoloMode: s.yoloMode,
            activeAgentName: s.activeAgentName,
          },
        ];
      });

      // Only set active tab if none is set yet (don't switch tabs when loading in background)
      setActiveTabId((currentActive) => currentActive || s.sessionId);

      // Only fetch messages if they weren't pre-loaded
      if (preloadedMessages.length === 0) {
        // Load messages now that the session is actually resumed and ready
        Promise.all([
          window.electronAPI.copilot.getMessages(s.sessionId),
          window.electronAPI.copilot.loadMessageAttachments(s.sessionId),
        ])
          .then(([messages, attachmentsResult]) => {
            if (messages.length > 0) {
              const attachmentMap = new Map(
                attachmentsResult.attachments.map((a) => [a.messageIndex, a])
              );
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === s.sessionId
                    ? {
                        ...tab,
                        messages: messages.map((m, i) => {
                          const att = attachmentMap.get(i);
                          return {
                            id: `hist-${i}`,
                            ...m,
                            isStreaming: false,
                            imageAttachments: att?.imageAttachments,
                            fileAttachments: att?.fileAttachments,
                          };
                        }),
                        needsTitle: false,
                      }
                    : tab
                )
              );
            }
          })
          .catch((err) => console.error(`Failed to load history for ${s.sessionId}:`, err));
      } else {
        // Still load attachments for pre-loaded messages
        window.electronAPI.copilot
          .loadMessageAttachments(s.sessionId)
          .then((attachmentsResult) => {
            if (attachmentsResult.attachments.length > 0) {
              const attachmentMap = new Map(
                attachmentsResult.attachments.map((a) => [a.messageIndex, a])
              );
              setTabs((prev) =>
                prev.map((tab) =>
                  tab.id === s.sessionId
                    ? {
                        ...tab,
                        messages: tab.messages.map((m, i) => {
                          const att = attachmentMap.get(i);
                          return att
                            ? {
                                ...m,
                                imageAttachments: att.imageAttachments,
                                fileAttachments: att.fileAttachments,
                              }
                            : m;
                        }),
                      }
                    : tab
                )
              );
            }
          })
          .catch((err) => console.error(`Failed to load attachments for ${s.sessionId}:`, err));
      }
    });

    // Also fetch models in case ready event was missed (baseline list only)
    window.electronAPI.copilot
      .getModels()
      .then((data) => {
        console.log('Fetched models:', data);
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          setStatus('connected');
        }
      })
      .catch((err) => console.log('getModels failed (SDK may still be initializing):', err));

    const unsubscribeDelta = window.electronAPI.copilot.onDelta((data) => {
      const { sessionId, content } = data;
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;
          const last = tab.messages[tab.messages.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            return {
              ...tab,
              messages: [
                ...tab.messages.slice(0, -1),
                { ...last, content: last.content + content },
              ],
            };
          }
          return tab;
        })
      );
    });

    const unsubscribeMessage = window.electronAPI.copilot.onMessage((data) => {
      const { sessionId, content } = data;
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;

          // Clear pending injection flags on all user messages since agent has now responded
          const messagesWithClearedPending = tab.messages.map((msg) =>
            msg.isPendingInjection ? { ...msg, isPendingInjection: false } : msg
          );

          const last = messagesWithClearedPending[messagesWithClearedPending.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            return {
              ...tab,
              messages: [
                ...messagesWithClearedPending.slice(0, -1),
                { ...last, content, isStreaming: false, timestamp: Date.now() },
              ],
            };
          }
          return {
            ...tab,
            messages: [
              ...messagesWithClearedPending,
              {
                id: generateId(),
                role: 'assistant',
                content,
                isStreaming: false,
                timestamp: Date.now(),
              },
            ],
          };
        })
      );
    });

    const unsubscribeIdle = window.electronAPI.copilot.onIdle((data) => {
      const { sessionId } = data;

      // Deduplicate idle events - if we processed one very recently for this session, skip
      // This prevents double-processing from React StrictMode or rapid duplicate events
      const now = Date.now();
      const lastIdle = lastIdleTimestampRef.current.get(sessionId) || 0;
      if (now - lastIdle < 500) {
        console.log(
          `[Idle] Skipping duplicate idle event for session ${sessionId} (${now - lastIdle}ms since last)`
        );
        return;
      }
      lastIdleTimestampRef.current.set(sessionId, now);

      // Play notification sound when session completes
      if (soundEnabledRef.current) {
        playNotificationSound();
      }

      // Speak the last assistant response (TTS) - only for active tab
      setTabs((currentTabs) => {
        const tab = currentTabs.find((t) => t.id === sessionId);
        if (tab && sessionId === activeTabIdRef.current) {
          const lastAssistant = [...tab.messages].reverse().find((m) => m.role === 'assistant');
          if (lastAssistant?.content) {
            voiceSpeakRef.current(lastAssistant.content);
          }
        }
        return currentTabs; // No state change, just reading
      });

      // Update tab state
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === sessionId);

        // Check for Ralph loop continuation
        if (tab?.ralphConfig?.active) {
          const lastMessage = tab.messages[tab.messages.length - 1];
          const hasCompletionPromise = lastMessage?.content?.includes(RALPH_COMPLETION_SIGNAL);
          const maxReached = tab.ralphConfig.currentIteration >= tab.ralphConfig.maxIterations;

          if (!hasCompletionPromise && !maxReached) {
            // Continue Ralph loop
            const nextIteration = tab.ralphConfig.currentIteration + 1;
            console.log(`[Ralph] Iteration ${nextIteration}/${tab.ralphConfig.maxIterations}`);

            const screenshotChecklistItem = tab.ralphConfig.requireScreenshot
              ? '\n- [ ] Screenshot taken of the delivered feature'
              : '';

            // Build continuation prompt based on context clearing setting
            // If clearContextBetweenIterations is true, we provide minimal context (like Gemini Ralph)
            // and instruct the agent to re-read files for state (reduces context pollution)
            const clearContext = tab.ralphConfig.clearContextBetweenIterations ?? true;
            const lastResponseContent = lastMessage?.content || '';

            let continuationPrompt: string;

            if (clearContext) {
              // Gemini-style: Clear context, rely on file state
              // This forces agent to read ralph-progress.md and git status for context
              continuationPrompt = `🔄 **Ralph Loop - Iteration ${nextIteration}/${tab.ralphConfig.maxIterations}**

⚠️ **CONTEXT CLEARED** - Previous chat history is not available. You must re-read file state.

## 🔍 GET UP TO SPEED (Do these first!)

Before continuing work, you MUST:

1. **Read \`${RALPH_PROGRESS_FILENAME}\`** - See what was done in previous iterations
2. **Run \`git status\` and \`git log --oneline -10\`** - See recent changes
3. **Check if build passes** - Run \`npm run build\` or equivalent
4. **Review your plan** - See what tasks remain

## Original Task:

${tab.ralphConfig.originalPrompt}

---

## Continue Working

After getting up to speed, continue where the previous iteration left off.

**Update \`${RALPH_PROGRESS_FILENAME}\`** with this iteration's progress:
\`\`\`markdown
## Iteration ${nextIteration} - ${new Date().toISOString()}
### Status: IN PROGRESS
### What I'm working on:
- [describe current work]

### Completed this iteration:
- [list items]

### Next steps:
- [list remaining work]
\`\`\`

## ✅ COMPLETION CHECKLIST

Verify ALL before signaling complete:
- [ ] All plan items checked off
- [ ] Code builds without errors
- [ ] Feature tested and working (actually ran the app)
- [ ] No console errors introduced
- [ ] Tests added/updated if applicable${screenshotChecklistItem}
- [ ] \`${RALPH_PROGRESS_FILENAME}\` updated with final status

Only output ${RALPH_COMPLETION_SIGNAL} when ALL items above are verified complete.`;
            } else {
              // Traditional mode: Include previous response in context
              continuationPrompt = `🔄 **Ralph Loop - Iteration ${nextIteration}/${tab.ralphConfig.maxIterations}**

---

## Your Previous Response (for context):

${lastResponseContent}

---

## Original Task:

${tab.ralphConfig.originalPrompt}

---

## Continue Working

Continue where you left off. Check your plan, verify what's done, and complete remaining items.

**Update \`${RALPH_PROGRESS_FILENAME}\`** with progress.

COMPLETION CHECKLIST (verify ALL before signaling complete):
- [ ] Plan exists and all items checked off
- [ ] Code builds without errors
- [ ] Feature tested and working (actually ran the app)
- [ ] No console errors introduced
- [ ] Tests added/updated if applicable${screenshotChecklistItem}

Only output ${RALPH_COMPLETION_SIGNAL} when ALL items above are verified complete.`;
            }

            // Schedule the re-send after state update
            // If clearing context, we may want to reset the session in the future
            // For now, we just use a fresh prompt that instructs reading files
            setTimeout(() => {
              window.electronAPI.copilot.send(sessionId, continuationPrompt);
            }, 100);

            // Update iteration count and keep processing
            return prev.map((t) => {
              if (t.id !== sessionId) return t;
              return {
                ...t,
                ralphConfig: {
                  ...t.ralphConfig!,
                  currentIteration: nextIteration,
                },
                // Keep processing state, clear streaming
                messages: t.messages.map((msg) =>
                  msg.isStreaming ? { ...msg, isStreaming: false } : msg
                ),
              };
            });
          } else {
            // Ralph loop complete - stop it and close settings
            console.log(
              `[Ralph] Loop complete. Reason: ${hasCompletionPromise ? 'completion promise found' : 'max iterations reached'}`
            );
            setShowRalphSettings(false);
            setShowLisaSettings(false);
          }
        }

        // Check for Lisa Simpson loop continuation
        if (tab?.lisaConfig?.active) {
          const lastMessage = tab.messages[tab.messages.length - 1];
          const lastContent = lastMessage?.content || '';
          const hasPhaseComplete = lastContent.includes(LISA_PHASE_COMPLETE_SIGNAL);
          const hasReviewApprove = lastContent.includes(LISA_REVIEW_APPROVE_SIGNAL);
          const hasReviewReject = lastContent.includes(LISA_REVIEW_REJECT_PREFIX);
          const currentPhase = tab.lisaConfig.currentPhase;
          const currentVisitCount = tab.lisaConfig.phaseIterations[currentPhase] || 1;

          // New phase flow: plan → plan-review → execute → code-review → validate → final-review → COMPLETE
          const getNextPhase = (phase: LisaPhase): LisaPhase | null => {
            const phaseFlow: Record<LisaPhase, LisaPhase | null> = {
              plan: 'plan-review',
              'plan-review': 'execute', // After plan approved
              execute: 'code-review',
              'code-review': 'validate', // After code approved
              validate: 'final-review',
              'final-review': null, // Loop complete after final approval
            };
            return phaseFlow[phase];
          };

          // Helper to get phase display name
          const getPhaseDisplayName = (phase: LisaPhase): string => {
            const names: Record<LisaPhase, string> = {
              plan: 'Planner',
              'plan-review': 'Plan Review',
              execute: 'Coder',
              'code-review': 'Code Review',
              validate: 'Tester',
              'final-review': 'Final Review',
            };
            return names[phase];
          };

          // Is this a review phase?
          const isReviewPhase = ['plan-review', 'code-review', 'final-review'].includes(
            currentPhase
          );

          // Check if we should continue or transition
          let shouldContinue = false;
          let nextPhase: LisaPhase | null = null;
          let rejectToPhase: LisaPhase | null = null;

          if (isReviewPhase && hasReviewApprove) {
            // Review approved - move to next phase (or complete if final-review)
            nextPhase = getNextPhase(currentPhase);
            if (nextPhase) {
              console.log(
                `[Lisa] ${getPhaseDisplayName(currentPhase)} approved! Moving to ${getPhaseDisplayName(nextPhase)}`
              );
              shouldContinue = true;
            } else {
              // Final review approved - Lisa loop complete!
              console.log(`[Lisa] Final review approved! Loop complete.`);
              shouldContinue = false;
            }
          } else if (isReviewPhase && hasReviewReject) {
            // Review rejected - extract phase to return to
            const rejectMatch = lastContent.match(
              new RegExp(
                `${LISA_REVIEW_REJECT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(plan|execute|validate)`
              )
            );
            if (rejectMatch) {
              rejectToPhase = rejectMatch[1] as LisaPhase;
              console.log(
                `[Lisa] ${getPhaseDisplayName(currentPhase)} rejected, returning to ${getPhaseDisplayName(rejectToPhase)}`
              );
              shouldContinue = true;
            }
          } else if (hasPhaseComplete && !isReviewPhase) {
            // Non-review phase complete - move to its review phase
            nextPhase = getNextPhase(currentPhase);
            if (nextPhase) {
              console.log(
                `[Lisa] ${getPhaseDisplayName(currentPhase)} complete, moving to ${getPhaseDisplayName(nextPhase)}`
              );
              shouldContinue = true;
            }
          } else if (!hasPhaseComplete && !hasReviewApprove && !hasReviewReject) {
            // Continue current phase (no signal received yet)
            shouldContinue = true;
          }

          if (shouldContinue) {
            const targetPhase = rejectToPhase || nextPhase || currentPhase;
            const isNewPhase = targetPhase !== currentPhase;
            const targetVisitCount = isNewPhase ? 1 : currentVisitCount + 1;

            console.log(`[Lisa] ${getPhaseDisplayName(targetPhase)} - Visit #${targetVisitCount}`);

            // Build phase-specific continuation prompt
            const continuationPrompt = buildLisaPhasePrompt(
              targetPhase,
              targetVisitCount,
              tab.lisaConfig.originalPrompt,
              lastContent,
              rejectToPhase ? `Reviewer feedback: ${lastContent}` : undefined
            );

            // Schedule the re-send after state update
            setTimeout(() => {
              window.electronAPI.copilot.send(sessionId, continuationPrompt);
            }, 100);

            // Update phase and visit count
            return prev.map((t) => {
              if (t.id !== sessionId) return t;
              const newPhaseIterations = { ...t.lisaConfig!.phaseIterations };
              if (isNewPhase) {
                newPhaseIterations[targetPhase] = 1;
              } else {
                newPhaseIterations[targetPhase] = targetVisitCount;
              }
              return {
                ...t,
                lisaConfig: {
                  ...t.lisaConfig!,
                  currentPhase: targetPhase,
                  phaseIterations: newPhaseIterations,
                  phaseHistory: [
                    ...t.lisaConfig!.phaseHistory,
                    { phase: targetPhase, iteration: targetVisitCount, timestamp: Date.now() },
                  ],
                },
                messages: t.messages.map((msg) =>
                  msg.isStreaming ? { ...msg, isStreaming: false } : msg
                ),
              };
            });
          } else {
            // Lisa loop complete - close settings
            console.log(
              `[Lisa] Loop complete. Phase: ${currentPhase}, Reason: ${hasReviewApprove ? 'final review approved' : 'no continuation needed'}`
            );
            setShowRalphSettings(false);
            setShowLisaSettings(false);
          }
        }

        // If tab needs a title and has messages, trigger title generation
        if (tab?.needsTitle && tab.messages.length > 0) {
          // Build conversation summary for title generation
          const conversation = tab.messages
            .filter((m) => m.content.trim())
            .slice(0, 4) // First few messages only
            .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
            .join('\n');

          // Generate title async (don't await here)
          window.electronAPI.copilot
            .generateTitle(conversation)
            .then((title) => {
              setTabs((p) =>
                p.map((t) => (t.id === sessionId ? { ...t, name: title, needsTitle: false } : t))
              );
            })
            .catch((err) => {
              console.error('Failed to generate title:', err);
              // Fall back to truncated first message
              const firstUserMsg = tab.messages.find((m) => m.role === 'user')?.content;
              if (firstUserMsg) {
                const fallback =
                  firstUserMsg.slice(0, 30) + (firstUserMsg.length > 30 ? '...' : '');
                setTabs((p) =>
                  p.map((t) =>
                    t.id === sessionId ? { ...t, name: fallback, needsTitle: false } : t
                  )
                );
              }
            });
        }

        // Detect if the last assistant message contains choice options
        if (tab) {
          const lastAssistantMsg = [...tab.messages]
            .reverse()
            .find((m) => m.role === 'assistant' && m.content.trim());
          if (lastAssistantMsg?.content) {
            window.electronAPI.copilot
              .detectChoices(lastAssistantMsg.content)
              .then((result) => {
                if (result.isChoice && result.options) {
                  setTabs((p) =>
                    p.map((t) =>
                      t.id === sessionId ? { ...t, detectedChoices: result.options } : t
                    )
                  );
                }
              })
              .catch((err) => {
                console.error('Failed to detect choices:', err);
              });
          }
        }

        return prev.map((tab) => {
          if (tab.id !== sessionId) return tab;
          // Capture tools into the last assistant message before clearing
          const toolsSnapshot = [...tab.activeTools];
          const filteredMessages = tab.messages.filter(
            (msg) => msg.content.trim() || msg.role === 'user'
          );
          // Find the last assistant message to attach tools
          const lastAssistantIdx = filteredMessages.reduce(
            (lastIdx, msg, idx) => (msg.role === 'assistant' ? idx : lastIdx),
            -1
          );
          const updatedMessages = filteredMessages.map((msg, idx) => {
            const withoutStreaming = msg.isStreaming ? { ...msg, isStreaming: false } : msg;
            // Attach tools to the last assistant message
            if (idx === lastAssistantIdx && toolsSnapshot.length > 0) {
              return { ...withoutStreaming, tools: toolsSnapshot };
            }
            return withoutStreaming;
          });
          return {
            ...tab,
            isProcessing: false,
            activeTools: [],
            currentIntent: null,
            currentIntentTimestamp: null,
            // Deactivate Ralph if it was active
            ralphConfig: tab.ralphConfig?.active
              ? { ...tab.ralphConfig, active: false }
              : tab.ralphConfig,
            // Deactivate Lisa if it was active
            lisaConfig: tab.lisaConfig?.active
              ? { ...tab.lisaConfig, active: false }
              : tab.lisaConfig,
            // Mark as unread if this tab is not currently active
            hasUnreadCompletion: tab.id !== activeTabIdRef.current,
            messages: updatedMessages,
          };
        });
      });

      // Focus textarea when response completes for the active tab
      // (but not if there are pending confirmations requiring user action)
      if (sessionId === activeTabIdRef.current) {
        setTabs((currentTabs) => {
          const tab = currentTabs.find((t) => t.id === sessionId);
          if (tab && tab.pendingConfirmations.length === 0) {
            inputRef.current?.focus();
          }
          return currentTabs;
        });
      }
    });

    const unsubscribeToolStart = window.electronAPI.copilot.onToolStart((data) => {
      const { sessionId, toolCallId, toolName, input } = data;
      const name = toolName || 'unknown';
      const id = toolCallId || generateId();

      console.log(`[Tool Start] ${name}: toolCallId=${toolCallId}, id=${id}, input=`, input);

      // Capture intent from report_intent tool
      if (name === 'report_intent') {
        const intent = input?.intent as string | undefined;
        if (intent) {
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === sessionId
                ? { ...tab, currentIntent: intent, currentIntentTimestamp: Date.now() }
                : tab
            )
          );
        }
        return;
      }

      // Skip other internal tools
      if (name === 'update_todo') return;

      // Track edited/created files at start time (we have reliable input here)
      const isFileOperation = name === 'edit' || name === 'create';

      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;

          // Track edited/created files at start time (we have reliable input here)
          let newEditedFiles = tab.editedFiles;
          if (isFileOperation && input) {
            const path = input.path as string | undefined;
            if (path && !tab.editedFiles.includes(path)) {
              newEditedFiles = [...tab.editedFiles, path];
              console.log(`[Tool Start] Added to editedFiles:`, newEditedFiles);
            }
          }

          return {
            ...tab,
            editedFiles: newEditedFiles,
            activeTools: [
              ...tab.activeTools,
              { toolCallId: id, toolName: name, status: 'running', input },
            ],
          };
        })
      );
    });

    const unsubscribeToolEnd = window.electronAPI.copilot.onToolEnd((data) => {
      const { sessionId, toolCallId, toolName, input, output } = data;
      const name = toolName || 'unknown';

      console.log(`[Tool End] ${name}:`, {
        toolCallId,
        input,
        hasInput: !!input,
      });

      // Skip internal tools
      if (name === 'report_intent' || name === 'update_todo') return;

      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;

          // Get the tool's input from activeTools (more reliable than event data)
          const activeTool = tab.activeTools.find((t) => t.toolCallId === toolCallId);
          const toolInput = input || activeTool?.input;

          return {
            ...tab,
            activeTools: tab.activeTools.map((t) =>
              t.toolCallId === toolCallId
                ? {
                    ...t,
                    status: 'done' as const,
                    input: toolInput || t.input,
                    output,
                  }
                : t
            ),
          };
        })
      );
    });

    // Listen for permission requests
    const unsubscribePermission = window.electronAPI.copilot.onPermission((data) => {
      console.log('Permission requested (full data):', JSON.stringify(data, null, 2));
      const sessionId = data.sessionId as string;
      const requestPath = data.path as string | undefined;

      // Auto-approve reads for user-attached files (files user explicitly uploaded)
      if (requestPath && (data.kind === 'read' || data.kind === 'file-read')) {
        const sessionPaths = userAttachedPathsRef.current.get(sessionId);
        if (sessionPaths?.has(requestPath)) {
          console.log('Auto-approving read for user-attached file:', requestPath);
          window.electronAPI.copilot.respondPermission({
            requestId: data.requestId,
            decision: 'approved',
          });
          return;
        }
      }

      // Play notification sound when permission is needed
      if (soundEnabledRef.current) {
        playNotificationSound();
      }

      // Spread all data to preserve any extra fields from SDK
      const confirmation: PendingConfirmation = {
        ...data,
        requestId: data.requestId,
        sessionId,
        kind: data.kind,
        executable: data.executable,
        toolCallId: data.toolCallId as string | undefined,
        fullCommandText: data.fullCommandText as string | undefined,
        intention: data.intention as string | undefined,
        description: data.description as string | undefined,
        path: data.path as string | undefined,
        url: data.url as string | undefined,
        serverName: data.serverName as string | undefined,
        toolName: data.toolName as string | undefined,
        toolTitle: data.toolTitle as string | undefined,
        isOutOfScope: data.isOutOfScope as boolean | undefined,
        content: data.content as string | undefined,
      };
      // Add to pending confirmations queue (don't replace existing ones)
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === sessionId
            ? {
                ...tab,
                pendingConfirmations: [...tab.pendingConfirmations, confirmation],
              }
            : tab
        )
      );
    });

    const unsubscribeError = window.electronAPI.copilot.onError((data) => {
      const { sessionId, message } = data;
      console.error('Copilot error:', message);

      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;
          const newMessages = !message.includes('invalid_request_body')
            ? [
                ...tab.messages,
                {
                  id: generateId(),
                  role: 'assistant' as const,
                  content: `⚠️ ${message}`,
                  timestamp: Date.now(),
                },
              ]
            : tab.messages;
          return { ...tab, isProcessing: false, messages: newMessages };
        })
      );
    });

    // Listen for verified models update (async verification after startup)
    const unsubscribeModelsVerified = window.electronAPI.copilot.onModelsVerified((data) => {
      console.log('Models verified:', data.models.length, 'available');
      setAvailableModels(data.models);
    });

    // Listen for context usage info updates
    const unsubscribeUsageInfo = window.electronAPI.copilot.onUsageInfo((data) => {
      const { sessionId, tokenLimit, currentTokens, messagesLength } = data;
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === sessionId
            ? {
                ...tab,
                contextUsage: { tokenLimit, currentTokens, messagesLength },
              }
            : tab
        )
      );
    });

    // Listen for compaction start
    const unsubscribeCompactionStart = window.electronAPI.copilot.onCompactionStart((data) => {
      const { sessionId } = data;
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === sessionId
            ? {
                ...tab,
                compactionStatus: 'compacting' as const,
              }
            : tab
        )
      );
    });

    // Listen for compaction complete
    const unsubscribeCompactionComplete = window.electronAPI.copilot.onCompactionComplete(
      (data) => {
        const {
          sessionId,
          success,
          preCompactionTokens,
          postCompactionTokens,
          tokensRemoved,
          summaryContent,
          error,
        } = data;
        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.id !== sessionId) return tab;

            // Add a system message about the compaction
            const compactionMessage: Message = {
              id: generateId(),
              role: 'system',
              content: success
                ? `📦 Context compacted: ${(tokensRemoved || 0).toLocaleString()} tokens removed (${((preCompactionTokens || 0) / 1000).toFixed(0)}K → ${((postCompactionTokens || 0) / 1000).toFixed(0)}K)${summaryContent ? `\n\n**Summary:**\n${summaryContent}` : ''}`
                : `⚠️ Context compaction failed: ${error || 'Unknown error'}`,
              timestamp: Date.now(),
            };

            return {
              ...tab,
              compactionStatus: 'idle' as const,
              messages: [...tab.messages, compactionMessage],
            };
          })
        );
      }
    );

    const unsubscribeYoloModeChanged = window.electronAPI.copilot.onYoloModeChanged((data) => {
      if (data.enabled && data.flushedCount > 0) {
        // Clear pending confirmations that were flushed by the backend
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === data.sessionId ? { ...tab, pendingConfirmations: [] } : tab
          )
        );
      }
    });

    return () => {
      unsubscribeReady();
      unsubscribeDelta();
      unsubscribeMessage();
      unsubscribeIdle();
      unsubscribeToolStart();
      unsubscribeToolEnd();
      unsubscribePermission();
      unsubscribeError();
      unsubscribeSessionResumed();
      unsubscribeModelsVerified();
      unsubscribeUsageInfo();
      unsubscribeCompactionStart();
      unsubscribeCompactionComplete();
      unsubscribeYoloModeChanged();
    };
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (
      !inputValue.trim() &&
      !terminalAttachment &&
      imageAttachments.length === 0 &&
      fileAttachments.length === 0
    )
      return;
    if (!activeTab) return;

    // If there are pending confirmations, automatically deny them when sending a new message
    // Note: Only the first confirmation is denied (confirmations are processed sequentially)
    // This matches the behavior of handleConfirmation which also processes one at a time
    if (activeTab.pendingConfirmations.length > 0) {
      const pendingConfirmation = activeTab.pendingConfirmations[0];

      // Deny the pending confirmation
      try {
        await window.electronAPI.copilot.respondPermission({
          requestId: pendingConfirmation.requestId,
          decision: 'denied',
        });
      } catch (error) {
        console.error('Error denying pending confirmation:', error);
      }

      // Remove this confirmation from the queue
      const remainingConfirmations = activeTab.pendingConfirmations.slice(1);

      // Add a system message showing what was denied
      let deniedContent = '🚫 **Denied:** ';
      if (pendingConfirmation.kind === 'command' || pendingConfirmation.kind === 'bash') {
        deniedContent += `Command execution`;
        if (pendingConfirmation.fullCommandText) {
          deniedContent += `\n\`\`\`\n${pendingConfirmation.fullCommandText}\n\`\`\``;
        } else if (pendingConfirmation.executable) {
          deniedContent += ` \`${pendingConfirmation.executable}\``;
        }
      } else if (pendingConfirmation.kind === 'mcp') {
        deniedContent += `MCP tool \`${pendingConfirmation.toolName || pendingConfirmation.toolTitle || 'unknown'}\``;
        if (pendingConfirmation.serverName) {
          deniedContent += ` from server \`${pendingConfirmation.serverName}\``;
        }
      } else if (pendingConfirmation.kind === 'url') {
        deniedContent += `URL fetch`;
        if (pendingConfirmation.url) {
          deniedContent += `: ${pendingConfirmation.url}`;
        }
      } else if (pendingConfirmation.kind === 'write' || pendingConfirmation.kind === 'edit') {
        deniedContent += `File ${pendingConfirmation.kind}`;
        if (pendingConfirmation.path) {
          deniedContent += `: \`${pendingConfirmation.path}\``;
        }
      } else if (pendingConfirmation.kind === 'read') {
        deniedContent += `File read`;
        if (pendingConfirmation.path) {
          deniedContent += `: \`${pendingConfirmation.path}\``;
        }
      } else {
        deniedContent += `${pendingConfirmation.kind}`;
        if (pendingConfirmation.path) {
          deniedContent += `: \`${pendingConfirmation.path}\``;
        }
      }

      const deniedMessage: Message = {
        id: generateId(),
        role: 'system',
        content: deniedContent,
        timestamp: Date.now(),
      };

      updateTab(activeTab.id, {
        pendingConfirmations: remainingConfirmations,
        messages: [...activeTab.messages, deniedMessage],
      });
    }

    // Build message content with terminal attachment if present
    let messageContent = inputValue.trim();
    if (terminalAttachment) {
      const terminalBlock = `\`\`\`bash\n${terminalAttachment.output}\n\`\`\``;
      messageContent = messageContent
        ? `${messageContent}\n\nTerminal output:\n${terminalBlock}`
        : `Terminal output:\n${terminalBlock}`;
    }

    // 👻 GHOST PROTECTION: Detect if user is starting a new task while Ralph is active
    // If the message doesn't look like a continuation/instruction, cancel the Ralph loop
    if (activeTab.ralphConfig?.active && messageContent.trim()) {
      const originalPrompt = activeTab.ralphConfig.originalPrompt;
      const currentMessage = messageContent.trim().toLowerCase();

      // Common continuation phrases that should NOT trigger ghost protection
      const continuationPhrases = [
        'continue',
        'keep going',
        'proceed',
        'go ahead',
        'yes',
        'ok',
        'okay',
        'fix',
        'try again',
        'retry',
        'debug',
        'help',
        'stop',
        'cancel',
        'abort',
      ];

      // Check if this looks like a completely new task (not a continuation)
      const isNewTask =
        !continuationPhrases.some((phrase) => currentMessage.includes(phrase)) &&
        currentMessage.length > 50 && // Substantial new message
        !currentMessage.includes(RALPH_COMPLETION_SIGNAL.toLowerCase());

      if (isNewTask) {
        console.log(
          '[Ralph] 👻 Ghost protection triggered - new task detected, cancelling Ralph loop'
        );
        // Cancel the Ralph loop
        updateTab(activeTab.id, {
          ralphConfig: { ...activeTab.ralphConfig, active: false },
        });
        // Show notification (toast would be better, but for now just log)
        console.log('[Ralph] Loop cancelled - you started a new task');
        // Don't return - let the new message be sent normally
      }
    }

    // If agent is processing, send message immediately with enqueue mode
    // This injects the message into the agent's thinking queue rather than waiting for idle
    if (activeTab.isProcessing) {
      const injection: PendingInjection = {
        content: messageContent,
        imageAttachments: imageAttachments.length > 0 ? [...imageAttachments] : undefined,
        fileAttachments: fileAttachments.length > 0 ? [...fileAttachments] : undefined,
        terminalAttachment: terminalAttachment ? { ...terminalAttachment } : undefined,
      };

      // Build SDK attachments
      const sdkAttachments = [
        ...imageAttachments.map((img) => ({
          type: 'file' as const,
          path: img.path,
          displayName: img.name,
        })),
        ...fileAttachments.map((file) => ({
          type: 'file' as const,
          path: file.path,
          displayName: file.name,
        })),
      ];

      // Track attached paths for auto-approval
      if (sdkAttachments.length > 0) {
        const sessionPaths = userAttachedPathsRef.current.get(activeTab.id) || new Set<string>();
        sdkAttachments.forEach((att) => sessionPaths.add(att.path));
        userAttachedPathsRef.current.set(activeTab.id, sessionPaths);
      }

      // Create user message for display - mark as pending injection
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: messageContent,
        imageAttachments: imageAttachments.length > 0 ? [...imageAttachments] : undefined,
        fileAttachments: fileAttachments.length > 0 ? [...fileAttachments] : undefined,
        isPendingInjection: true, // Mark as pending until agent acknowledges
      };

      // Add user message to conversation (but don't add assistant placeholder since agent is already working)
      updateTab(activeTab.id, {
        messages: [...activeTab.messages, userMessage],
        draftInput: undefined, // Clear draft after sending
      });

      // Clear input immediately
      setInputValue('');
      setTerminalAttachment(null);
      setImageAttachments([]);
      setFileAttachments([]);

      // Send with enqueue mode to inject into agent's processing queue
      try {
        console.log(`[Injection] Sending enqueued message to session ${activeTab.id}`);
        await window.electronAPI.copilot.send(
          activeTab.id,
          messageContent,
          sdkAttachments.length > 0 ? sdkAttachments : undefined,
          'enqueue'
        );
      } catch (error) {
        console.error('Send injection error:', error);
        // Message is already shown to user, just log the error
      }
      return;
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: messageContent,
      imageAttachments: imageAttachments.length > 0 ? [...imageAttachments] : undefined,
      fileAttachments: fileAttachments.length > 0 ? [...fileAttachments] : undefined,
    };

    const tabId = activeTab.id;

    // Set up Ralph config if enabled - auto-inject completion instruction
    const startedAt = new Date().toISOString();
    const progressFilePath = activeTab?.cwd
      ? `${activeTab.cwd}/${RALPH_PROGRESS_FILENAME}`
      : RALPH_PROGRESS_FILENAME;
    const stateFilePath = activeTab?.cwd
      ? `${activeTab.cwd}/${RALPH_STATE_FILENAME}`
      : RALPH_STATE_FILENAME;

    const ralphConfig: RalphConfig | undefined = ralphEnabled
      ? {
          originalPrompt: userMessage.content,
          maxIterations: ralphMaxIterations,
          currentIteration: 1,
          active: true,
          requireScreenshot: ralphRequireScreenshot,
          clearContextBetweenIterations: ralphClearContext,
          startedAt,
          progressFilePath,
          stateFilePath,
        }
      : undefined;

    // Set up Lisa config if enabled - multi-phase analytical workflow
    const lisaConfig: LisaConfig | undefined = lisaEnabled
      ? {
          originalPrompt: userMessage.content,
          currentPhase: 'plan',
          phaseIterations: {
            plan: 1,
            'plan-review': 0,
            execute: 0,
            'code-review': 0,
            validate: 0,
            'final-review': 0,
          },
          active: true,
          phaseHistory: [{ phase: 'plan', iteration: 1, timestamp: Date.now() }],
          evidenceFolderPath: activeTab?.cwd ? `${activeTab.cwd}/evidence` : 'evidence',
        }
      : undefined;

    // Build screenshot requirement text if enabled
    const screenshotRequirement = ralphRequireScreenshot
      ? `

6. **Take Screenshot**: Before signaling completion, you MUST take a screenshot of the delivered feature:
   - Use the \`take_screenshot\` tool to capture the working feature
   - The screenshot should clearly show the feature in action
   - This is REQUIRED before you can signal completion`
      : '';

    // If Ralph is enabled, append detailed completion instructions to the prompt
    // If Lisa is enabled, start with the Plan phase prompt
    let promptToSend: string;
    if (lisaEnabled) {
      // Lisa Simpson loop - start with Plan phase
      promptToSend = buildLisaPhasePrompt(
        'plan',
        1,
        userMessage.content,
        '', // No previous response yet
        undefined
      );
    } else if (ralphEnabled) {
      // Enhanced Ralph prompt with progress file tracking (inspired by Gemini CLI Ralph and Anthropic research)
      promptToSend = `${userMessage.content}

## RALPH LOOP - AUTONOMOUS AGENT MODE

You are running in an **autonomous Ralph loop** (iteration 1/${ralphMaxIterations}). This loop will continue until you complete the task or reach the maximum iterations.

### 🚀 FIRST ITERATION SETUP

Since this is iteration 1, you MUST first:

1. **Create \`${RALPH_PROGRESS_FILENAME}\`** - Your progress tracking file:
   \`\`\`markdown
   # Ralph Progress Log
   
   ## Task
   ${userMessage.content.substring(0, 200)}${userMessage.content.length > 200 ? '...' : ''}
   
   ## Iteration 1 - ${new Date().toISOString()}
   ### Status: IN PROGRESS
   ### What I'm working on:
   - [describe current work]
   
   ### Completed:
   - (nothing yet)
   
   ### Next steps:
   - (list next actions)
   \`\`\`

2. **Create a detailed plan** - Before coding, outline all tasks needed

3. **Work incrementally** - Complete one task at a time, verify it works, then move on

### ✅ COMPLETION REQUIREMENTS

Before signaling completion, you MUST verify ALL of the following:

1. **Follow the Plan**: Check off ALL items in your plan. Go through each one.

2. **Test the Feature**: Actually build and run the application:
   - Run the build (e.g., \`npm run build\`)
   - Start the app if needed and test functionality
   - Verify expected behavior works end-to-end

3. **Check for Errors**: 
   - Fix any build errors or warnings
   - Check for console errors (runtime errors, React warnings, etc.)
   - Ensure no regressions

4. **Add Tests**: If the codebase has tests, add coverage for new functionality.

5. **Update Progress File**: Mark all items complete in \`${RALPH_PROGRESS_FILENAME}\`.${screenshotRequirement}

6. **Final Verification**: Go through each plan item one more time.

Only when ALL the above are verified complete, output exactly: ${RALPH_COMPLETION_SIGNAL}`;
    } else {
      promptToSend = userMessage.content;
    }

    // Build SDK attachments from image and file attachments
    const sdkAttachments = [
      ...imageAttachments.map((img) => ({
        type: 'file' as const,
        path: img.path,
        displayName: img.name,
      })),
      ...fileAttachments.map((file) => ({
        type: 'file' as const,
        path: file.path,
        displayName: file.name,
      })),
    ];

    // Track attached paths for auto-approval of permission requests
    if (sdkAttachments.length > 0) {
      const sessionPaths = userAttachedPathsRef.current.get(tabId) || new Set();
      sdkAttachments.forEach((att) => sessionPaths.add(att.path));
      userAttachedPathsRef.current.set(tabId, sessionPaths);
    }

    updateTab(tabId, {
      messages: [
        ...activeTab.messages,
        userMessage,
        {
          id: generateId(),
          role: 'assistant',
          content: '',
          isStreaming: true,
          timestamp: Date.now(),
        },
      ],
      isProcessing: true,
      activeTools: [],
      ralphConfig,
      lisaConfig,
      detectedChoices: undefined, // Clear any detected choices
      draftInput: undefined, // Clear draft after sending
    });
    setInputValue('');
    setTerminalAttachment(null);
    setImageAttachments([]);
    setFileAttachments([]);

    // Reset Ralph UI state after sending
    if (ralphEnabled) {
      setRalphEnabled(false);
      setShowRalphSettings(false);
      setRalphRequireScreenshot(false);
    }

    // Reset Lisa UI state after sending
    if (lisaEnabled) {
      setLisaEnabled(false);
      setShowLisaSettings(false);
    }

    try {
      await window.electronAPI.copilot.send(
        tabId,
        promptToSend,
        sdkAttachments.length > 0 ? sdkAttachments : undefined
      );
    } catch (error) {
      console.error('Send error:', error);
      updateTab(tabId, { isProcessing: false, ralphConfig: undefined, lisaConfig: undefined });
    }
  }, [
    inputValue,
    activeTab,
    updateTab,
    ralphEnabled,
    ralphMaxIterations,
    ralphRequireScreenshot,
    ralphClearContext,
    lisaEnabled,
    terminalAttachment,
    imageAttachments,
    fileAttachments,
  ]);

  // Keep ref in sync for voice auto-send
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Handle sending terminal output to the agent
  const handleSendTerminalOutput = useCallback(
    (output: string, lineCount: number, lastCommandStart?: number) => {
      if (!output.trim()) return;
      const trimmedOutput = output.trim();

      // If output exceeds threshold, show shrink modal
      if (lineCount > LONG_OUTPUT_LINE_THRESHOLD) {
        setPendingTerminalOutput({ output: trimmedOutput, lineCount, lastCommandStart });
      } else {
        // Store the terminal output as an attachment to be included in next message
        setTerminalAttachment({ output: trimmedOutput, lineCount });
        // Focus the input field
        inputRef.current?.focus();
      }
    },
    []
  );

  const handleCopyCommitErrorToMessage = useCallback(
    (message: string) => {
      if (!message.trim()) return;
      setInputValue((prev) => (prev.trim() ? `${prev}\n\n${message}` : message));
      commitModal.closeCommitModal();
      inputRef.current?.focus();
    },
    [commitModal]
  );

  // Handle confirmation from shrink modal
  const handleShrinkModalConfirm = useCallback((output: string, lineCount: number) => {
    setTerminalAttachment({ output, lineCount });
    setPendingTerminalOutput(null);
    inputRef.current?.focus();
  }, []);

  // Cancel a specific pending injection by index, or all if index not provided
  // Get model capabilities (with caching)
  const getModelCapabilitiesForModel = useCallback(
    async (modelId: string): Promise<ModelCapabilities> => {
      if (modelCapabilities[modelId]) {
        return modelCapabilities[modelId];
      }
      try {
        const capabilities = await window.electronAPI.copilot.getModelCapabilities(modelId);
        const newCapabilities: ModelCapabilities = {
          supportsVision: capabilities.supportsVision,
          visionLimits: capabilities.visionLimits,
        };
        setModelCapabilities((prev) => ({ ...prev, [modelId]: newCapabilities }));
        return newCapabilities;
      } catch (error) {
        console.error('Failed to get model capabilities:', error);
        return { supportsVision: false };
      }
    },
    [modelCapabilities]
  );

  // Check if current model supports vision
  const currentModelSupportsVision = useCallback((): boolean => {
    if (!activeTab) return false;
    const caps = modelCapabilities[activeTab.model];
    return caps?.supportsVision ?? false;
  }, [activeTab, modelCapabilities]);

  // Handle image file selection
  const handleImageSelect = useCallback(async (files: FileList | null) => {
    console.log('handleImageSelect called with files:', files?.length);
    if (!files || files.length === 0) return;

    const newAttachments: ImageAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log('Processing file:', file.name, 'type:', file.type);
      if (!file.type.startsWith('image/')) {
        console.log('Skipping non-image file:', file.name, file.type);
        continue;
      }

      // Read file as data URL for preview
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      console.log('Read dataUrl, length:', dataUrl.length);

      // Save to temp file for SDK
      const filename = `image-${Date.now()}-${i}${file.name.substring(file.name.lastIndexOf('.'))}`;
      const result = await window.electronAPI.copilot.saveImageToTemp(dataUrl, filename);
      console.log('saveImageToTemp result:', result);

      if (result.success && result.path) {
        newAttachments.push({
          id: generateId(),
          path: result.path,
          previewUrl: dataUrl,
          name: file.name,
          size: file.size,
          mimeType: file.type,
        });
      }
    }

    console.log('newAttachments:', newAttachments.length);
    if (newAttachments.length > 0) {
      setImageAttachments((prev) => [...prev, ...newAttachments]);
      inputRef.current?.focus();
    }
  }, []);

  // Handle removing an image attachment
  const handleRemoveImage = useCallback((id: string) => {
    setImageAttachments((prev) => prev.filter((img) => img.id !== id));
  }, []);

  // Handle file selection (non-image files)
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    console.log('handleFileSelect called with files:', files?.length);
    if (!files || files.length === 0) return;

    const newAttachments: FileAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log('Processing file:', file.name, 'type:', file.type);
      // Note: We allow all files including images - users can attach images as files if they prefer

      // In Electron, File objects from file picker have a path property
      // Use it directly to avoid copying and trust issues
      const electronFile = file as File & { path?: string };
      if (electronFile.path) {
        console.log('Using original file path:', electronFile.path);
        newAttachments.push({
          id: generateId(),
          path: electronFile.path,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
        });
        continue;
      }

      // Fallback: Read file as data URL and save to temp (for pasted/dropped files without path)
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      console.log('Read dataUrl, length:', dataUrl.length);

      // Save to temp file for SDK
      const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
      const filename = `file-${Date.now()}-${i}${ext}`;
      const mimeType = file.type || 'application/octet-stream';
      const result = await window.electronAPI.copilot.saveFileToTemp(dataUrl, filename, mimeType);
      console.log('saveFileToTemp result:', result);

      if (result.success && result.path) {
        newAttachments.push({
          id: generateId(),
          path: result.path,
          name: file.name,
          size: result.size || file.size,
          mimeType: mimeType,
        });
      }
    }

    console.log('newAttachments:', newAttachments.length);
    if (newAttachments.length > 0) {
      setFileAttachments((prev) => [...prev, ...newAttachments]);
      inputRef.current?.focus();
    }
  }, []);

  // Handle removing a file attachment
  const handleRemoveFile = useCallback((id: string) => {
    setFileAttachments((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Handle paste event for images and files
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      const otherFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            if (item.type.startsWith('image/')) {
              imageFiles.push(file);
            } else {
              otherFiles.push(file);
            }
          }
        }
      }

      if (imageFiles.length > 0 || otherFiles.length > 0) {
        e.preventDefault();

        if (imageFiles.length > 0) {
          const dataTransfer = new DataTransfer();
          imageFiles.forEach((f) => dataTransfer.items.add(f));
          await handleImageSelect(dataTransfer.files);
        }

        if (otherFiles.length > 0) {
          const dataTransfer = new DataTransfer();
          otherFiles.forEach((f) => dataTransfer.items.add(f));
          await handleFileSelect(dataTransfer.files);
        }
      }
    },
    [handleImageSelect, handleFileSelect]
  );

  // Handle drag events for images and files
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const hasImages = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    );
    const hasFiles = Array.from(e.dataTransfer.items).some(
      (item) => item.kind === 'file' && !item.type.startsWith('image/')
    );

    if (hasImages) {
      setIsDraggingImage(true);
    }
    if (hasFiles) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
    setIsDraggingFile(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingImage(false);
      setIsDraggingFile(false);

      // In Electron, we need to get file paths differently
      const files = e.dataTransfer.files;

      // Try to get files from dataTransfer.files first - separate images and other files
      if (files.length > 0) {
        console.log('Drop event - using files:', files.length);
        const imageFiles: File[] = [];
        const otherFiles: File[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (
            file.type.startsWith('image/') ||
            file.name.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i)
          ) {
            imageFiles.push(file);
          } else {
            otherFiles.push(file);
          }
        }
        if (imageFiles.length > 0) {
          const dataTransfer = new DataTransfer();
          imageFiles.forEach((f) => dataTransfer.items.add(f));
          await handleImageSelect(dataTransfer.files);
        }
        if (otherFiles.length > 0) {
          const dataTransfer = new DataTransfer();
          otherFiles.forEach((f) => dataTransfer.items.add(f));
          await handleFileSelect(dataTransfer.files);
        }
        return;
      }

      // Try getting files from items
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const imageFiles: File[] = [];
        const otherFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log('Item:', item.kind, item.type);
          if (item.kind === 'file') {
            const file = item.getAsFile();
            console.log('File from item:', file?.name, file?.type, file?.size);
            if (file) {
              if (
                file.type.startsWith('image/') ||
                file.name.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i)
              ) {
                imageFiles.push(file);
              } else {
                otherFiles.push(file);
              }
            }
          }
        }
        if (imageFiles.length > 0) {
          const dataTransfer = new DataTransfer();
          imageFiles.forEach((f) => dataTransfer.items.add(f));
          await handleImageSelect(dataTransfer.files);
        }
        if (otherFiles.length > 0) {
          const dataTransfer = new DataTransfer();
          otherFiles.forEach((f) => dataTransfer.items.add(f));
          await handleFileSelect(dataTransfer.files);
        }
        if (imageFiles.length > 0 || otherFiles.length > 0) {
          return;
        }
      }

      // Try getting file paths from URI list
      const uriList = e.dataTransfer.getData('text/uri-list');
      console.log('URI list:', uriList);
      if (uriList) {
        const urls = uriList.split('\n').filter((uri) => uri.trim());

        // Handle http/https image URLs - fetch via main process (bypasses CSP)
        const httpUrls = urls.filter(
          (uri) => uri.startsWith('http://') || uri.startsWith('https://')
        );
        if (httpUrls.length > 0) {
          console.log('Fetching images from URLs:', httpUrls);
          const newAttachments: ImageAttachment[] = [];
          for (const url of httpUrls) {
            try {
              const result = await window.electronAPI.copilot.fetchImageFromUrl(url);
              console.log('fetchImageFromUrl result:', result);
              if (result.success && result.path && result.dataUrl) {
                newAttachments.push({
                  id: generateId(),
                  path: result.path,
                  previewUrl: result.dataUrl,
                  name: result.filename || 'image.png',
                  size: result.size || 0,
                  mimeType: result.mimeType || 'image/png',
                });
              }
            } catch (err) {
              console.error('Failed to fetch image from URL:', url, err);
            }
          }
          if (newAttachments.length > 0) {
            setImageAttachments((prev) => [...prev, ...newAttachments]);
            inputRef.current?.focus();
            return;
          }
        }

        // Handle file:// URLs
        const filePaths = urls
          .filter((uri) => uri.startsWith('file://'))
          .map((uri) => decodeURIComponent(uri.replace('file://', '')));
        console.log('File paths from URI:', filePaths);
      }
    },
    [handleImageSelect, handleFileSelect]
  );

  const handleStop = useCallback(() => {
    if (!activeTab) return;
    window.electronAPI.copilot.abort(activeTab.id);
    // Also stop Ralph and Lisa loops if active
    updateTab(activeTab.id, {
      isProcessing: false,
      ralphConfig: activeTab.ralphConfig ? { ...activeTab.ralphConfig, active: false } : undefined,
      lisaConfig: activeTab.lisaConfig ? { ...activeTab.lisaConfig, active: false } : undefined,
    });
  }, [activeTab, updateTab]);

  // Handle selecting a choice from the choice selector
  const handleChoiceSelect = useCallback(
    async (choice: DetectedChoice) => {
      if (!activeTab || activeTab.isProcessing) return;

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: choice.label,
      };

      const tabId = activeTab.id;

      updateTab(tabId, {
        messages: [
          ...activeTab.messages,
          userMessage,
          {
            id: generateId(),
            role: 'assistant',
            content: '',
            isStreaming: true,
            timestamp: Date.now(),
          },
        ],
        isProcessing: true,
        activeTools: [],
        detectedChoices: undefined, // Clear choices
      });

      try {
        await window.electronAPI.copilot.send(tabId, choice.label);
      } catch (error) {
        console.error('Send error:', error);
        updateTab(tabId, { isProcessing: false });
      }
    },
    [activeTab, updateTab]
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const handleConfirmation = async (decision: 'approved' | 'always' | 'global' | 'denied') => {
    // Get the first pending confirmation from the queue
    const pendingConfirmation = activeTab?.pendingConfirmations?.[0];
    if (!pendingConfirmation || !activeTab) return;

    // Always reset to "once" for next command (safety measure)
    setAllowMode('once');
    setShowAllowDropdown(false);

    try {
      await window.electronAPI.copilot.respondPermission({
        requestId: pendingConfirmation.requestId,
        decision,
      });

      // Remove this confirmation from the queue
      const remainingConfirmations = activeTab.pendingConfirmations.slice(1);

      // If denied, add a system message showing what was denied
      if (decision === 'denied') {
        let deniedContent = '🚫 **Denied:** ';
        if (pendingConfirmation.kind === 'command' || pendingConfirmation.kind === 'bash') {
          deniedContent += `Command execution`;
          if (pendingConfirmation.fullCommandText) {
            deniedContent += `\n\`\`\`\n${pendingConfirmation.fullCommandText}\n\`\`\``;
          } else if (pendingConfirmation.executable) {
            deniedContent += ` \`${pendingConfirmation.executable}\``;
          }
        } else if (pendingConfirmation.kind === 'mcp') {
          deniedContent += `MCP tool \`${pendingConfirmation.toolName || pendingConfirmation.toolTitle || 'unknown'}\``;
          if (pendingConfirmation.serverName) {
            deniedContent += ` from server \`${pendingConfirmation.serverName}\``;
          }
        } else if (pendingConfirmation.kind === 'url') {
          deniedContent += `URL fetch`;
          if (pendingConfirmation.url) {
            deniedContent += `: ${pendingConfirmation.url}`;
          }
        } else if (pendingConfirmation.kind === 'write' || pendingConfirmation.kind === 'edit') {
          deniedContent += `File ${pendingConfirmation.kind}`;
          if (pendingConfirmation.path) {
            deniedContent += `: \`${pendingConfirmation.path}\``;
          }
        } else if (pendingConfirmation.kind === 'read') {
          deniedContent += `File read`;
          if (pendingConfirmation.path) {
            deniedContent += `: \`${pendingConfirmation.path}\``;
          }
        } else {
          deniedContent += `${pendingConfirmation.kind}`;
          if (pendingConfirmation.path) {
            deniedContent += `: \`${pendingConfirmation.path}\``;
          }
        }

        const deniedMessage: Message = {
          id: generateId(),
          role: 'system',
          content: deniedContent,
          timestamp: Date.now(),
        };

        updateTab(activeTab.id, {
          pendingConfirmations: remainingConfirmations,
          messages: [...activeTab.messages, deniedMessage],
        });
        return;
      }

      // If "global" was selected, update the global safe commands list
      if (decision === 'global' && pendingConfirmation.executable) {
        const newExecutables = pendingConfirmation.executable.split(', ').filter((e) => e.trim());
        setGlobalSafeCommands((prev) => [...new Set([...prev, ...newExecutables])]);
        updateTab(activeTab.id, { pendingConfirmations: remainingConfirmations });
        return;
      }

      // If "always" was selected, update the local alwaysAllowed list
      if (decision === 'always' && pendingConfirmation.executable) {
        // Split comma-separated executables into individual entries
        const newExecutables = pendingConfirmation.executable.split(', ').filter((e) => e.trim());
        updateTab(activeTab.id, {
          pendingConfirmations: remainingConfirmations,
          alwaysAllowed: [...activeTab.alwaysAllowed, ...newExecutables],
        });
        return;
      }
      updateTab(activeTab.id, { pendingConfirmations: remainingConfirmations });
    } catch (error) {
      console.error('Permission response failed:', error);
      // Still remove from queue on error to avoid being stuck
      updateTab(activeTab.id, {
        pendingConfirmations: activeTab.pendingConfirmations.slice(1),
      });
    }
  };

  const handleRemoveAlwaysAllowed = async (executable: string) => {
    if (!activeTab) return;
    try {
      await window.electronAPI.copilot.removeAlwaysAllowed(activeTab.id, executable);
      updateTab(activeTab.id, {
        alwaysAllowed: activeTab.alwaysAllowed.filter((e) => e !== executable),
      });
    } catch (error) {
      console.error('Failed to remove always-allowed:', error);
    }
  };

  const refreshAlwaysAllowed = async () => {
    if (!activeTab) return;
    try {
      const list = await window.electronAPI.copilot.getAlwaysAllowed(activeTab.id);
      updateTab(activeTab.id, { alwaysAllowed: list });
    } catch (error) {
      console.error('Failed to fetch always-allowed:', error);
    }
  };

  const handleAddAlwaysAllowed = async () => {
    if (!activeTab || !addCommandValue.trim()) return;
    try {
      await window.electronAPI.copilot.addAlwaysAllowed(activeTab.id, addCommandValue.trim());
      updateTab(activeTab.id, {
        alwaysAllowed: [...activeTab.alwaysAllowed, addCommandValue.trim()],
      });
      setAddCommandValue('');
      setShowAddAllowedCommand(false);
    } catch (error) {
      console.error('Failed to add always-allowed:', error);
    }
  };

  // Global safe commands handlers
  const refreshGlobalSafeCommands = async () => {
    try {
      const list = await window.electronAPI.copilot.getGlobalSafeCommands();
      setGlobalSafeCommands(list);
    } catch (error) {
      console.error('Failed to fetch global safe commands:', error);
    }
  };

  const handleAddGlobalSafeCommand = async () => {
    if (!addCommandValue.trim()) return;
    // Block "write" commands from being added as global (file changes should not have global option)
    if (addCommandValue.trim().toLowerCase().startsWith('write')) {
      console.warn('File change commands cannot be added as global');
      return;
    }
    try {
      await window.electronAPI.copilot.addGlobalSafeCommand(addCommandValue.trim());
      setGlobalSafeCommands((prev) => [...prev, addCommandValue.trim()]);
      setAddCommandValue('');
      setShowAddAllowedCommand(false);
    } catch (error) {
      console.error('Failed to add global safe command:', error);
    }
  };

  const handleAddAllowedCommand = async () => {
    if (addCommandScope === 'global') {
      await handleAddGlobalSafeCommand();
    } else {
      await handleAddAlwaysAllowed();
    }
  };

  const handleRemoveGlobalSafeCommand = async (command: string) => {
    try {
      await window.electronAPI.copilot.removeGlobalSafeCommand(command);
      setGlobalSafeCommands((prev) => prev.filter((c) => c !== command));
    } catch (error) {
      console.error('Failed to remove global safe command:', error);
    }
  };

  // MCP Server handlers
  const openAddMcpModal = () => {
    setEditingMcpServer(null);
    setMcpFormData({
      name: '',
      type: 'local',
      command: '',
      args: '',
      url: '',
      tools: '*',
    });
    setShowMcpModal(true);
  };

  const openEditMcpModal = (name: string, server: MCPServerConfig) => {
    setEditingMcpServer({ name, server });
    const isLocal = !server.type || server.type === 'local' || server.type === 'stdio';
    setMcpFormData({
      name,
      type: isLocal ? 'local' : (server.type as 'http' | 'sse'),
      command: isLocal ? (server as MCPLocalServerConfig).command : '',
      args: isLocal ? (server as MCPLocalServerConfig).args.join(' ') : '',
      url: !isLocal ? (server as MCPRemoteServerConfig).url : '',
      tools: server.tools[0] === '*' ? '*' : server.tools.join(', '),
    });
    setShowMcpModal(true);
  };

  const handleSaveMcpServer = async () => {
    const { name, type, command, args, url, tools } = mcpFormData;
    if (!name.trim()) return;

    const toolsArray =
      tools === '*'
        ? ['*']
        : tools
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);

    let serverConfig: MCPServerConfig;
    if (type === 'local') {
      serverConfig = {
        type: 'local',
        command: command.trim(),
        args: args.split(' ').filter((a) => a.trim()),
        tools: toolsArray,
      };
    } else {
      serverConfig = {
        type: type as 'http' | 'sse',
        url: url.trim(),
        tools: toolsArray,
      };
    }

    try {
      if (editingMcpServer) {
        // If name changed, delete old and add new
        if (editingMcpServer.name !== name) {
          await window.electronAPI.mcp.deleteServer(editingMcpServer.name);
        }
        await window.electronAPI.mcp.addServer(name, serverConfig);
      } else {
        await window.electronAPI.mcp.addServer(name, serverConfig);
      }

      // Reload config
      const config = await window.electronAPI.mcp.getConfig();
      setMcpServers(config.mcpServers || {});
      setShowMcpModal(false);
    } catch (error) {
      console.error('Failed to save MCP server:', error);
    }
  };

  const handleDeleteMcpServer = async (name: string) => {
    try {
      await window.electronAPI.mcp.deleteServer(name);
      const config = await window.electronAPI.mcp.getConfig();
      setMcpServers(config.mcpServers || {});
    } catch (error) {
      console.error('Failed to delete MCP server:', error);
    }
  };

  const handleRefreshMcpServers = async () => {
    try {
      const config = await window.electronAPI.mcp.getConfig();
      setMcpServers(config.mcpServers || {});
      console.log('Refreshed MCP servers:', Object.keys(config.mcpServers || {}));
    } catch (error) {
      console.error('Failed to refresh MCP servers:', error);
    }
  };

  const handleOpenMcpConfigInEditor = async () => {
    try {
      const { path } = await window.electronAPI.mcp.getConfigPath();
      const result = await window.electronAPI.file.openFile(path);
      if (!result.success) {
        console.error('Failed to open MCP config file:', result.error);
      }
    } catch (error) {
      console.error('Failed to open MCP config in editor:', error);
    }
  };

  const handleToggleEditedFiles = async () => {
    const newShowState = !showEditedFiles;
    setShowEditedFiles(newShowState);

    // When expanding, refresh the edited files list and check if in git repo
    if (newShowState && activeTab) {
      try {
        // Check if we're in a git repo
        const repoCheck = await window.electronAPI.git.isGitRepo(activeTab.cwd);
        setIsGitRepo(repoCheck.isGitRepo);

        if (repoCheck.isGitRepo) {
          const changedResult = await window.electronAPI.git.getChangedFiles(
            activeTab.cwd,
            activeTab.editedFiles,
            true // includeAll: get all changed files
          );

          if (changedResult.success) {
            // Deduplicate and filter out empty filenames
            const uniqueFiles = getCleanEditedFiles(changedResult.files);
            updateTab(activeTab.id, { editedFiles: uniqueFiles });
          }
        }
      } catch (error) {
        console.error('Failed to refresh edited files:', error);
      }
    }
  };

  // Auto-refresh edited files every 1 minute when expanded and in a git repo
  useEffect(() => {
    if (!showEditedFiles || !activeTab || !isGitRepo) return;

    const refreshEditedFiles = async () => {
      try {
        const changedResult = await window.electronAPI.git.getChangedFiles(
          activeTab.cwd,
          activeTab.editedFiles,
          true
        );

        if (changedResult.success) {
          const uniqueFiles = getCleanEditedFiles(changedResult.files);
          updateTab(activeTab.id, { editedFiles: uniqueFiles });
        }
      } catch (error) {
        console.error('Auto-refresh edited files failed:', error);
      }
    };

    const intervalId = setInterval(refreshEditedFiles, 60000); // 1 minute

    return () => clearInterval(intervalId);
  }, [showEditedFiles, activeTab?.id, activeTab?.cwd, isGitRepo]);

  // Check if current directory is a git repo when active tab changes
  useEffect(() => {
    const checkGitRepo = async () => {
      if (!activeTab?.cwd) {
        setIsGitRepo(true); // Default to true if no cwd
        return;
      }
      try {
        const result = await window.electronAPI.git.isGitRepo(activeTab.cwd);
        setIsGitRepo(result.isGitRepo);
      } catch (error) {
        console.error('Failed to check git repo:', error);
        setIsGitRepo(false);
      }
    };
    checkGitRepo();
  }, [activeTab?.cwd]);

  const handleNewTab = async () => {
    // Always show folder picker when creating a new session
    try {
      const folderResult = await window.electronAPI.copilot.pickFolder();
      if (folderResult.canceled || !folderResult.path) {
        return; // User cancelled folder selection
      }

      // Check trust for the selected directory
      const trustResult = await window.electronAPI.copilot.checkDirectoryTrust(folderResult.path);
      if (!trustResult.trusted) {
        return; // User declined to trust, don't create session
      }

      setStatus('connecting');
      const result = await window.electronAPI.copilot.createSession({
        cwd: folderResult.path,
      });
      const newTab: TabState = {
        id: result.sessionId,
        name: generateTabName(),
        messages: [],
        model: result.model,
        cwd: result.cwd,
        isProcessing: false,
        activeTools: [],
        hasUnreadCompletion: false,
        pendingConfirmations: [],
        needsTitle: true,
        alwaysAllowed: [],
        editedFiles: [],
        untrackedFiles: [],
        fileViewMode: 'flat',
        currentIntent: null,
        currentIntentTimestamp: null,
        gitBranchRefresh: 0,
        activeAgentName: undefined,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(result.sessionId);
      setStatus('connected');
    } catch (error) {
      console.error('Failed to create new tab:', error);
      setStatus('connected');
    }
  };

  // Handle starting a new worktree session
  const handleNewWorktreeSession = async () => {
    try {
      const folderResult = await window.electronAPI.copilot.pickFolder();
      if (folderResult.canceled || !folderResult.path) {
        return;
      }
      setWorktreeRepoPath(folderResult.path);
      setShowCreateWorktree(true);
    } catch (error) {
      console.error('Failed to pick folder for worktree:', error);
    }
  };

  // Handle when worktree session is created
  const handleWorktreeSessionCreated = async (
    worktreePath: string,
    branch: string,
    autoStart?: {
      issueInfo: {
        url: string;
        title: string;
        body: string | null;
        comments?: Array<{ body: string; user: { login: string }; created_at: string }>;
      };
      useRalphWiggum?: boolean;
      ralphMaxIterations?: number;
      useLisaSimpson?: boolean;
      yoloMode?: boolean;
    }
  ) => {
    try {
      // Check trust for the worktree directory
      const trustResult = await window.electronAPI.copilot.checkDirectoryTrust(worktreePath);
      if (!trustResult.trusted) {
        // User declined trust - remove the worktree we just created
        const sessionId = worktreePath.split(/[/\\]/).pop() || '';
        await window.electronAPI.worktree.removeSession({ sessionId, force: true });
        return;
      }

      setStatus('connecting');
      const result = await window.electronAPI.copilot.createSession({
        cwd: worktreePath,
      });

      // Pre-approve file writes, mkdir (for evidence folders), and GitHub web fetches for all worktree sessions
      // This enables smooth operation in both Ralph Wiggum and Lisa Simpson modes
      const preApprovedCommands = ['write', 'mkdir', 'url:github.com'];

      // Add pre-approved commands to the session
      for (const cmd of preApprovedCommands) {
        await window.electronAPI.copilot.addAlwaysAllowed(result.sessionId, cmd);
      }

      // Enable yolo mode if requested
      if (autoStart?.yoloMode) {
        await window.electronAPI.copilot.setYoloMode(result.sessionId, true);
      }

      const newTab: TabState = {
        id: result.sessionId,
        name: `${branch} (worktree)`,
        messages: [],
        model: result.model,
        cwd: result.cwd,
        isProcessing: false,
        activeTools: [],
        hasUnreadCompletion: false,
        pendingConfirmations: [],
        needsTitle: false, // Already has a good name
        alwaysAllowed: preApprovedCommands,
        editedFiles: [],
        untrackedFiles: [],
        fileViewMode: 'flat',
        currentIntent: null,
        currentIntentTimestamp: null,
        gitBranchRefresh: 0,
        yoloMode: autoStart?.yoloMode || false,
        activeAgentName: undefined,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(result.sessionId);
      setStatus('connected');

      // If autoStart is enabled, send the initial prompt with issue context
      if (autoStart) {
        const issueContext = autoStart.issueInfo.body
          ? `## Issue Description\n\n${autoStart.issueInfo.body}`
          : '';

        // Format comments if available
        let commentsContext = '';
        if (autoStart.issueInfo.comments && autoStart.issueInfo.comments.length > 0) {
          const formattedComments = autoStart.issueInfo.comments
            .map((comment) => `### Comment by @${comment.user.login}\n\n${comment.body}`)
            .join('\n\n');
          commentsContext = `\n\n## Issue Comments\n\n${formattedComments}`;
        }

        const initialPrompt = `Please implement the following GitHub issue:

**Issue URL:** ${autoStart.issueInfo.url}
**Title:** ${autoStart.issueInfo.title}

${issueContext}${commentsContext}

Start by exploring the codebase to understand the current implementation, then make the necessary changes to address this issue.`;

        // Build the prompt based on mode (Lisa Simpson, Ralph Wiggum, or plain)
        let promptToSend: string;
        let ralphConfig: RalphConfig | undefined = undefined;
        let lisaConfig: LisaConfig | undefined = undefined;

        if (autoStart.useLisaSimpson) {
          // Lisa Simpson mode - start with Plan phase
          promptToSend = buildLisaPhasePrompt(
            'plan',
            1,
            initialPrompt,
            '', // No previous response yet
            undefined
          );
          lisaConfig = {
            originalPrompt: initialPrompt,
            currentPhase: 'plan',
            phaseIterations: {
              plan: 1,
              'plan-review': 0,
              execute: 0,
              'code-review': 0,
              validate: 0,
              'final-review': 0,
            },
            active: true,
            phaseHistory: [{ phase: 'plan', iteration: 1, timestamp: Date.now() }],
            evidenceFolderPath: `${worktreePath}/evidence`,
          };
        } else if (autoStart.useRalphWiggum) {
          // Ralph Wiggum mode
          promptToSend = `${initialPrompt}

## COMPLETION REQUIREMENTS

When you have finished the task, please verify:

1. **Build/Lint Check**: Run any build or lint commands to verify there are no errors.

2. **Test Check**: Run relevant tests to verify your changes work correctly.

3. **Code Review**: Review your changes one final time for any issues.

4. **Git Status**: Use git diff or git status to review all changes made.

5. **Verify Completion**: Go through each item in your plan one more time to ensure nothing was missed.

Only when ALL the above are verified complete, output exactly: ${RALPH_COMPLETION_SIGNAL}`;
          ralphConfig = {
            originalPrompt: initialPrompt,
            maxIterations: autoStart.ralphMaxIterations || 20,
            currentIteration: 1,
            active: true,
          };
        } else {
          // Plain mode
          promptToSend = initialPrompt;
        }

        const userMessage: Message = {
          id: generateId(),
          role: 'user',
          content: initialPrompt, // Show original prompt in UI, not the expanded Lisa/Ralph instructions
        };

        // Update tab with the initial message and start processing
        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === result.sessionId
              ? {
                  ...tab,
                  messages: [
                    userMessage,
                    {
                      id: generateId(),
                      role: 'assistant',
                      content: '',
                      isStreaming: true,
                    },
                  ],
                  isProcessing: true,
                  ralphConfig,
                  lisaConfig,
                }
              : tab
          )
        );

        // Send the prompt
        try {
          await window.electronAPI.copilot.send(result.sessionId, promptToSend);
        } catch (error) {
          console.error('Failed to send initial prompt:', error);
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === result.sessionId
                ? { ...tab, isProcessing: false, ralphConfig: undefined, lisaConfig: undefined }
                : tab
            )
          );
        }
      }
    } catch (error) {
      console.error('Failed to create worktree session tab:', error);
      setStatus('connected');
    }
  };

  // Handle opening an existing worktree session
  const handleOpenWorktreeSession = async (session: { worktreePath: string; branch: string }) => {
    // Check if this worktree is already open in an existing tab
    const existingTab = tabs.find((tab) => tab.cwd === session.worktreePath);
    if (existingTab) {
      // Switch to the existing tab instead of opening a new one
      setActiveTabId(existingTab.id);
      setShowSessionHistory(false);
      return;
    }

    // Check if there's a previous session for this worktree path
    const existingPreviousSession = previousSessions.find((s) => s.cwd === session.worktreePath);
    if (existingPreviousSession) {
      // Resume the existing session instead of creating a new one
      setShowSessionHistory(false);
      await handleResumePreviousSession(existingPreviousSession);
      return;
    }

    setShowSessionHistory(false);
    await handleWorktreeSessionCreated(session.worktreePath, session.branch);
  };

  // Handle removing a worktree session
  const handleRemoveWorktreeSession = async (
    worktreeId: string,
    worktreePath: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Close any tab that has this worktree path as cwd
      const tabToClose = tabs.find((tab) => tab.cwd === worktreePath);
      if (tabToClose) {
        await handleCloseTab(tabToClose.id);
      }

      // Remove the worktree
      const result = await window.electronAPI.worktree.removeSession({
        sessionId: worktreeId,
        force: true,
      });

      if (result.success) {
        // Re-enrich sessions to update the list
        const enrichedSessions = await enrichSessionsWithWorktreeData(previousSessions);
        setPreviousSessions(enrichedSessions);
      }

      return result;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  };

  // Handle sound enabled change
  const handleSoundEnabledChange = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem('copilot-sound-enabled', String(enabled));
  };

  const handleCloseTab = async (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // Get the tab info before closing (for adding to previous sessions)
    const closingTab = tabs.find((t) => t.id === tabId);

    // Clean up terminal state for this tab
    setTerminalInitializedSessions((prev) => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    setTerminalOpenSessions((prev) => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });

    // If closing the last tab, delete it and create a new one
    if (tabs.length === 1) {
      try {
        setStatus('connecting');
        await window.electronAPI.copilot.closeSession(tabId);

        // Add closed session to previous sessions
        if (closingTab) {
          setPreviousSessions((prev) => [
            {
              sessionId: closingTab.id,
              name: closingTab.name,
              modifiedTime: new Date().toISOString(),
              cwd: closingTab.cwd,
              markedForReview: closingTab.markedForReview,
              reviewNote: closingTab.reviewNote,
            },
            ...prev,
          ]);
        }

        const result = await window.electronAPI.copilot.createSession();
        const newTab: TabState = {
          id: result.sessionId,
          name: generateTabName(),
          messages: [],
          model: result.model,
          cwd: result.cwd,
          isProcessing: false,
          activeTools: [],
          hasUnreadCompletion: false,
          pendingConfirmations: [],
          needsTitle: true,
          alwaysAllowed: [],
          editedFiles: [],
          untrackedFiles: [],
          fileViewMode: 'flat',
          currentIntent: null,
          currentIntentTimestamp: null,
          gitBranchRefresh: 0,
          activeAgentName: undefined,
        };
        setTabs([newTab]);
        setActiveTabId(result.sessionId);
        setStatus('connected');
      } catch (error) {
        console.error('Failed to replace tab:', error);
        setStatus('connected');
      }
      return;
    }

    try {
      await window.electronAPI.copilot.closeSession(tabId);

      // Add closed session to previous sessions
      if (closingTab) {
        setPreviousSessions((prev) => [
          {
            sessionId: closingTab.id,
            name: closingTab.name,
            modifiedTime: new Date().toISOString(),
            cwd: closingTab.cwd,
            markedForReview: closingTab.markedForReview,
            reviewNote: closingTab.reviewNote,
          },
          ...prev,
        ]);
      }

      // If closing the active tab, switch to another one
      if (activeTabId === tabId) {
        const currentIndex = tabs.findIndex((t) => t.id === tabId);
        const newActiveTab = tabs[currentIndex - 1] || tabs[currentIndex + 1];
        setActiveTabId(newActiveTab?.id || null);
      }

      setTabs((prev) => prev.filter((t) => t.id !== tabId));
    } catch (error) {
      console.error('Failed to close tab:', error);
    }
  };

  const handleSwitchTab = async (tabId: string) => {
    if (tabId === activeTabId) return;
    setActiveTabId(tabId);
    // Clear unread indicator when switching to this tab
    updateTab(tabId, { hasUnreadCompletion: false });
    try {
      await window.electronAPI.copilot.switchSession(tabId);
    } catch (error) {
      console.error('Failed to switch session:', error);
    }
  };

  // Drag-and-drop handlers for session reordering
  const handleTabDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  };

  const handleTabDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (tabId !== draggedTabId) {
      setDragOverTabId(tabId);
    }
  };

  const handleTabDragLeave = () => {
    setDragOverTabId(null);
  };

  const handleTabDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (!draggedTabId || draggedTabId === targetTabId) {
      setDraggedTabId(null);
      setDragOverTabId(null);
      return;
    }
    setTabs((prev) => {
      const draggedIndex = prev.findIndex((t) => t.id === draggedTabId);
      const targetIndex = prev.findIndex((t) => t.id === targetTabId);
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      const newTabs = [...prev];
      const [removed] = newTabs.splice(draggedIndex, 1);
      newTabs.splice(targetIndex, 0, removed);
      return newTabs;
    });
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  const handleTabDragEnd = () => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  // Context menu handlers for session right-click
  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleToggleMarkForReview = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const newMarked = !tab.markedForReview;
    const newReviewNote = newMarked ? tab.reviewNote : undefined;
    updateTab(tabId, {
      markedForReview: newMarked,
      // Clear note if unmarking
      reviewNote: newReviewNote,
    });
    // Persist mark immediately to avoid races on app quit
    try {
      window.electronAPI.copilot
        .saveSessionMark(tabId, {
          markedForReview: newMarked,
          reviewNote: newReviewNote,
        })
        .catch((e) => {
          console.error('Failed to persist session mark:', e);
        });
    } catch (e) {
      console.error('Failed to call saveSessionMark:', e);
    }
    setContextMenu(null);
  };

  const handleOpenNoteModal = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    setNoteInputModal({ tabId, currentNote: tab?.reviewNote });
    setNoteInputValue(tab?.reviewNote || '');
    setContextMenu(null);
  };

  const handleSaveNote = () => {
    if (!noteInputModal) return;
    const note = noteInputValue.trim();
    const tabId = noteInputModal.tabId;
    const existingMarked = tabs.find((t) => t.id === tabId)?.markedForReview;
    const newMarked = note ? true : existingMarked;
    updateTab(tabId, {
      reviewNote: note || undefined,
      // Auto-mark for review when adding a note
      markedForReview: newMarked,
    });
    // Persist mark/note immediately
    try {
      window.electronAPI.copilot
        .saveSessionMark(tabId, {
          markedForReview: newMarked,
          reviewNote: note || undefined,
        })
        .catch((e) => console.error('Failed to persist session mark:', e));
    } catch (e) {
      console.error('Failed to call saveSessionMark:', e);
    }
    setNoteInputModal(null);
    setNoteInputValue('');
    // Scroll to show the note banner at the bottom
    if (note) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleClearNote = (tabId: string) => {
    updateTab(tabId, { reviewNote: undefined });
    try {
      window.electronAPI.copilot
        .saveSessionMark(tabId, { reviewNote: undefined })
        .catch((e) => console.error('Failed to persist session mark:', e));
    } catch (e) {
      console.error('Failed to call saveSessionMark:', e);
    }
  };

  const handleResumePreviousSession = async (prevSession: PreviousSession) => {
    try {
      setStatus('connecting');
      const result = await window.electronAPI.copilot.resumePreviousSession(
        prevSession.sessionId,
        prevSession.cwd
      );

      // Create new tab for this session
      const newTab: TabState = {
        id: result.sessionId,
        name: prevSession.name || generateTabName(),
        messages: [],
        model: result.model,
        cwd: result.cwd,
        isProcessing: false,
        activeTools: [],
        hasUnreadCompletion: false,
        pendingConfirmations: [],
        needsTitle: !prevSession.name,
        alwaysAllowed: result.alwaysAllowed || [],
        editedFiles: result.editedFiles || [],
        untrackedFiles: result.untrackedFiles || [],
        fileViewMode: result.fileViewMode || 'flat',
        currentIntent: null,
        currentIntentTimestamp: null,
        gitBranchRefresh: 0,
        markedForReview: prevSession.markedForReview,
        reviewNote: prevSession.reviewNote,
        activeAgentName: prevSession.activeAgentName,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(result.sessionId);

      // Remove from previous sessions list
      setPreviousSessions((prev) => prev.filter((s) => s.sessionId !== prevSession.sessionId));

      // Load message history and attachments
      const [messagesResult, attachmentsResult] = await Promise.all([
        window.electronAPI.copilot.getMessages(result.sessionId),
        window.electronAPI.copilot.loadMessageAttachments(result.sessionId),
      ]);

      console.log(
        'Resume session - loaded messages:',
        messagesResult.length,
        'attachments:',
        attachmentsResult.attachments.length
      );

      if (messagesResult.length > 0) {
        const attachmentMap = new Map(
          attachmentsResult.attachments.map((a) => [a.messageIndex, a])
        );
        console.log('Attachment map entries:', Array.from(attachmentMap.entries()));

        setTabs((prev) =>
          prev.map((tab) =>
            tab.id === result.sessionId
              ? {
                  ...tab,
                  messages: messagesResult.map((m, i) => {
                    const att = attachmentMap.get(i);
                    return {
                      id: `hist-${i}`,
                      ...m,
                      isStreaming: false,
                      imageAttachments: att?.imageAttachments,
                      fileAttachments: att?.fileAttachments,
                    };
                  }),
                  needsTitle: false,
                }
              : tab
          )
        );
      }

      setStatus('connected');
    } catch (error) {
      console.error('Failed to resume previous session:', error);
      setStatus('connected');
    }
  };

  const handleDeleteSessionFromHistory = async (sessionId: string) => {
    try {
      const result = await window.electronAPI.copilot.deleteSessionFromHistory(sessionId);
      if (result.success) {
        // Remove from previous sessions list
        setPreviousSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      } else {
        console.error('Failed to delete session:', result.error);
      }
    } catch (error) {
      console.error('Failed to delete session from history:', error);
    }
  };

  const handleModelChange = async (model: string) => {
    if (!activeTab || model === activeTab.model) {
      return;
    }

    setStatus('connecting');

    try {
      const hasMessages = activeTab.messages.length > 0;
      const result = await window.electronAPI.copilot.setModel(activeTab.id, model, hasMessages);
      // Update the tab in-place: swap session ID and model, preserve everything else
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? {
                ...t,
                id: result.sessionId,
                model: result.model,
                cwd: result.cwd || t.cwd,
                // Clear messages if we created a new session (no conversation to preserve)
                messages: result.newSession ? [] : t.messages,
              }
            : t
        )
      );
      setActiveTabId(result.sessionId);
      setStatus('connected');
    } catch (error) {
      console.error('Failed to change model:', error);
      setStatus('connected');
    }
  };

  const handleToggleFavoriteModel = async (modelId: string) => {
    const isFavorite = favoriteModels.includes(modelId);
    try {
      if (isFavorite) {
        await window.electronAPI.copilot.removeFavoriteModel(modelId);
        setFavoriteModels((prev) => prev.filter((m) => m !== modelId));
      } else {
        await window.electronAPI.copilot.addFavoriteModel(modelId);
        setFavoriteModels((prev) => [...prev, modelId]);
      }
    } catch (error) {
      console.error('Failed to toggle favorite model:', error);
    }
  };

  const handleToggleFavoriteAgent = (agentPath: string) => {
    const isFavorite = favoriteAgents.includes(agentPath);
    const nextFavorites = isFavorite
      ? favoriteAgents.filter((path) => path !== agentPath)
      : [...favoriteAgents, agentPath];
    setFavoriteAgents(nextFavorites);
    localStorage.setItem('favorite-agents', JSON.stringify(nextFavorites));
  };

  // Memoize cleaned edited files for the active tab
  const cleanedEditedFiles = useMemo(() => {
    return activeTab ? getCleanEditedFiles(activeTab.editedFiles) : [];
  }, [activeTab]);

  // Memoize sorted models with favorites first
  const sortedModels = useMemo(() => {
    const favorites = availableModels.filter((m) => favoriteModels.includes(m.id));
    const nonFavorites = availableModels.filter((m) => !favoriteModels.includes(m.id));
    return [...favorites, ...nonFavorites];
  }, [availableModels, favoriteModels]);

  // Calculate divider index (after last favorite, if any favorites exist)
  const modelDividers = useMemo(() => {
    const favoriteCount = availableModels.filter((m) => favoriteModels.includes(m.id)).length;
    return favoriteCount > 0 ? [favoriteCount - 1] : [];
  }, [availableModels, favoriteModels]);

  const allAgents = useMemo(() => {
    return [...agents, COOPER_DEFAULT_AGENT];
  }, [agents]);

  const groupedAgents = useMemo(() => {
    return groupAgents(allAgents, favoriteAgents);
  }, [allAgents, favoriteAgents]);

  const activeAgentPath = activeTab
    ? (selectedAgentByTab[activeTab.id] ?? COOPER_DEFAULT_AGENT.path)
    : null;
  const activeAgent = useMemo(() => {
    return activeAgentPath
      ? allAgents.find((agent) => agent.path === activeAgentPath) || null
      : null;
  }, [allAgents, activeAgentPath]);

  // Callbacks for TerminalProvider
  const handleOpenTerminal = useCallback(() => {
    if (activeTab) {
      setTerminalOpenSessions((prev) => new Set(prev).add(activeTab.id));
    }
  }, [activeTab]);

  const handleInitializeTerminal = useCallback(() => {
    if (activeTab) {
      setTerminalInitializedSessions((prev) => new Set(prev).add(activeTab.id));
    }
  }, [activeTab]);

  return (
    <TerminalProvider
      sessionId={activeTab?.id || null}
      isTerminalOpen={activeTab ? terminalOpenSessions.has(activeTab.id) : false}
      onOpenTerminal={handleOpenTerminal}
      onInitializeTerminal={handleInitializeTerminal}
    >
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-copilot-bg rounded-xl">
        <TitleBar />

        {/* Mobile Header Bar */}
        {isMobile && (
          <div className="flex items-center justify-between px-3 py-2 border-b border-copilot-border bg-copilot-surface">
            <button
              onClick={() => setLeftDrawerOpen(true)}
              className="p-2 text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-bg rounded transition-colors"
              title="Open sessions"
            >
              <MenuIcon size={20} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-copilot-text truncate max-w-[150px]">
                {activeTab?.name || 'New Session'}
              </span>
              {activeTab?.isProcessing && (
                <span className="w-2 h-2 rounded-full bg-copilot-warning animate-pulse" />
              )}
            </div>
            <button
              onClick={() => setRightDrawerOpen(true)}
              className="p-2 text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-bg rounded transition-colors"
              title="Open environment"
            >
              <ZapIcon size={20} />
            </button>
          </div>
        )}

        {/* Mobile Left Drawer (Sessions) */}
        <SidebarDrawer
          isOpen={leftDrawerOpen}
          onClose={() => setLeftDrawerOpen(false)}
          side="left"
          width={280}
        >
          <div className="flex flex-col h-full">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-copilot-border">
              <span className="text-sm font-medium text-copilot-text">Sessions</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLeftDrawerOpen(false);
                }}
                className="p-2 text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface rounded transition-colors"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            {/* New Session Buttons */}
            <div className="border-b border-copilot-border">
              <button
                onClick={() => {
                  handleNewTab();
                  setLeftDrawerOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
              >
                <PlusIcon size={16} />
                New Session
              </button>
              <button
                onClick={() => {
                  handleNewWorktreeSession();
                  setLeftDrawerOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
              >
                <GitBranchIcon size={16} />
                New Worktree Session
              </button>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  draggable={!tab.isRenaming}
                  onDragStart={(e) => handleTabDragStart(e, tab.id)}
                  onDragOver={(e) => handleTabDragOver(e, tab.id)}
                  onDragLeave={handleTabDragLeave}
                  onDrop={(e) => handleTabDrop(e, tab.id)}
                  onDragEnd={handleTabDragEnd}
                  onClick={() => {
                    handleSwitchTab(tab.id);
                    setLeftDrawerOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left ${
                    tab.id === activeTabId
                      ? 'bg-copilot-surface text-copilot-text border-l-2 border-l-copilot-accent'
                      : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface border-l-2 border-l-transparent'
                  } ${draggedTabId === tab.id ? 'opacity-50' : ''} ${dragOverTabId === tab.id ? 'border-t-2 border-t-copilot-accent' : ''}`}
                >
                  {/* Status indicator */}
                  {tab.pendingConfirmations.length > 0 ? (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-copilot-accent animate-pulse" />
                  ) : tab.isProcessing ? (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-copilot-warning animate-pulse" />
                  ) : tab.hasUnreadCompletion ? (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-copilot-success" />
                  ) : (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-transparent" />
                  )}
                  <span className="truncate flex-1">{tab.name}</span>
                </button>
              ))}
            </div>

            {/* Session History */}
            <div className="border-t border-copilot-border">
              <button
                onClick={() => {
                  setShowSessionHistory(true);
                  setLeftDrawerOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
              >
                <HistoryIcon size={16} />
                Session History
                {previousSessions.length > 0 && (
                  <span className="ml-auto text-xs bg-copilot-bg px-2 py-0.5 rounded">
                    {previousSessions.length}
                  </span>
                )}
              </button>
            </div>

            {/* Settings Section */}
            <div className="border-t border-copilot-border">
              {/* Settings Button */}
              <button
                onClick={() => {
                  setLeftDrawerOpen(false);
                  setShowSettingsModal(true);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-copilot-text hover:bg-copilot-surface-hover border-b border-copilot-border transition-colors"
                data-testid="mobile-drawer-settings-button"
              >
                <SettingsIcon size={14} className="text-copilot-text-muted" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </SidebarDrawer>

        {/* Mobile Right Drawer (Environment) */}
        <SidebarDrawer
          isOpen={rightDrawerOpen}
          onClose={() => setRightDrawerOpen(false)}
          side="right"
          width={300}
        >
          <div className="flex flex-col h-full">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-copilot-border">
              <span className="text-sm font-medium text-copilot-text">Environment</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRightDrawerOpen(false);
                }}
                className="p-2 text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface rounded transition-colors"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            {/* Environment Content - Using AccordionSelect for mobile-friendly UI */}
            <div className="flex-1 overflow-y-auto">
              {/* Status */}
              <div className="px-4 py-3 border-b border-copilot-border">
                <div className="flex items-center gap-2">
                  {activeTab?.isProcessing ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-copilot-warning animate-pulse" />
                      <span className="text-sm text-copilot-text">
                        {activeTab?.currentIntent || 'Working...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-copilot-success" />
                      <span className="text-sm text-copilot-text-muted">Ready</span>
                    </>
                  )}
                </div>
              </div>

              {/* Working Directory */}
              <div className="px-4 py-3 border-b border-copilot-border">
                <div className="text-xs text-copilot-text-muted uppercase tracking-wide mb-2">
                  Directory
                </div>
                <div className="flex items-center gap-1.5 text-xs min-w-0">
                  <FolderIcon size={12} className="text-copilot-accent shrink-0" />
                  <span className="text-copilot-text font-mono truncate" title={activeTab?.cwd}>
                    {activeTab?.cwd || 'Unknown'}
                  </span>
                </div>
              </div>

              {/* Git Branch */}
              <div className="px-4 py-3 border-b border-copilot-border">
                <div className="text-xs text-copilot-text-muted uppercase tracking-wide mb-2">
                  Git Branch
                </div>
                <GitBranchWidget cwd={activeTab?.cwd} refreshKey={activeTab?.gitBranchRefresh} />
              </div>

              {/* Edited Files Count */}
              {cleanedEditedFiles.length > 0 && (
                <div className="px-4 py-3 border-b border-copilot-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileIcon size={14} className="text-copilot-success" />
                      <span className="text-sm text-copilot-text">Edited Files</span>
                    </div>
                    <span className="text-sm text-copilot-accent">{cleanedEditedFiles.length}</span>
                  </div>
                </div>
              )}

              {/* MCP Servers */}
              <div className="border-b border-copilot-border">
                <div className="flex items-center">
                  <button
                    onClick={() => setShowMcpServers(!showMcpServers)}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    <ChevronRightIcon
                      size={14}
                      className={`transition-transform ${showMcpServers ? 'rotate-90' : ''}`}
                    />
                    <span>MCP Servers</span>
                    {Object.keys(mcpServers).length > 0 && (
                      <span className="ml-auto text-copilot-accent">
                        {Object.keys(mcpServers).length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openAddMcpModal();
                    }}
                    className="mr-3 p-1.5 text-copilot-success hover:bg-copilot-surface rounded transition-colors"
                    title="Add MCP server"
                  >
                    <PlusIcon size={16} />
                  </button>
                </div>
                {showMcpServers && (
                  <div className="px-4 pb-3">
                    {Object.keys(mcpServers).length === 0 ? (
                      <div className="text-xs text-copilot-text-muted">
                        No MCP servers configured
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(mcpServers).map(([name, server]) => {
                          const isLocal =
                            !server.type || server.type === 'local' || server.type === 'stdio';
                          const toolCount =
                            server.tools[0] === '*' ? 'all' : `${server.tools.length}`;
                          return (
                            <div key={name} className="flex items-center gap-2 text-xs">
                              {isLocal ? (
                                <MonitorIcon size={12} className="text-copilot-accent" />
                              ) : (
                                <GlobeIcon size={12} className="text-copilot-accent" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-copilot-text truncate">{name}</div>
                                <div className="text-[10px] text-copilot-text-muted">
                                  {toolCount} tools
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditMcpModal(name, server);
                                }}
                                className="p-1.5 text-copilot-accent hover:bg-copilot-surface rounded"
                              >
                                <EditIcon size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMcpServer(name);
                                }}
                                className="p-1.5 text-copilot-error hover:bg-copilot-surface rounded"
                              >
                                <CloseIcon size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Agent Skills */}
              <div className="border-b border-copilot-border">
                <div className="flex items-center">
                  <button
                    onClick={() => setShowSkills(!showSkills)}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    <ChevronRightIcon
                      size={14}
                      className={`transition-transform ${showSkills ? 'rotate-90' : ''}`}
                    />
                    <span>Agent Skills</span>
                    {skills.length > 0 && (
                      <span className="ml-auto text-copilot-accent">{skills.length}</span>
                    )}
                  </button>
                  <button
                    onClick={(event) => handleOpenEnvironment('skills', event)}
                    className="mr-3 px-2 py-1 text-[10px] text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface border border-copilot-border rounded transition-colors shrink-0"
                    title="Open Environment view"
                  >
                    Environment
                  </button>
                </div>
                {showSkills && (
                  <div className="px-4 pb-3">
                    {flatSkills.length === 0 ? (
                      <div className="text-xs text-copilot-text-muted">No skills found</div>
                    ) : (
                      <div className="space-y-2">
                        {flatSkills.map((skill) => (
                          <div key={skill.path} className="text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => window.electronAPI.file.openFile(skill.path)}
                                className="shrink-0 text-copilot-accent"
                                title={`Open ${skill.name}`}
                              >
                                <BookIcon size={12} />
                              </button>
                              <span className="text-copilot-text truncate">{skill.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Copilot Instructions */}
              <div className="border-b border-copilot-border">
                <div className="flex items-center">
                  <button
                    onClick={() => setShowInstructions(!showInstructions)}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    <ChevronRightIcon
                      size={14}
                      className={`transition-transform ${showInstructions ? 'rotate-90' : ''}`}
                    />
                    <span>Instructions</span>
                    {instructions.length > 0 && (
                      <span className="ml-auto text-copilot-accent">{instructions.length}</span>
                    )}
                  </button>
                  <button
                    onClick={(event) => handleOpenEnvironment('instructions', event)}
                    className="mr-3 px-2 py-1 text-[10px] text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface border border-copilot-border rounded transition-colors shrink-0"
                    title="Open Environment view"
                  >
                    Environment
                  </button>
                </div>
                {showInstructions && (
                  <div className="px-4 pb-3">
                    {flatInstructions.length === 0 ? (
                      <div className="text-xs text-copilot-text-muted">
                        No instruction files found
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {flatInstructions.map((instruction) => (
                          <div key={instruction.path} className="text-xs">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => window.electronAPI.file.openFile(instruction.path)}
                                className="shrink-0 text-copilot-accent"
                                title={`Open ${instruction.name}`}
                              >
                                <FileIcon size={12} />
                              </button>
                              <span className="text-copilot-text truncate">{instruction.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Allowed Commands - pinned to bottom */}
            <div className="mt-auto border-t border-copilot-border">
              <div className="flex items-center">
                {!activeTab?.yoloMode && (
                  <button
                    onClick={() => {
                      setShowAllowedCommands(!showAllowedCommands);
                      if (!showAllowedCommands) {
                        refreshAlwaysAllowed();
                      }
                    }}
                    className="flex-1 flex items-center gap-3 px-4 py-3 text-sm text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    <ChevronRightIcon
                      size={14}
                      className={`transition-transform ${showAllowedCommands ? '-rotate-90' : ''}`}
                    />
                    <span>Allowed Commands</span>
                    {(activeTab?.alwaysAllowed.length || 0) > 0 && (
                      <span className="ml-auto text-copilot-accent">
                        {activeTab?.alwaysAllowed.length || 0}
                      </span>
                    )}
                  </button>
                )}
                {activeTab?.yoloMode && (
                  <span className="flex-1 text-xs text-copilot-error/70 pl-4">
                    All actions auto-approved — no confirmations will be shown
                  </span>
                )}
                <button
                  onClick={async () => {
                    if (!activeTab) return;
                    const newValue = !activeTab.yoloMode;
                    await window.electronAPI.copilot.setYoloMode(activeTab.id, newValue);
                    updateTab(activeTab.id, { yoloMode: newValue });
                    if (newValue) {
                      updateTab(activeTab.id, { pendingConfirmations: [] });
                    }
                  }}
                  className={`shrink-0 px-4 py-3 text-sm transition-colors ${
                    activeTab?.yoloMode
                      ? 'font-bold text-copilot-error'
                      : 'text-copilot-text-muted hover:text-copilot-text'
                  }`}
                  title={
                    activeTab?.yoloMode
                      ? 'YOLO mode ON — all actions auto-approved. Click to disable.'
                      : 'Enable YOLO mode — auto-approve all actions without confirmation'
                  }
                >
                  YOLO
                </button>
              </div>
              {!activeTab?.yoloMode && showAllowedCommands && (
                <div className="px-4 pb-3">
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {(activeTab?.alwaysAllowed.length || 0) === 0 ? (
                      <div className="text-xs text-copilot-text-muted">No session commands</div>
                    ) : (
                      activeTab?.alwaysAllowed.map((cmd) => (
                        <div key={`session-${cmd}`} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 truncate font-mono text-copilot-text-muted">
                            {cmd}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAlwaysAllowed(cmd);
                            }}
                            className="p-1 text-copilot-error hover:bg-copilot-surface rounded"
                          >
                            <CloseIcon size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setRightDrawerOpen(false);
                      setSettingsDefaultSection('commands');
                      setShowSettingsModal(true);
                    }}
                    className="flex items-center gap-2 w-full mt-2 pt-2 text-xs text-copilot-text-muted hover:text-copilot-accent transition-colors border-t border-copilot-border"
                  >
                    <GlobeIcon size={12} />
                    <span>Global Allowed</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </SidebarDrawer>

        {/* Tab Bar - Desktop/Tablet Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel Toggle Button (when collapsed) */}
          {leftPanelCollapsed && !isMobile && (
            <button
              onClick={toggleLeftPanel}
              className="shrink-0 w-10 bg-copilot-bg border-r border-copilot-border flex flex-col items-center py-2 gap-2 hover:bg-copilot-surface transition-colors"
              title="Show sessions panel"
            >
              <ChevronRightIcon size={14} className="text-copilot-text-muted" />
              <span
                className="text-[10px] text-copilot-text-muted writing-mode-vertical"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                Sessions
              </span>
              {tabs.filter((t) => t.hasUnreadCompletion || t.pendingConfirmations.length > 0)
                .length > 0 && (
                <span className="w-2 h-2 rounded-full bg-copilot-accent animate-pulse" />
              )}
            </button>
          )}

          {/* Left Sidebar - Vertical Tabs */}
          {!leftPanelCollapsed && !isMobile && (
            <div
              className="bg-copilot-bg border-r border-copilot-border flex flex-col shrink-0"
              style={{ width: leftPanelWidth }}
            >
              {/* Collapse button + New Session Button */}
              <div className="flex items-center border-b border-copilot-border">
                <button
                  onClick={toggleLeftPanel}
                  className="shrink-0 p-2 text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  title="Collapse sessions panel"
                >
                  <ChevronDownIcon size={12} className="rotate-90" />
                </button>
                <div className="relative group flex-1">
                  <button
                    onClick={() => handleNewTab()}
                    className="w-full flex items-center gap-2 px-2 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    New Session
                  </button>
                  {/* Dropdown arrow / Worktree option on hover */}
                  <div className="absolute right-0 top-0 h-full flex items-center pr-2">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNewWorktreeSession();
                        }}
                        className="p-1 text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="New Worktree Session (isolated branch)"
                        data-tour="new-worktree"
                      >
                        <GitBranchIcon size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Open Tabs */}
              <div className="flex-1 overflow-y-auto" data-tour="sidebar-tabs">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    draggable={!tab.isRenaming}
                    onDragStart={(e) => handleTabDragStart(e, tab.id)}
                    onDragOver={(e) => handleTabDragOver(e, tab.id)}
                    onDragLeave={handleTabDragLeave}
                    onDrop={(e) => handleTabDrop(e, tab.id)}
                    onDragEnd={handleTabDragEnd}
                    onClick={() => handleSwitchTab(tab.id)}
                    onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
                    className={`group w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left cursor-pointer ${
                      tab.id === activeTabId
                        ? 'bg-copilot-surface text-copilot-text border-l-2 border-l-copilot-accent'
                        : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface border-l-2 border-l-transparent'
                    } ${draggedTabId === tab.id ? 'opacity-50' : ''} ${dragOverTabId === tab.id ? 'border-t-2 border-t-copilot-accent' : ''}`}
                  >
                    {/* Status indicator - priority: pending > processing > marked > unread > idle */}
                    {tab.pendingConfirmations.length > 0 ? (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-copilot-accent animate-pulse" />
                    ) : tab.isProcessing ? (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-copilot-warning animate-pulse" />
                    ) : tab.markedForReview ? (
                      <span
                        className="shrink-0 w-2 h-2 rounded-full bg-cyan-500"
                        title="Marked for review"
                      />
                    ) : tab.hasUnreadCompletion ? (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-copilot-success" />
                    ) : (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-transparent" />
                    )}
                    {tab.isRenaming ? (
                      <input
                        autoFocus
                        value={tab.renameDraft ?? tab.name}
                        onChange={(e) =>
                          setTabs((prev) =>
                            prev.map((t) =>
                              t.id === tab.id ? { ...t, renameDraft: e.target.value } : t
                            )
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                        onKeyUp={async (e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setTabs((prev) =>
                              prev.map((t) =>
                                t.id === tab.id
                                  ? {
                                      ...t,
                                      isRenaming: false,
                                      renameDraft: undefined,
                                    }
                                  : t
                              )
                            );
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            const nextName = (tab.renameDraft ?? tab.name).trim();
                            const finalName = nextName || tab.name;
                            setTabs((prev) =>
                              prev.map((t) =>
                                t.id === tab.id
                                  ? {
                                      ...t,
                                      name: finalName,
                                      isRenaming: false,
                                      renameDraft: undefined,
                                      needsTitle: false,
                                    }
                                  : t
                              )
                            );
                            try {
                              await window.electronAPI.copilot.renameSession(tab.id, finalName);
                            } catch (err) {
                              console.error('Failed to rename session:', err);
                            }
                          }
                        }}
                        onBlur={async () => {
                          const nextName = (tab.renameDraft ?? tab.name).trim();
                          const finalName = nextName || tab.name;
                          setTabs((prev) =>
                            prev.map((t) =>
                              t.id === tab.id
                                ? {
                                    ...t,
                                    name: finalName,
                                    isRenaming: false,
                                    renameDraft: undefined,
                                    needsTitle: false,
                                  }
                                : t
                            )
                          );
                          try {
                            await window.electronAPI.copilot.renameSession(tab.id, finalName);
                          } catch (err) {
                            console.error('Failed to rename session:', err);
                          }
                        }}
                        className="flex-1 min-w-0 bg-copilot-bg border border-copilot-border rounded px-1 py-0.5 text-xs text-copilot-text outline-none focus:border-copilot-accent"
                      />
                    ) : (
                      <span
                        className="flex-1 truncate"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setTabs((prev) =>
                            prev.map((t) =>
                              t.id === tab.id ? { ...t, isRenaming: true, renameDraft: t.name } : t
                            )
                          );
                        }}
                        title="Double-click to rename"
                      >
                        {tab.name}
                      </span>
                    )}
                    <button
                      onClick={(e) => handleCloseTab(tab.id, e)}
                      className="shrink-0 p-0.5 rounded hover:bg-copilot-border opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Close tab"
                    >
                      <CloseIcon size={10} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Bottom section - aligned with input area */}
              <div className="mt-auto">
                {/* Session History Button */}
                <div className="border-t border-copilot-border h-[32px] flex items-center">
                  <button
                    onClick={() => setShowSessionHistory(true)}
                    className="w-full h-full flex items-center gap-2 px-3 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    <HistoryIcon size={14} strokeWidth={1.5} />
                    <span>Session History</span>
                    {tabs.length + previousSessions.length > 0 && (
                      <span className="ml-auto text-[10px] bg-copilot-bg px-1.5 py-0.5 rounded">
                        {tabs.length + previousSessions.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Settings Button */}
                <div className="border-t border-copilot-border h-[32px] flex items-center">
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="w-full h-full flex items-center gap-2 px-3 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                    title="Settings"
                    data-testid="sidebar-settings-button"
                  >
                    <SettingsIcon size={14} />
                    <span>Settings</span>
                  </button>
                </div>

                {/* Build Info */}
                <div
                  className="border-t border-copilot-border h-[22px] flex items-center px-3 text-[10px] text-copilot-text-muted"
                  title={`Build: ${buildInfo.version}\nBranch: ${buildInfo.gitBranch}\nCommit: ${buildInfo.gitSha}\nBuilt: ${buildInfo.buildDate} ${buildInfo.buildTime}`}
                >
                  <span className="opacity-60">v{buildInfo.baseVersion}</span>
                  <span className="opacity-40 mx-1">•</span>
                  <span className="opacity-60 truncate">
                    {buildInfo.gitBranch === 'main' || buildInfo.gitBranch === 'master'
                      ? buildInfo.gitSha
                      : buildInfo.gitBranch}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Left Resize Handle */}
          {!leftPanelCollapsed && !isMobile && (
            <div
              className="w-0 cursor-col-resize shrink-0 relative z-10"
              onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
            >
              <div className="absolute inset-y-0 -left-1 w-2 hover:bg-copilot-accent/50 transition-colors" />
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Terminal Toggle Button */}
            {activeTab && (
              <button
                onClick={() => {
                  if (terminalOpenSessions.has(activeTab.id)) {
                    setTerminalOpenSessions((prev) => {
                      const next = new Set(prev);
                      next.delete(activeTab.id);
                      return next;
                    });
                  } else {
                    setTerminalOpenSessions((prev) => new Set(prev).add(activeTab.id));
                    setTerminalInitializedSessions((prev) => new Set(prev).add(activeTab.id));
                    trackEvent(TelemetryEvents.FEATURE_TERMINAL_OPENED);
                  }
                }}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 text-xs border-b border-copilot-border ${
                  terminalOpenSessions.has(activeTab.id)
                    ? 'text-copilot-accent bg-copilot-surface'
                    : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface'
                }`}
                data-tour="terminal-toggle"
              >
                <TerminalIcon size={14} />
                <span className="font-medium">Terminal</span>
                <ChevronDownIcon
                  size={12}
                  className={`transition-transform duration-200 ${terminalOpenSessions.has(activeTab.id) ? 'rotate-180' : ''}`}
                />
              </button>
            )}

            {/* Embedded Terminal Panels */}
            {tabs
              .filter((tab) => terminalInitializedSessions.has(tab.id))
              .map((tab) => (
                <TerminalPanel
                  key={tab.id}
                  sessionId={tab.id}
                  cwd={tab.cwd}
                  isOpen={terminalOpenSessions.has(tab.id) && activeTabId === tab.id}
                  onClose={() =>
                    setTerminalOpenSessions((prev) => {
                      const next = new Set(prev);
                      next.delete(tab.id);
                      return next;
                    })
                  }
                  onSendToAgent={handleSendTerminalOutput}
                />
              ))}

            {/* Messages Area - Conversation Only */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {activeTab?.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center min-h-full text-center -m-4 p-4">
                  <img src={logo} alt="Cooper" className="w-16 h-16 mb-4" />
                  <h2 className="text-copilot-text text-lg font-medium mb-1">
                    How can I help you today?
                  </h2>
                  <p className="text-copilot-text-muted text-sm">
                    Ask me anything about your code or projects.
                  </p>
                </div>
              )}

              {(() => {
                const filteredMessages = (activeTab?.messages || [])
                  .filter((m) => m.role !== 'system')
                  .filter((m) => m.role === 'user' || m.content.trim());

                // Find the last assistant message index
                let lastAssistantIndex = -1;
                for (let i = filteredMessages.length - 1; i >= 0; i--) {
                  if (filteredMessages[i].role === 'assistant') {
                    lastAssistantIndex = i;
                    break;
                  }
                }

                return filteredMessages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
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
                      {message.role === 'assistant' &&
                        index === lastAssistantIndex &&
                        voiceSpeech.isSpeaking && (
                          <button
                            onClick={() => voiceSpeech.stopSpeaking()}
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
                                    onClick={() =>
                                      setLightboxImage({ src: img.previewUrl, alt: img.name })
                                    }
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
                                      <span
                                        className="text-xs truncate max-w-[150px]"
                                        title={file.name}
                                      >
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
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  code: ({ className, children }) => {
                                    const textContent = String(children).replace(/\n$/, '');
                                    const hasLanguageClass = className?.startsWith('language-');
                                    const isMultiLine = textContent.includes('\n');
                                    const isBlock = hasLanguageClass || isMultiLine;

                                    if (isBlock) {
                                      return (
                                        <CodeBlockWithCopy
                                          isDiagram={false}
                                          textContent={textContent}
                                          isCliCommand={false}
                                        >
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
                                  pre: ({ children }) => (
                                    <div className="overflow-x-auto max-w-full">{children}</div>
                                  ),
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                            ) : (
                              <span className="whitespace-pre-wrap break-words">
                                {message.content}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {/* Tool Activity Section for assistant messages */}
                            {(() => {
                              // Show live tools only if this message is actively streaming with content
                              // (otherwise tools show in the thinking bubble)
                              // For completed messages, show stored tools
                              const isLive = message.isStreaming && message.content;
                              const toolsToShow = isLive ? activeTab?.activeTools : message.tools;
                              if (toolsToShow && toolsToShow.length > 0) {
                                return (
                                  <ToolActivitySection tools={toolsToShow} isLive={!!isLive} />
                                );
                              }
                              return null;
                            })()}
                            {message.content ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  strong: ({ children }) => (
                                    <strong className="font-semibold text-copilot-text">
                                      {children}
                                    </strong>
                                  ),
                                  em: ({ children }) => <em className="italic">{children}</em>,
                                  ul: ({ children }) => (
                                    <ul className="list-disc list-inside mb-2 space-y-1">
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="list-decimal list-inside mb-2 space-y-1">
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => <li className="ml-2">{children}</li>,
                                  code: ({ children, className }) => {
                                    // Extract text content for analysis
                                    const textContent = extractTextContent(children);

                                    // Fix block detection: treat as block if:
                                    // 1. Has language class (e.g., language-javascript)
                                    // 2. OR contains newlines (multi-line content)
                                    const hasLanguageClass = className?.includes('language-');
                                    const isMultiLine = textContent.includes('\n');
                                    const isBlock = hasLanguageClass || isMultiLine;

                                    // Check if content is an ASCII diagram
                                    const isDiagram = isAsciiDiagram(textContent);

                                    // Check if this is a CLI command (should show run button)
                                    const isCliCmd = isCliCommand(className, textContent);

                                    if (isBlock) {
                                      return (
                                        <CodeBlockWithCopy
                                          isDiagram={isDiagram}
                                          textContent={textContent}
                                          isCliCommand={isCliCmd}
                                        >
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
                                  pre: ({ children }) => (
                                    <div className="overflow-x-auto max-w-full">{children}</div>
                                  ),
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      className="text-copilot-accent hover:underline"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {children}
                                    </a>
                                  ),
                                  h1: ({ children }) => (
                                    <h1 className="text-lg font-bold mb-2 text-copilot-text">
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2 className="text-base font-bold mb-2 text-copilot-text">
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 className="text-sm font-bold mb-1 text-copilot-text">
                                      {children}
                                    </h3>
                                  ),
                                  blockquote: ({ children }) => (
                                    <blockquote className="border-l-2 border-copilot-border pl-3 my-2 text-copilot-text-muted italic">
                                      {children}
                                    </blockquote>
                                  ),
                                  table: ({ children }) => (
                                    <div className="overflow-x-auto my-2">
                                      <table className="min-w-full border-collapse border border-copilot-border text-sm">
                                        {children}
                                      </table>
                                    </div>
                                  ),
                                  thead: ({ children }) => (
                                    <thead className="bg-copilot-bg">{children}</thead>
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
                                }}
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
                    {/* Show timestamp for the last assistant message (only when not processing) */}
                    {index === lastAssistantIndex &&
                      message.timestamp &&
                      !activeTab?.isProcessing && (
                        <span className="text-[10px] text-copilot-text-muted mt-1 ml-1">
                          {new Date(message.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    {/* Show choice selector for the last assistant message when choices are detected */}
                    {index === lastAssistantIndex &&
                      !activeTab?.isProcessing &&
                      activeTab?.detectedChoices &&
                      activeTab.detectedChoices.length > 0 && (
                        <ChoiceSelector
                          choices={activeTab.detectedChoices}
                          onSelect={handleChoiceSelect}
                        />
                      )}
                  </div>
                ));
              })()}

              {/* Thinking indicator when processing but no streaming content yet */}
              {activeTab?.isProcessing &&
                !activeTab?.messages.some((m) => m.isStreaming && m.content) && (
                  <div className="flex flex-col items-start">
                    <div className="bg-copilot-surface text-copilot-text rounded-lg px-4 py-2.5">
                      {/* Show live tools in the thinking bubble */}
                      {activeTab?.activeTools && activeTab.activeTools.length > 0 && (
                        <ToolActivitySection tools={activeTab.activeTools} isLive={true} />
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Spinner size="sm" />
                        <span className="text-copilot-text-muted">
                          {activeTab?.currentIntent || 'Thinking...'}
                        </span>
                      </div>
                    </div>
                    {(() => {
                      // Show intent timestamp if available, otherwise fall back to streaming message timestamp
                      const timestamp =
                        activeTab?.currentIntentTimestamp ||
                        activeTab?.messages.find((m) => m.isStreaming)?.timestamp;
                      return timestamp ? (
                        <span className="text-[10px] text-copilot-text-muted mt-1 ml-1">
                          {new Date(timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}

              {/* Review Note Banner - shown when session has a note */}
              {activeTab?.reviewNote && (
                <div className="mx-3 mb-2 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 w-2 h-2 mt-1 rounded-full bg-cyan-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-cyan-400 mb-1">Review Note</div>
                      <p className="text-sm text-copilot-text whitespace-pre-wrap break-words">
                        {activeTab.reviewNote}
                      </p>
                    </div>
                    <button
                      onClick={() => handleClearNote(activeTab.id)}
                      className="shrink-0 mt-0.5 text-copilot-text-muted hover:text-copilot-text transition-colors"
                      title="Dismiss note"
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Permission Confirmation - Above Input */}
            {activeTab?.pendingConfirmations?.[0] &&
              (() => {
                const pendingConfirmation = activeTab.pendingConfirmations[0];
                const queueLength = activeTab.pendingConfirmations.length;
                return (
                  <div
                    className={`shrink-0 mx-3 mb-2 p-4 bg-copilot-surface rounded-lg border ${pendingConfirmation.isDestructive ? 'border-copilot-error' : 'border-copilot-warning'}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`${pendingConfirmation.isDestructive ? 'text-copilot-error' : 'text-copilot-warning'} text-lg`}
                      >
                        {pendingConfirmation.isDestructive ? '🗑️' : '⚠️'}
                      </span>
                      <span className="text-copilot-text text-sm font-medium">
                        {pendingConfirmation.isOutOfScope ? (
                          <>Allow reading outside workspace?</>
                        ) : pendingConfirmation.isDestructive ? (
                          <>
                            Allow{' '}
                            <strong className="text-copilot-error">
                              {pendingConfirmation.executable || 'destructive command'}
                            </strong>
                            ?
                          </>
                        ) : pendingConfirmation.kind === 'write' ? (
                          <>Allow file changes?</>
                        ) : pendingConfirmation.kind === 'shell' ? (
                          <>
                            Allow <strong>{pendingConfirmation.executable || 'command'}</strong>?
                          </>
                        ) : pendingConfirmation.kind === 'url' ? (
                          <>
                            Allow <strong>URL access</strong>?
                          </>
                        ) : pendingConfirmation.kind === 'mcp' ? (
                          <>
                            Allow <strong>MCP tool</strong>?
                          </>
                        ) : (
                          <>
                            Allow <strong>{pendingConfirmation.kind}</strong>?
                          </>
                        )}
                      </span>
                      {queueLength > 1 && (
                        <span className="text-xs text-copilot-text-muted ml-auto bg-copilot-border px-2 py-0.5 rounded-full">
                          +{queueLength - 1} more
                        </span>
                      )}
                    </div>
                    {pendingConfirmation.isOutOfScope && (
                      <div className="text-xs text-copilot-text-muted mb-2">
                        Path is outside trusted workspace
                      </div>
                    )}
                    {pendingConfirmation.kind === 'mcp' &&
                      (pendingConfirmation.toolTitle ||
                        pendingConfirmation.toolName ||
                        pendingConfirmation.serverName) && (
                        <div
                          className="text-xs text-copilot-accent mb-2 font-mono truncate"
                          title={`${pendingConfirmation.serverName || ''} ${pendingConfirmation.toolName || ''}`.trim()}
                        >
                          🔌{' '}
                          {pendingConfirmation.toolTitle ||
                            pendingConfirmation.toolName ||
                            'MCP tool'}
                          {pendingConfirmation.serverName
                            ? ` @${pendingConfirmation.serverName}`
                            : ''}
                        </div>
                      )}
                    {pendingConfirmation.kind === 'url' && pendingConfirmation.url && (
                      <div
                        className="text-xs text-copilot-accent mb-2 font-mono truncate"
                        title={pendingConfirmation.url}
                      >
                        🌐 {pendingConfirmation.url}
                      </div>
                    )}
                    {pendingConfirmation.path && pendingConfirmation.kind !== 'write' && (
                      <div
                        className="text-xs text-copilot-accent mb-2 font-mono truncate"
                        title={pendingConfirmation.path}
                      >
                        📄 {pendingConfirmation.path}
                      </div>
                    )}
                    {pendingConfirmation.fullCommandText && (
                      <pre className="bg-copilot-bg rounded p-3 my-2 overflow-x-auto text-xs text-copilot-text border border-copilot-border max-h-32">
                        <code>{pendingConfirmation.fullCommandText}</code>
                      </pre>
                    )}
                    {/* Issue #203: Show description/intention with help icon tooltip */}
                    {(pendingConfirmation.description || pendingConfirmation.intention) &&
                      pendingConfirmation.fullCommandText && (
                        <div className="flex items-center gap-1.5 text-xs text-copilot-text-muted mb-2">
                          <span
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-copilot-accent/20 text-copilot-accent cursor-help"
                            title={
                              pendingConfirmation.description || pendingConfirmation.intention || ''
                            }
                          >
                            <HelpCircleIcon size={12} strokeWidth={2.5} />
                          </span>
                          <span className="truncate">
                            {pendingConfirmation.description || pendingConfirmation.intention}
                          </span>
                        </div>
                      )}
                    {/* Issue #101: Show files to be deleted for destructive commands */}
                    {pendingConfirmation.isDestructive &&
                      pendingConfirmation.filesToDelete &&
                      pendingConfirmation.filesToDelete.length > 0 && (
                        <div className="bg-copilot-error/10 border border-copilot-error/30 rounded p-3 my-2">
                          <div className="text-xs font-medium text-copilot-error mb-2 flex items-center gap-1">
                            🗑️ Files to be deleted:
                          </div>
                          <ul className="text-xs text-copilot-error font-mono space-y-1 max-h-24 overflow-y-auto">
                            {pendingConfirmation.filesToDelete.map((file, idx) => (
                              <li key={idx} className="truncate" title={file}>
                                • {file}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    <div className="flex gap-2 mt-3">
                      {pendingConfirmation.isOutOfScope ? (
                        <>
                          <button
                            onClick={() => handleConfirmation('approved')}
                            className="flex-1 px-3 py-2 rounded bg-copilot-success hover:brightness-110 text-copilot-text-inverse text-sm font-medium transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => handleConfirmation('denied')}
                            className="flex-1 px-3 py-2 rounded bg-copilot-surface hover:bg-copilot-surface-hover text-copilot-error text-sm font-medium border border-copilot-border transition-colors"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Split button: Allow with dropdown for mode selection */}
                          <div className="relative flex" ref={allowDropdownRef}>
                            <button
                              onClick={() => {
                                if (allowMode === 'once') {
                                  handleConfirmation('approved');
                                } else if (allowMode === 'session') {
                                  handleConfirmation('always');
                                } else {
                                  handleConfirmation('global');
                                }
                              }}
                              className="px-4 py-2 rounded-l bg-copilot-success hover:brightness-110 text-copilot-text-inverse text-sm font-medium transition-colors"
                            >
                              {allowMode === 'once'
                                ? 'Allow'
                                : allowMode === 'session'
                                  ? 'Allow (Session)'
                                  : 'Allow (Global)'}
                            </button>
                            <button
                              onClick={() => setShowAllowDropdown(!showAllowDropdown)}
                              className="px-1.5 py-2 rounded-r bg-copilot-success hover:brightness-110 text-copilot-text-inverse text-sm font-medium transition-colors border-l border-black/20"
                              title="Choose approval scope"
                            >
                              <ChevronDownIcon size={14} />
                            </button>
                            {showAllowDropdown && (
                              <div className="absolute top-full left-0 mt-1 py-1 bg-copilot-surface border border-copilot-border rounded-lg shadow-lg z-50 min-w-[140px]">
                                <button
                                  onClick={() => {
                                    setAllowMode('once');
                                    setShowAllowDropdown(false);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-copilot-surface-hover transition-colors ${
                                    allowMode === 'once'
                                      ? 'text-copilot-accent'
                                      : 'text-copilot-text'
                                  }`}
                                >
                                  {allowMode === 'once' && '✓ '}Once
                                </button>
                                <button
                                  onClick={() => {
                                    setAllowMode('session');
                                    setShowAllowDropdown(false);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-copilot-surface-hover transition-colors ${
                                    allowMode === 'session'
                                      ? 'text-copilot-accent'
                                      : 'text-copilot-text'
                                  }`}
                                  title="Always allow for this session"
                                >
                                  {allowMode === 'session' && '✓ '}Session
                                </button>
                                {/* Hide Global option for file changes (write kind) and destructive commands (Issue #101) */}
                                {pendingConfirmation.kind !== 'write' &&
                                  !pendingConfirmation.isDestructive && (
                                    <button
                                      onClick={() => {
                                        setAllowMode('global');
                                        setShowAllowDropdown(false);
                                      }}
                                      className={`w-full px-3 py-1.5 text-left text-xs hover:bg-copilot-surface-hover transition-colors ${
                                        allowMode === 'global'
                                          ? 'text-copilot-accent'
                                          : 'text-copilot-text'
                                      }`}
                                      title="Always allow globally (persists across sessions)"
                                    >
                                      {allowMode === 'global' && '✓ '}Global
                                    </button>
                                  )}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleConfirmation('denied')}
                            className="px-4 py-2 rounded bg-copilot-surface hover:bg-copilot-surface-hover text-copilot-error text-sm font-medium border border-copilot-border transition-colors"
                          >
                            Deny
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* Input Area */}
            <div className="shrink-0 p-3 bg-copilot-surface border-t border-copilot-border">
              {/* Lisa Phase Progress - Shows during active Lisa loop or after completion */}
              {(activeTab?.lisaConfig?.active || activeTab?.lisaConfig?.phaseHistory?.length) && (
                <div className="mb-2 p-3 bg-copilot-bg rounded-lg border border-copilot-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-copilot-text flex items-center gap-2">
                      <LisaIcon size={16} />
                      Lisa Simpson Loop
                    </span>
                  </div>

                  {/* Phase progress as a horizontal pipeline */}
                  <div className="flex items-center gap-2">
                    {[
                      {
                        work: 'plan' as const,
                        review: 'plan-review' as const,
                        emoji: '📋',
                        workLabel: 'Plan',
                        reviewLabel: 'Review',
                      },
                      {
                        work: 'execute' as const,
                        review: 'code-review' as const,
                        emoji: '💻',
                        workLabel: 'Code',
                        reviewLabel: 'Review',
                      },
                      {
                        work: 'validate' as const,
                        review: 'final-review' as const,
                        emoji: '🧪',
                        workLabel: 'Test',
                        reviewLabel: 'Final',
                      },
                    ].map((group, groupIdx) => {
                      const workIteration = activeTab.lisaConfig?.phaseIterations[group.work] || 0;
                      const reviewIteration =
                        activeTab.lisaConfig?.phaseIterations[group.review] || 0;
                      const isCurrentWork = activeTab.lisaConfig?.currentPhase === group.work;
                      const isCurrentReview = activeTab.lisaConfig?.currentPhase === group.review;
                      const workDone = workIteration > 0 && !isCurrentWork;
                      const reviewDone = reviewIteration > 0 && !isCurrentReview;

                      return (
                        <React.Fragment key={group.work}>
                          {/* Arrow connector between groups */}
                          {groupIdx > 0 && (
                            <span className="text-sm text-copilot-warning/70">→</span>
                          )}

                          {/* Work phase */}
                          <div
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
                              isCurrentWork
                                ? 'bg-copilot-accent/20 ring-2 ring-copilot-accent'
                                : workDone
                                  ? 'bg-copilot-success/15 text-copilot-success'
                                  : 'bg-copilot-surface text-copilot-text-muted'
                            }`}
                            title={`${group.workLabel}: ${workIteration} iteration(s)`}
                          >
                            <span className="text-sm">{group.emoji}</span>
                            <span
                              className={`text-xs font-medium ${isCurrentWork ? 'text-copilot-accent' : ''}`}
                            >
                              {group.workLabel}
                            </span>
                            {workDone && <span className="text-xs">✓</span>}
                            {isCurrentWork && (
                              <span className="text-[10px] text-copilot-text-muted">
                                {workIteration}
                              </span>
                            )}
                          </div>

                          {/* Arrow to review */}
                          <span className="text-xs text-copilot-warning/70">→</span>

                          {/* Review phase */}
                          <div
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${
                              isCurrentReview
                                ? 'bg-copilot-warning/20 ring-2 ring-copilot-warning'
                                : reviewDone
                                  ? 'bg-copilot-success/15 text-copilot-success'
                                  : 'bg-copilot-surface text-copilot-text-muted'
                            }`}
                            title={`${group.reviewLabel} Review: ${reviewIteration} iteration(s)`}
                          >
                            <span className="text-xs">👀</span>
                            <span
                              className={`text-xs font-medium ${isCurrentReview ? 'text-copilot-warning' : ''}`}
                            >
                              {group.reviewLabel}
                            </span>
                            {reviewDone && <span className="text-xs">✓</span>}
                            {isCurrentReview && (
                              <span className="text-[10px] text-copilot-text-muted">
                                {reviewIteration}
                              </span>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Current status */}
                  <div className="mt-2 pt-2 border-t border-copilot-border/50">
                    <div className="text-xs text-copilot-text-muted">
                      {activeTab?.lisaConfig?.active ? (
                        (() => {
                          const phase = activeTab.lisaConfig?.currentPhase;
                          const iter = activeTab.lisaConfig?.phaseIterations[phase!] || 1;
                          const descriptions: Record<LisaPhase, string> = {
                            plan: 'Planner is creating the implementation plan...',
                            'plan-review': 'Reviewer is checking the plan before coding begins...',
                            execute: 'Coder is implementing the plan...',
                            'code-review': 'Reviewer is checking code quality & architecture...',
                            validate: 'Tester is testing and gathering evidence...',
                            'final-review': 'Reviewer is analyzing screenshots and approving...',
                          };
                          return (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="animate-pulse">●</span>
                                <span>{descriptions[phase!]}</span>
                                <span className="text-copilot-text-muted/50">
                                  (iteration {iter})
                                </span>
                              </div>
                              {(phase === 'validate' || phase === 'final-review') &&
                                activeTab?.lisaConfig?.evidenceFolderPath && (
                                  <button
                                    onClick={() => {
                                      window.electronAPI.file.openFile(
                                        `${activeTab.lisaConfig!.evidenceFolderPath!}/summary.html`
                                      );
                                    }}
                                    className="px-2 py-1 text-xs bg-copilot-surface text-copilot-text-muted rounded hover:bg-copilot-border flex items-center gap-1"
                                    title="Open evidence summary"
                                  >
                                    📄 Summary
                                  </button>
                                )}
                            </div>
                          );
                        })()
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-copilot-success">
                            <span>✅</span>
                            <span>Loop completed - all phases approved</span>
                          </div>
                          {activeTab?.lisaConfig?.evidenceFolderPath && (
                            <button
                              onClick={() => {
                                window.electronAPI.file.openFile(
                                  `${activeTab.lisaConfig!.evidenceFolderPath!}/summary.html`
                                );
                              }}
                              className="px-2 py-1 text-xs bg-copilot-accent/20 text-copilot-accent rounded hover:bg-copilot-accent/30 flex items-center gap-1"
                              title="Open evidence summary"
                            >
                              📄 View Summary
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Context Usage Indicator */}
              {activeTab?.contextUsage && (
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <div className="flex-1 h-1.5 bg-copilot-border rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        activeTab.contextUsage.currentTokens / activeTab.contextUsage.tokenLimit >=
                        0.9
                          ? 'bg-copilot-error'
                          : activeTab.contextUsage.currentTokens /
                                activeTab.contextUsage.tokenLimit >=
                              0.7
                            ? 'bg-copilot-warning'
                            : 'bg-copilot-accent'
                      }`}
                      style={{
                        width: `${Math.min(100, (activeTab.contextUsage.currentTokens / activeTab.contextUsage.tokenLimit) * 100)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`text-[10px] shrink-0 ${
                      activeTab.contextUsage.currentTokens / activeTab.contextUsage.tokenLimit >=
                      0.9
                        ? 'text-copilot-error'
                        : activeTab.contextUsage.currentTokens /
                              activeTab.contextUsage.tokenLimit >=
                            0.7
                          ? 'text-copilot-warning'
                          : 'text-copilot-text-muted'
                    }`}
                  >
                    {activeTab.compactionStatus === 'compacting'
                      ? '📦 Compacting...'
                      : `${((activeTab.contextUsage.currentTokens / activeTab.contextUsage.tokenLimit) * 100).toFixed(0)}% (${(activeTab.contextUsage.currentTokens / 1000).toFixed(0)}K/${(activeTab.contextUsage.tokenLimit / 1000).toFixed(0)}K)`}
                  </span>
                </div>
              )}

              {/* Terminal Attachment Indicator */}
              {terminalAttachment && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-copilot-surface border border-b-0 border-copilot-border rounded-t-lg">
                  <TerminalIcon size={12} className="text-copilot-accent shrink-0" />
                  <span className="text-xs text-copilot-text">
                    Terminal output: {terminalAttachment.lineCount} lines
                  </span>
                  <button
                    onClick={() => setTerminalAttachment(null)}
                    className="ml-auto text-copilot-text-muted hover:text-copilot-text text-xs"
                    title="Remove terminal output"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Image Attachments Preview */}
              {imageAttachments.length > 0 && (
                <div
                  className={`flex flex-wrap gap-2 p-2 bg-copilot-surface border border-b-0 border-copilot-border ${terminalAttachment ? '' : 'rounded-t-lg'}`}
                >
                  {imageAttachments.map((img) => (
                    <div key={img.id} className="relative group">
                      <img
                        src={img.previewUrl}
                        alt={img.name}
                        className="h-16 w-auto rounded border border-copilot-border object-cover"
                        onError={(e) =>
                          console.error(
                            'Image preview failed to load:',
                            img.name,
                            img.previewUrl?.substring(0, 100)
                          )
                        }
                      />
                      <button
                        onClick={() => handleRemoveImage(img.id)}
                        className="absolute -top-1.5 -right-1.5 bg-copilot-error text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove image"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* File Attachments Preview */}
              {fileAttachments.length > 0 && (
                <div
                  className={`flex flex-wrap gap-2 p-2 bg-copilot-surface border border-b-0 border-copilot-border ${terminalAttachment || imageAttachments.length > 0 ? '' : 'rounded-t-lg'}`}
                >
                  {fileAttachments.map((file) => (
                    <div
                      key={file.id}
                      className="relative group flex items-center gap-2 px-2 py-1.5 bg-copilot-bg rounded border border-copilot-border"
                    >
                      <FileIcon size={16} className="text-copilot-text-muted shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span
                          className="text-xs text-copilot-text truncate max-w-[120px]"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span className="text-[10px] text-copilot-text-muted">
                          {(file.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveFile(file.id)}
                        className="shrink-0 text-copilot-text-muted hover:text-copilot-error transition-colors"
                        title="Remove file"
                      >
                        <CloseIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Vision Warning */}
              {imageAttachments.length > 0 &&
                activeTab &&
                modelCapabilities[activeTab.model] &&
                !modelCapabilities[activeTab.model].supportsVision && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-copilot-warning/10 border border-b-0 border-copilot-warning/30 text-copilot-warning text-xs">
                    <span>⚠️</span>
                    <span>
                      The current model ({activeTab.model}) may not support image processing. If
                      images aren't recognized, try switching models.
                    </span>
                  </div>
                )}

              <div
                className={`relative flex flex-col bg-copilot-bg border border-copilot-border focus-within:border-copilot-accent transition-colors ${terminalAttachment || imageAttachments.length > 0 || fileAttachments.length > 0 || (imageAttachments.length > 0 && activeTab && modelCapabilities[activeTab.model] && !modelCapabilities[activeTab.model].supportsVision) ? 'rounded-b-lg' : 'rounded-lg'} ${isDraggingImage || isDraggingFile ? 'border-copilot-accent border-dashed bg-copilot-accent/5' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex items-center">
                  {/* Hidden file inputs */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleImageSelect(e.target.files)}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => handleFileSelect(e.target.files)}
                    className="hidden"
                  />

                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      // Cancel auto-send if user starts typing
                      if (voiceAutoSendCountdown !== null) {
                        cancelVoiceAutoSend();
                      }
                    }}
                    onKeyDown={handleKeyPress}
                    onPaste={handlePaste}
                    placeholder={
                      isDraggingImage || isDraggingFile
                        ? 'Drop files here...'
                        : activeTab?.isProcessing
                          ? isMobile
                            ? 'Inject message...'
                            : 'Type to inject message to agent...'
                          : lisaEnabled
                            ? isMobile
                              ? 'Describe task...'
                              : 'Describe task for multi-phase analysis (Plan → Execute → Validate → Review)...'
                            : ralphEnabled
                              ? isMobile
                                ? 'Describe task...'
                                : 'Describe task with clear completion criteria...'
                              : isMobile
                                ? 'Ask Cooper...'
                                : 'Ask Cooper... (Shift+Enter for new line)'
                    }
                    className="flex-1 bg-transparent py-2.5 pl-3 pr-2 text-copilot-text placeholder-copilot-text-muted outline-none text-sm resize-none min-h-[40px] max-h-[200px]"
                    disabled={status !== 'connected'}
                    autoFocus
                    rows={1}
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                    }}
                  />
                  {/* Audio Input (Mic) Button - uses whisper.cpp for STT */}
                  {!activeTab?.isProcessing && (
                    <MicButton
                      onTranscript={(text) => {
                        if (text.trim()) {
                          setInputValue((prev) => (prev ? prev + ' ' + text : text));
                          // Start auto-send countdown if always listening is enabled
                          if (alwaysListening) {
                            startVoiceAutoSend();
                          }
                        }
                      }}
                      className="shrink-0"
                      pushToTalk={pushToTalk}
                      alwaysListening={alwaysListening}
                      onAlwaysListeningError={setAlwaysListeningError}
                      onAbortDetected={cancelVoiceAutoSend}
                      onOpenSettings={() => openSettingsVoice(true)}
                    />
                  )}
                  {/* File Attach Button */}
                  {!activeTab?.isProcessing && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`shrink-0 p-1.5 transition-colors ${
                        fileAttachments.length > 0
                          ? 'text-copilot-accent'
                          : 'text-copilot-text-muted hover:text-copilot-text'
                      }`}
                      title="Attach file (or drag & drop, or paste)"
                    >
                      <PaperclipIcon size={18} />
                    </button>
                  )}
                  {/* Image Attach Button */}
                  {!activeTab?.isProcessing && (
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className={`shrink-0 p-1.5 transition-colors ${
                        imageAttachments.length > 0
                          ? 'text-copilot-accent'
                          : 'text-copilot-text-muted hover:text-copilot-text'
                      }`}
                      title="Attach image (or drag & drop, or paste)"
                    >
                      <ImageIcon size={18} />
                    </button>
                  )}
                  {activeTab?.isProcessing ? (
                    <>
                      {/* Send button while processing - queues message */}
                      {(inputValue.trim() ||
                        terminalAttachment ||
                        imageAttachments.length > 0 ||
                        fileAttachments.length > 0) && (
                        <button
                          onClick={handleSendMessage}
                          disabled={status !== 'connected'}
                          className="shrink-0 px-3 py-2.5 text-copilot-warning hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors"
                          title="Send message (will be queued until agent finishes)"
                        >
                          Send
                        </button>
                      )}
                      {/* Stop button */}
                      <button
                        onClick={handleStop}
                        className="shrink-0 px-4 py-2.5 text-copilot-error hover:brightness-110 text-xs font-medium transition-colors flex items-center gap-1.5"
                        title={
                          activeTab?.lisaConfig?.active
                            ? 'Stop Lisa Loop'
                            : activeTab?.ralphConfig?.active
                              ? 'Stop Ralph Loop'
                              : 'Stop'
                        }
                      >
                        <StopIcon size={10} />
                        {activeTab?.ralphConfig?.active || activeTab?.lisaConfig?.active
                          ? 'Stop Loop'
                          : 'Stop'}
                      </button>
                    </>
                  ) : (
                    <div className="relative">
                      <button
                        onClick={() => {
                          cancelVoiceAutoSend();
                          handleSendMessage();
                        }}
                        disabled={
                          (!inputValue.trim() &&
                            !terminalAttachment &&
                            imageAttachments.length === 0 &&
                            fileAttachments.length === 0) ||
                          status !== 'connected'
                        }
                        className={`shrink-0 px-4 py-2.5 hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors ${
                          voiceAutoSendCountdown !== null
                            ? 'text-copilot-success'
                            : 'text-copilot-accent'
                        }`}
                      >
                        {lisaEnabled ? 'Start Lisa Loop' : ralphEnabled ? 'Start Loop' : 'Send'}
                      </button>
                      {/* Auto-send countdown tooltip */}
                      {voiceAutoSendCountdown !== null && (
                        <div
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-copilot-success text-white rounded-lg shadow-lg cursor-pointer animate-pulse text-center"
                          onClick={cancelVoiceAutoSend}
                          title="Click to cancel auto-send"
                        >
                          <div className="text-xs font-bold whitespace-nowrap">
                            Sending in {voiceAutoSendCountdown}s
                          </div>
                          <div className="text-[10px] opacity-80 mt-0.5">Say "abort" to cancel</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Models, Agents, Loops selectors */}
                {activeTab && (
                  <div className="flex items-center mx-1.5 mb-1.5 mt-0.5 border-t border-copilot-border relative">
                    {/* Models Selector */}
                    <div className="relative" data-tour="model-selector">
                      <button
                        onClick={() =>
                          setOpenTopBarSelector(openTopBarSelector === 'models' ? null : 'models')
                        }
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
                          openTopBarSelector === 'models'
                            ? 'text-copilot-accent bg-copilot-surface-hover'
                            : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover'
                        }`}
                        title="Select model"
                      >
                        <MonitorIcon size={12} />
                        <span className="font-medium truncate max-w-[120px]">
                          {(() => {
                            const m = sortedModels.find((m) => m.id === activeTab?.model);
                            return m?.name || activeTab?.model || 'Model';
                          })()}
                        </span>
                        <ChevronDownIcon
                          size={10}
                          className={`transition-transform duration-200 ${openTopBarSelector === 'models' ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {openTopBarSelector === 'models' && (
                        <div className="absolute bottom-full left-0 z-50 mb-0.5 w-60 max-h-80 overflow-y-auto bg-copilot-surface border border-copilot-border rounded-lg shadow-lg">
                          {sortedModels.map((m, idx) => {
                            const isFav = favoriteModels.includes(m.id);
                            return (
                              <React.Fragment key={m.id}>
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    handleModelChange(m.id);
                                    setOpenTopBarSelector(null);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      handleModelChange(m.id);
                                      setOpenTopBarSelector(null);
                                    }
                                  }}
                                  className={`group w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-copilot-surface-hover transition-colors ${
                                    m.id === activeTab?.model
                                      ? 'text-copilot-accent bg-copilot-surface'
                                      : 'text-copilot-text'
                                  }`}
                                >
                                  {handleToggleFavoriteModel && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleFavoriteModel(m.id);
                                      }}
                                      className={`shrink-0 transition-colors ${
                                        isFav
                                          ? 'text-copilot-warning'
                                          : 'text-transparent group-hover:text-copilot-text-muted hover:!text-copilot-warning'
                                      }`}
                                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                    >
                                      {isFav ? (
                                        <StarFilledIcon size={12} />
                                      ) : (
                                        <StarIcon size={12} />
                                      )}
                                    </button>
                                  )}
                                  <span className="flex-1 text-left truncate">
                                    {m.id === activeTab?.model && (
                                      <span className="text-copilot-accent">✓ </span>
                                    )}
                                    {m.name || m.id}
                                  </span>
                                  <span
                                    className={`shrink-0 text-xs ${
                                      m.source === 'fallback'
                                        ? 'text-copilot-text-muted italic'
                                        : m.multiplier === 0
                                          ? 'text-copilot-success'
                                          : m.multiplier < 1
                                            ? 'text-copilot-success'
                                            : m.multiplier > 1
                                              ? 'text-copilot-warning'
                                              : 'text-copilot-text-muted'
                                    }`}
                                  >
                                    {m.source === 'fallback'
                                      ? 'unlisted'
                                      : m.multiplier === 0
                                        ? 'free'
                                        : `${m.multiplier}×`}
                                  </span>
                                </div>
                                {modelDividers.includes(idx) && (
                                  <div className="border-t border-copilot-border" />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Agents Selector */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenTopBarSelector(openTopBarSelector === 'agents' ? null : 'agents')
                        }
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
                          openTopBarSelector === 'agents'
                            ? 'text-copilot-accent bg-copilot-surface-hover'
                            : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover'
                        }`}
                        title="Select agent"
                      >
                        <ZapIcon size={12} />
                        <span className="font-medium truncate max-w-[120px]">
                          {activeAgent?.name || 'Agents'}
                        </span>
                        <ChevronDownIcon
                          size={10}
                          className={`transition-transform duration-200 ${openTopBarSelector === 'agents' ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {openTopBarSelector === 'agents' && (
                        <div className="absolute bottom-full left-0 z-50 mb-0.5 w-60 max-h-80 overflow-y-auto bg-copilot-surface border border-copilot-border rounded-lg shadow-lg">
                          {groupedAgents.length === 0 ? (
                            <div className="px-4 py-4 text-xs text-copilot-text-muted text-center">
                              No agents found
                            </div>
                          ) : (
                            groupedAgents.map((section, sectionIdx) => (
                              <div key={section.id}>
                                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-copilot-text-muted">
                                  {section.label}
                                </div>
                                {section.agents.map((agent) => {
                                  const isFav = favoriteAgents.includes(agent.path);
                                  const isActive = activeAgentPath === agent.path;
                                  const selectAgent = () => {
                                    if (!activeTab) return;
                                    setSelectedAgentByTab((prev) => ({
                                      ...prev,
                                      [activeTab.id]: agent.path,
                                    }));
                                    setOpenTopBarSelector(null);
                                  };
                                  return (
                                    <div
                                      key={agent.path}
                                      role="button"
                                      tabIndex={0}
                                      onClick={selectAgent}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          selectAgent();
                                        }
                                      }}
                                      className={`group w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-copilot-surface-hover transition-colors ${
                                        isActive
                                          ? 'text-copilot-accent bg-copilot-surface'
                                          : 'text-copilot-text'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleToggleFavoriteAgent(agent.path);
                                        }}
                                        className={`shrink-0 transition-colors ${
                                          isFav
                                            ? 'text-copilot-warning'
                                            : 'text-transparent group-hover:text-copilot-text-muted hover:!text-copilot-warning'
                                        }`}
                                        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                      >
                                        {isFav ? (
                                          <StarFilledIcon size={12} />
                                        ) : (
                                          <StarIcon size={12} />
                                        )}
                                      </button>
                                      <span className="flex-1 text-left truncate">
                                        {isActive && (
                                          <span className="text-copilot-accent">✓ </span>
                                        )}
                                        {agent.name}
                                      </span>
                                      {agent.type !== 'system' && (
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            window.electronAPI.file
                                              .openFile(agent.path)
                                              .then((result) => {
                                                if (!result.success) {
                                                  console.error(
                                                    'Failed to open agent file:',
                                                    result.error
                                                  );
                                                }
                                              })
                                              .catch((error) => {
                                                console.error('Failed to open agent file:', error);
                                              });
                                          }}
                                          className="shrink-0 opacity-0 group-hover:opacity-100 text-copilot-text-muted hover:text-copilot-text transition-opacity"
                                          title="View agent file"
                                        >
                                          <EyeIcon size={12} />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                                {sectionIdx < groupedAgents.length - 1 && (
                                  <div className="border-t border-copilot-border" />
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Loops Selector */}
                    <div className="relative">
                      <button
                        onClick={() => {
                          if (openTopBarSelector === 'loops') {
                            setOpenTopBarSelector(null);
                            setShowRalphSettings(false);
                            setShowLisaSettings(false);
                          } else {
                            setOpenTopBarSelector('loops');
                            setShowRalphSettings(true);
                            setShowLisaSettings(false);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
                          ralphEnabled || lisaEnabled
                            ? 'text-copilot-warning'
                            : openTopBarSelector === 'loops'
                              ? 'text-copilot-accent bg-copilot-surface-hover'
                              : 'text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover'
                        }`}
                        title="Agent Loops - Ralph Wiggum (Simple Loop) or Lisa Simpson (Multi-Phase)"
                        data-tour="agent-modes"
                      >
                        {lisaEnabled ? (
                          <LisaIcon size={12} />
                        ) : ralphEnabled ? (
                          <RalphIcon size={12} />
                        ) : (
                          <RepeatIcon size={12} />
                        )}
                        <span className="font-medium">
                          {lisaEnabled ? 'Lisa' : ralphEnabled ? 'Ralph' : 'Loops'}
                        </span>
                        <ChevronDownIcon
                          size={10}
                          className={`transition-transform duration-200 ${openTopBarSelector === 'loops' ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {openTopBarSelector === 'loops' && (
                        <div
                          className={`absolute bottom-full z-50 mb-0.5 w-80 max-w-[calc(100vw-2rem)] bg-copilot-surface border border-copilot-border rounded-lg shadow-lg p-3 ${isMobile ? 'right-0' : 'left-0'}`}
                          data-tour="agent-modes-panel"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-xs font-medium text-copilot-text">
                              Agent Loops
                            </span>
                            <span className="flex-1" />
                            <button
                              onClick={() => {
                                setOpenTopBarSelector(null);
                                setShowRalphSettings(false);
                                setShowLisaSettings(false);
                              }}
                              className="p-1 rounded hover:bg-copilot-surface-hover"
                            >
                              <CloseIcon size={10} className="text-copilot-text-muted" />
                            </button>
                          </div>

                          {/* Mode Selection Row */}
                          <div className="flex gap-2 mb-3">
                            {/* Ralph Option */}
                            <button
                              onClick={() => {
                                const enabling = !ralphEnabled;
                                setRalphEnabled(enabling);
                                if (enabling) {
                                  setLisaEnabled(false);
                                }
                              }}
                              className={`flex-1 p-2 rounded-lg border transition-all ${
                                ralphEnabled
                                  ? 'border-copilot-warning bg-copilot-warning/10'
                                  : 'border-copilot-border hover:border-copilot-text-muted'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <RalphIcon size={20} />
                                <div className="text-left">
                                  <div className="text-xs font-medium text-copilot-text">Ralph</div>
                                  <div className="text-[10px] text-copilot-text-muted">
                                    Simple loop
                                  </div>
                                </div>
                              </div>
                            </button>

                            {/* Lisa Option */}
                            <button
                              onClick={() => {
                                const enabling = !lisaEnabled;
                                setLisaEnabled(enabling);
                                if (enabling) {
                                  setRalphEnabled(false);
                                }
                              }}
                              className={`flex-1 p-2 rounded-lg border transition-all ${
                                lisaEnabled
                                  ? 'border-copilot-accent bg-copilot-accent/10'
                                  : 'border-copilot-border hover:border-copilot-text-muted'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <LisaIcon size={20} />
                                <div className="text-left">
                                  <div className="text-xs font-medium text-copilot-text">Lisa</div>
                                  <div className="text-[10px] text-copilot-text-muted">
                                    Multi-phase
                                  </div>
                                </div>
                              </div>
                            </button>
                          </div>

                          {/* Ralph Settings */}
                          {ralphEnabled && (
                            <div className="space-y-2.5 pt-2 border-t border-copilot-border">
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] text-copilot-text-muted">
                                  Max iterations
                                </label>
                                <input
                                  type="number"
                                  value={ralphMaxIterations}
                                  onChange={(e) =>
                                    setRalphMaxIterations(
                                      Math.max(1, parseInt(e.target.value) || 1)
                                    )
                                  }
                                  className="w-14 bg-copilot-surface border border-copilot-border rounded px-2 py-0.5 text-xs text-copilot-text"
                                  min={1}
                                  max={100}
                                />
                              </div>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ralphClearContext}
                                  onChange={(e) => setRalphClearContext(e.target.checked)}
                                  className="rounded border-copilot-border w-3.5 h-3.5"
                                />
                                <span className="text-[10px] text-copilot-text-muted">
                                  Clear context between iterations
                                </span>
                                <span
                                  className="text-[9px] text-copilot-text-muted/60"
                                  title="Forces agent to rely on file state, not chat history (recommended)"
                                >
                                  (recommended)
                                </span>
                              </label>
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ralphRequireScreenshot}
                                  onChange={(e) => setRalphRequireScreenshot(e.target.checked)}
                                  className="rounded border-copilot-border w-3.5 h-3.5"
                                />
                                <span className="text-[10px] text-copilot-text-muted">
                                  Require screenshot
                                </span>
                              </label>
                              <p className="text-[10px] text-copilot-text-muted">
                                Agent loops until verified complete: plan, test, fix errors, verify
                                all items.
                              </p>
                            </div>
                          )}

                          {/* Lisa Settings */}
                          {lisaEnabled && (
                            <div className="pt-2 border-t border-copilot-border">
                              <div className="text-[10px] text-copilot-text-muted space-y-1">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="px-1.5 py-0.5 bg-copilot-surface rounded">
                                    📋 Plan
                                  </span>
                                  <span>→</span>
                                  <span className="px-1 py-0.5 bg-copilot-warning/20 rounded text-[9px]">
                                    👀
                                  </span>
                                  <span>→</span>
                                  <span className="px-1.5 py-0.5 bg-copilot-surface rounded">
                                    💻 Code
                                  </span>
                                  <span>→</span>
                                  <span className="px-1 py-0.5 bg-copilot-warning/20 rounded text-[9px]">
                                    👀
                                  </span>
                                  <span>→</span>
                                  <span className="px-1.5 py-0.5 bg-copilot-surface rounded">
                                    🧪 Test
                                  </span>
                                  <span>→</span>
                                  <span className="px-1 py-0.5 bg-copilot-warning/20 rounded text-[9px]">
                                    👀
                                  </span>
                                </div>
                                <p>
                                  Reviewer checks after each phase. Can reject back to{' '}
                                  <strong>any</strong> earlier phase (e.g., from Code Review back to
                                  Plan if architecture needs rethinking).
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Click-away handler for dropdowns */}
                    {openTopBarSelector && (
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => {
                          setOpenTopBarSelector(null);
                          setShowRalphSettings(false);
                          setShowLisaSettings(false);
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Resize Handle */}
          {!rightPanelCollapsed && !isMobile && (
            <div
              className="w-0 cursor-col-resize shrink-0 relative z-10"
              onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
            >
              <div className="absolute inset-y-0 -right-1 w-2 hover:bg-copilot-accent/50 transition-colors" />
            </div>
          )}

          {/* Right Panel - Environment & Session Info */}
          {!rightPanelCollapsed && !isMobile ? (
            <div
              className="border-l border-copilot-border flex flex-col shrink-0 bg-copilot-bg"
              style={{ width: rightPanelWidth }}
            >
              {/* Collapse button in header */}
              <div className="px-2 py-1.5 border-b border-copilot-border bg-copilot-surface flex items-center gap-2">
                <button
                  onClick={toggleRightPanel}
                  className="shrink-0 p-1 text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover rounded transition-colors"
                  title="Collapse environment panel"
                >
                  <ChevronDownIcon size={12} className="-rotate-90" />
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {activeTab?.isProcessing ? (
                    <>
                      {activeTab?.lisaConfig?.active ? (
                        <LisaIcon size={12} className="animate-pulse" />
                      ) : activeTab?.ralphConfig?.active ? (
                        <RalphIcon size={12} className="text-copilot-warning animate-pulse" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-copilot-warning animate-pulse" />
                      )}
                      <span className="text-xs font-medium text-copilot-text truncate">
                        {activeTab?.lisaConfig?.active
                          ? (() => {
                              const phase = activeTab.lisaConfig.currentPhase;
                              const emoji: Record<LisaPhase, string> = {
                                plan: '📋',
                                'plan-review': '👀',
                                execute: '💻',
                                'code-review': '👀',
                                validate: '🧪',
                                'final-review': '👀',
                              };
                              const shortName: Record<LisaPhase, string> = {
                                plan: 'Plan',
                                'plan-review': 'Review',
                                execute: 'Code',
                                'code-review': 'Review',
                                validate: 'Test',
                                'final-review': 'Final',
                              };
                              return `Lisa ${emoji[phase]} ${shortName[phase]} ${activeTab.lisaConfig.phaseIterations[phase] || 1}`;
                            })()
                          : activeTab?.ralphConfig?.active
                            ? `Ralph ${activeTab.ralphConfig.currentIteration}/${activeTab.ralphConfig.maxIterations}`
                            : activeTab?.currentIntent || 'Working...'}
                      </span>
                      {(activeTab?.ralphConfig?.active || activeTab?.lisaConfig?.active) &&
                        activeTab?.currentIntent && (
                          <span className="text-[10px] text-copilot-text-muted truncate">
                            — {activeTab.currentIntent}
                          </span>
                        )}
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-copilot-success" />
                      <span className="text-xs font-medium text-copilot-text-muted">Ready</span>
                    </>
                  )}
                </div>
              </div>

              {/* Session Info Section */}
              <div className="flex-1 overflow-y-auto">
                {/* Processing indicator when no tools visible */}
                {activeTab?.isProcessing && (activeTab?.activeTools?.length || 0) === 0 && (
                  <div className="px-3 py-3 flex items-center gap-2 border-b border-copilot-border">
                    <Spinner size="sm" />
                    <span className="text-xs text-copilot-text-muted">Thinking...</span>
                  </div>
                )}

                <div className="mt-auto">
                  {/* Working Directory */}
                  <div className="px-3 py-2 border-b border-copilot-surface">
                    <div className="text-[10px] text-copilot-text-muted uppercase tracking-wide mb-1">
                      Directory
                    </div>
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      <FolderIcon size={12} className="text-copilot-accent shrink-0" />
                      <span className="text-copilot-text font-mono truncate" title={activeTab?.cwd}>
                        {activeTab?.cwd || 'Unknown'}
                      </span>
                      {activeTab?.cwd && (
                        <button
                          className="shrink-0 p-0.5 rounded hover:bg-copilot-surface text-copilot-text-muted hover:text-copilot-text transition-colors"
                          title={cwdCopied ? 'Copied!' : 'Copy path'}
                          aria-label={cwdCopied ? 'Copied!' : 'Copy path'}
                          onClick={() => {
                            navigator.clipboard
                              .writeText(activeTab.cwd)
                              .then(() => {
                                setCwdCopied(true);
                                setTimeout(() => setCwdCopied(false), 2000);
                              })
                              .catch(() => {});
                          }}
                        >
                          {cwdCopied ? (
                            <CheckIcon size={12} className="text-copilot-success" />
                          ) : (
                            <CopyIcon size={12} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Git Branch */}
                  <div className="px-3 py-2 border-b border-copilot-surface">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-[10px] text-copilot-text-muted uppercase tracking-wide">
                        Git Branch
                      </div>
                    </div>
                    <GitBranchWidget
                      cwd={activeTab?.cwd}
                      refreshKey={activeTab?.gitBranchRefresh}
                    />
                  </div>

                  {/* Edited Files */}
                  <div className="border-b border-copilot-surface" data-tour="edited-files">
                    <div className="flex items-center">
                      <button
                        onClick={handleToggleEditedFiles}
                        className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                      >
                        <ChevronRightIcon
                          size={8}
                          className={`transition-transform ${showEditedFiles ? 'rotate-90' : ''}`}
                        />
                        <span>Edited Files</span>
                        {cleanedEditedFiles.length > 0 && (
                          <span className="text-copilot-accent">
                            ({cleanedEditedFiles.length - (activeTab?.untrackedFiles?.length || 0)})
                          </span>
                        )}
                        {(activeTab?.untrackedFiles?.length || 0) > 0 && (
                          <span
                            className="text-copilot-text-muted"
                            title="Untracked files (excluded from commit)"
                          >
                            +{activeTab?.untrackedFiles?.length} untracked
                          </span>
                        )}
                        {showEditedFiles && !isGitRepo && (
                          <span
                            className="text-copilot-warning"
                            title="Not in a Git repository. File list is based on manual tracking of files touched in this session."
                          >
                            <WarningIcon size={10} />
                          </span>
                        )}
                      </button>
                      {isGitRepo && (
                        <IconButton
                          icon={<CommitIcon size={12} />}
                          onClick={() =>
                            activeTab && commitModal.handleOpenCommitModal(activeTab, updateTab)
                          }
                          variant="accent"
                          size="sm"
                          title="Commit and push"
                          className="mr-1"
                        />
                      )}
                    </div>
                    {showEditedFiles && activeTab && (
                      <div className="max-h-48 overflow-y-auto">
                        {activeTab.editedFiles.length === 0 ? (
                          <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                            No files edited
                          </div>
                        ) : (
                          // Simple flat list - clicking opens the full overlay
                          cleanedEditedFiles.map((filePath) => {
                            const isConflicted =
                              isGitRepo &&
                              commitModal.conflictedFiles.some(
                                (cf) =>
                                  filePath.endsWith(cf) ||
                                  cf.endsWith(filePath.split(/[/\\]/).pop() || '')
                              );
                            const isUntracked = (activeTab.untrackedFiles || []).includes(filePath);
                            return (
                              <button
                                key={filePath}
                                onClick={() => setFilePreviewPath(filePath)}
                                className={`w-full flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-copilot-surface text-left ${
                                  isUntracked
                                    ? 'text-copilot-text-muted/50'
                                    : isConflicted
                                      ? 'text-copilot-error'
                                      : 'text-copilot-text-muted'
                                }`}
                                title={
                                  isUntracked
                                    ? `${filePath} (untracked) - Click to preview`
                                    : isConflicted
                                      ? `${filePath} (conflict) - Click to preview`
                                      : `${filePath} - Click to preview`
                                }
                              >
                                <FileIcon
                                  size={8}
                                  className={`shrink-0 ${
                                    isUntracked
                                      ? 'text-copilot-text-muted/50'
                                      : isConflicted
                                        ? 'text-copilot-error'
                                        : 'text-copilot-success'
                                  }`}
                                />
                                <span
                                  className={`truncate font-mono ${isUntracked ? 'line-through' : ''}`}
                                >
                                  {filePath}
                                </span>
                                {isConflicted && (
                                  <span className="text-[8px] text-copilot-error">!</span>
                                )}
                                {isUntracked && (
                                  <span className="text-[8px] text-copilot-text-muted">
                                    (untracked)
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* MCP Servers & Skills Section */}
                  <div data-tour="mcp-skills">
                    {/* MCP Servers */}
                    <div>
                      <div className="flex items-center">
                        <button
                          onClick={() => setShowMcpServers(!showMcpServers)}
                          className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                        >
                          <ChevronRightIcon
                            size={8}
                            className={`transition-transform ${showMcpServers ? 'rotate-90' : ''}`}
                          />
                          <span>MCP Servers</span>
                          {Object.keys(mcpServers).length > 0 && (
                            <span className="text-copilot-accent">
                              ({Object.keys(mcpServers).length})
                            </span>
                          )}
                        </button>
                        <IconButton
                          icon={<FileIcon size={12} />}
                          onClick={() => setShowMcpJsonModal(true)}
                          variant="accent"
                          size="sm"
                          title="View JSON config"
                          className="mr-1"
                        />
                        <IconButton
                          icon={<RepeatIcon size={12} />}
                          onClick={handleRefreshMcpServers}
                          variant="accent"
                          size="sm"
                          title="Refresh MCP servers"
                          className="mr-1"
                        />
                        <IconButton
                          icon={<PlusIcon size={12} />}
                          onClick={openAddMcpModal}
                          variant="success"
                          size="sm"
                          title="Add MCP server"
                          className="mr-1"
                        />
                      </div>
                      {showMcpServers && (
                        <div className="max-h-48 overflow-y-auto">
                          {mcpEntries.length === 0 ? (
                            <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                              No MCP servers configured
                            </div>
                          ) : (
                            <div className="divide-y divide-copilot-border">
                              {mcpEntries.map(([name, server]) => {
                                const isLocal =
                                  !server.type ||
                                  server.type === 'local' ||
                                  server.type === 'stdio';
                                return (
                                  <div
                                    key={name}
                                    className="group px-3 py-1.5 hover:bg-copilot-surface"
                                  >
                                    <div className="flex items-center gap-2">
                                      {isLocal ? (
                                        <MonitorIcon
                                          size={10}
                                          className="shrink-0 text-copilot-accent"
                                        />
                                      ) : (
                                        <GlobeIcon
                                          size={10}
                                          className="shrink-0 text-copilot-accent"
                                        />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs text-copilot-text truncate">
                                          {name}
                                        </div>
                                      </div>
                                      <div className="shrink-0 opacity-0 group-hover:opacity-100 flex gap-1">
                                        <IconButton
                                          icon={<EditIcon size={10} />}
                                          onClick={() => openEditMcpModal(name, server)}
                                          variant="accent"
                                          size="xs"
                                          title="Edit"
                                        />
                                        <IconButton
                                          icon={<CloseIcon size={10} />}
                                          onClick={() => handleDeleteMcpServer(name)}
                                          variant="error"
                                          size="xs"
                                          title="Delete"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Separator */}
                    <div className="border-t border-copilot-border" />

                    {/* Agent Skills */}
                    <div>
                      <div className="flex items-center">
                        <button
                          onClick={() => setShowSkills(!showSkills)}
                          className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                        >
                          <ChevronRightIcon
                            size={8}
                            className={`transition-transform ${showSkills ? 'rotate-90' : ''}`}
                          />
                          <span>Agent Skills</span>
                          {skills.length > 0 && (
                            <span className="text-copilot-accent">({skills.length})</span>
                          )}
                        </button>
                        <button
                          onClick={(event) => handleOpenEnvironment('skills', event)}
                          className="mr-2 px-1.5 py-0.5 text-[9px] text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface border border-copilot-border rounded transition-colors shrink-0"
                          title="Open Environment view"
                        >
                          Environment
                        </button>
                      </div>
                      {showSkills && (
                        <div className="max-h-48 overflow-y-auto">
                          {flatSkills.length === 0 ? (
                            <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                              No skills found
                            </div>
                          ) : (
                            <div className="px-3 pb-2 pt-1">
                              <div className="space-y-2">
                                {flatSkills.map((skill) => (
                                  <div key={skill.path} className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => window.electronAPI.file.openFile(skill.path)}
                                        className="shrink-0 text-copilot-accent"
                                        title={`Open ${skill.name}`}
                                      >
                                        <BookIcon size={12} />
                                      </button>
                                      <span className="text-copilot-text truncate">
                                        {skill.name}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Separator */}
                    <div className="border-t border-copilot-border" />

                    {/* Copilot Instructions */}
                    <div>
                      <div className="flex items-center">
                        <button
                          onClick={() => setShowInstructions(!showInstructions)}
                          className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                        >
                          <ChevronRightIcon
                            size={8}
                            className={`transition-transform ${showInstructions ? 'rotate-90' : ''}`}
                          />
                          <span>Instructions</span>
                          {instructions.length > 0 && (
                            <span className="text-copilot-accent">({instructions.length})</span>
                          )}
                        </button>
                        <button
                          onClick={(event) => handleOpenEnvironment('instructions', event)}
                          className="mr-2 px-1.5 py-0.5 text-[9px] text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface border border-copilot-border rounded transition-colors shrink-0"
                          title="Open Environment view"
                        >
                          Environment
                        </button>
                      </div>
                      {showInstructions && (
                        <div className="max-h-48 overflow-y-auto">
                          {flatInstructions.length === 0 ? (
                            <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                              No instruction files found
                            </div>
                          ) : (
                            <div className="px-3 pb-2 pt-1">
                              <div className="space-y-2">
                                {flatInstructions.map((instruction) => (
                                  <div key={instruction.path} className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          window.electronAPI.file.openFile(instruction.path)
                                        }
                                        className="shrink-0 text-copilot-accent"
                                        title={`Open ${instruction.name}`}
                                      >
                                        <FileIcon size={12} />
                                      </button>
                                      <span className="text-copilot-text truncate">
                                        {instruction.name}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Separator */}
                    <div className="border-t border-copilot-border" />
                  </div>
                  {/* End MCP/Skills wrapper */}
                </div>
              </div>

              {/* Allowed Commands - pinned to bottom */}
              <div className="mt-auto border-t border-copilot-border" data-tour="allowed-commands">
                <div className="flex items-center">
                  {!activeTab?.yoloMode && (
                    <button
                      onClick={() => {
                        setShowAllowedCommands(!showAllowedCommands);
                        if (!showAllowedCommands) {
                          refreshAlwaysAllowed();
                        }
                      }}
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                    >
                      <ChevronRightIcon
                        size={8}
                        className={`transition-transform ${showAllowedCommands ? '-rotate-90' : ''}`}
                      />
                      <span>Allowed Commands</span>
                      {(activeTab?.alwaysAllowed.length || 0) > 0 && (
                        <span className="text-copilot-accent">
                          ({activeTab?.alwaysAllowed.length || 0})
                        </span>
                      )}
                    </button>
                  )}
                  {activeTab?.yoloMode && (
                    <span className="flex-1 text-[10px] text-copilot-error/70 pl-3">
                      All actions auto-approved — no confirmations will be shown
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      if (!activeTab) return;
                      const newValue = !activeTab.yoloMode;
                      await window.electronAPI.copilot.setYoloMode(activeTab.id, newValue);
                      updateTab(activeTab.id, { yoloMode: newValue });
                      if (newValue) {
                        updateTab(activeTab.id, { pendingConfirmations: [] });
                      }
                    }}
                    className={`shrink-0 px-3 py-2 text-xs transition-colors ${
                      activeTab?.yoloMode
                        ? 'font-bold text-copilot-error'
                        : 'text-copilot-text-muted hover:text-copilot-text'
                    }`}
                    title={
                      activeTab?.yoloMode
                        ? 'YOLO mode ON — all actions auto-approved. Click to disable.'
                        : 'Enable YOLO mode — auto-approve all actions without confirmation'
                    }
                  >
                    YOLO
                  </button>
                </div>
                {!activeTab?.yoloMode && showAllowedCommands && activeTab && (
                  <div className="max-h-48 overflow-y-auto">
                    {activeTab.alwaysAllowed.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                        No session commands
                      </div>
                    ) : (
                      <div className="pb-1">
                        {(() => {
                          const isSpecialExe = (exe: string) =>
                            exe.startsWith('write') ||
                            exe.startsWith('url') ||
                            exe.startsWith('mcp');
                          const toPretty = (exe: string) => {
                            const hasColon = exe.includes(':');
                            const [rawPrefix, rawRest] = hasColon ? exe.split(':', 2) : [exe, null];
                            const prefix = rawPrefix;
                            const rest = rawRest;

                            const isSpecial =
                              prefix === 'write' || prefix === 'url' || prefix === 'mcp';
                            const meaning =
                              prefix === 'write'
                                ? 'File changes'
                                : prefix === 'url'
                                  ? 'Web access'
                                  : prefix === 'mcp'
                                    ? 'MCP tools'
                                    : '';

                            return isSpecial ? (rest ? `${meaning}: ${rest}` : meaning) : exe;
                          };

                          return activeTab.alwaysAllowed
                            .map((cmd) => ({
                              cmd,
                              isSpecial: isSpecialExe(cmd),
                              pretty: toPretty(cmd),
                            }))
                            .sort((a, b) => {
                              if (a.isSpecial !== b.isSpecial) return a.isSpecial ? -1 : 1;
                              return a.pretty.localeCompare(b.pretty);
                            })
                            .map(({ cmd, isSpecial, pretty }) => (
                              <div
                                key={`session-${cmd}`}
                                className="flex items-center gap-2 px-3 py-1 text-[10px] hover:bg-copilot-surface-hover transition-colors"
                              >
                                <span
                                  className={`flex-1 truncate font-mono ${
                                    isSpecial ? 'text-copilot-accent' : 'text-copilot-text-muted'
                                  }`}
                                  title={pretty}
                                >
                                  {pretty}
                                </span>
                                <button
                                  onClick={() => handleRemoveAlwaysAllowed(cmd)}
                                  className="shrink-0 text-copilot-error hover:brightness-110"
                                  title="Remove"
                                >
                                  <CloseIcon size={10} />
                                </button>
                              </div>
                            ));
                        })()}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setSettingsDefaultSection('commands');
                        setShowSettingsModal(true);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-copilot-text-muted hover:text-copilot-accent hover:bg-copilot-surface-hover transition-colors border-t border-copilot-border"
                    >
                      <GlobeIcon size={10} />
                      <span>Global Allowed</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : !isMobile ? (
            /* Right Panel Toggle Button (when collapsed) */
            <button
              onClick={toggleRightPanel}
              className="shrink-0 w-10 bg-copilot-bg border-l border-copilot-border flex flex-col items-center py-2 gap-2 hover:bg-copilot-surface transition-colors"
              title="Show environment panel"
            >
              <ChevronDownIcon size={14} className="rotate-90 text-copilot-text-muted" />
              <span
                className="text-[10px] text-copilot-text-muted"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                Environment
              </span>
              {activeTab?.isProcessing && (
                <span className="w-2 h-2 rounded-full bg-copilot-warning animate-pulse" />
              )}
            </button>
          ) : null}
        </div>

        {/* Commit Modal */}
        <CommitModal
          showCommitModal={commitModal.showCommitModal}
          activeTab={activeTab}
          commitMessage={commitModal.commitMessage}
          isCommitting={commitModal.isCommitting}
          commitError={commitModal.commitError}
          commitAction={commitModal.commitAction}
          removeWorktreeAfterMerge={commitModal.removeWorktreeAfterMerge}
          isGeneratingMessage={commitModal.isGeneratingMessage}
          mainAheadInfo={commitModal.mainAheadInfo}
          isMergingMain={commitModal.isMergingMain}
          conflictedFiles={commitModal.conflictedFiles}
          targetBranch={commitModal.targetBranch}
          availableBranches={commitModal.availableBranches}
          isLoadingBranches={commitModal.isLoadingBranches}
          pendingMergeInfo={commitModal.pendingMergeInfo}
          onClose={commitModal.closeCommitModal}
          onCommitMessageChange={commitModal.setCommitMessage}
          onCommitActionChange={commitModal.setCommitAction}
          onRemoveWorktreeChange={commitModal.setRemoveWorktreeAfterMerge}
          onCommitAndPush={() =>
            activeTab && commitModal.handleCommitAndPush(activeTab, updateTab, handleCloseTab)
          }
          onMergeMainIntoBranch={() =>
            activeTab && commitModal.handleMergeMainIntoBranch(activeTab, updateTab)
          }
          onTargetBranchSelect={(branch) =>
            activeTab && commitModal.handleTargetBranchSelect(activeTab, branch)
          }
          onFilePreview={(filePath) => {
            setFilePreviewPath(filePath);
            commitModal.closeCommitModal();
          }}
          onUntrackFile={(filePath) => {
            if (activeTab) {
              const newUntracked = [...(activeTab.untrackedFiles || []), filePath];
              updateTab(activeTab.id, { untrackedFiles: newUntracked });
            }
          }}
          onRestoreFile={(filePath) => {
            if (activeTab) {
              const newUntracked = (activeTab.untrackedFiles || []).filter((f) => f !== filePath);
              updateTab(activeTab.id, { untrackedFiles: newUntracked });
            }
          }}
          onCopyErrorToMessage={handleCopyCommitErrorToMessage}
          onDismissPendingMerge={() => commitModal.setPendingMergeInfo(null)}
          onMergeNow={() =>
            activeTab && commitModal.handleMergeNow(activeTab, updateTab, handleCloseTab)
          }
        />

        {/* MCP Server Modal */}
        <Modal
          isOpen={showMcpModal}
          onClose={() => setShowMcpModal(false)}
          title={editingMcpServer ? 'Edit MCP Server' : 'Add MCP Server'}
          width="450px"
        >
          <Modal.Body className="space-y-4">
            {/* Server Name */}
            <div>
              <label className="text-xs text-copilot-text-muted mb-1 block">Server Name</label>
              <input
                type="text"
                value={mcpFormData.name}
                onChange={(e) => setMcpFormData({ ...mcpFormData, name: e.target.value })}
                className="w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text placeholder-copilot-text-muted focus:border-copilot-accent outline-none"
                placeholder="my-mcp-server"
                autoFocus
              />
            </div>

            {/* Server Type */}
            <div>
              <label className="text-xs text-copilot-text-muted mb-1 block">Type</label>
              <div className="flex gap-2">
                {(['local', 'http', 'sse'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={mcpFormData.type === type ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setMcpFormData({ ...mcpFormData, type })}
                  >
                    {type === 'local' ? 'Local/Stdio' : type.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Local Server Config */}
            {mcpFormData.type === 'local' && (
              <>
                <div>
                  <label className="text-xs text-copilot-text-muted mb-1 block">Command</label>
                  <input
                    type="text"
                    value={mcpFormData.command}
                    onChange={(e) =>
                      setMcpFormData({
                        ...mcpFormData,
                        command: e.target.value,
                      })
                    }
                    className="w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text font-mono placeholder-copilot-text-muted focus:border-copilot-accent outline-none"
                    placeholder="npx"
                  />
                </div>
                <div>
                  <label className="text-xs text-copilot-text-muted mb-1 block">
                    Arguments (space-separated)
                  </label>
                  <input
                    type="text"
                    value={mcpFormData.args}
                    onChange={(e) => setMcpFormData({ ...mcpFormData, args: e.target.value })}
                    className="w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text font-mono placeholder-copilot-text-muted focus:border-copilot-accent outline-none"
                    placeholder="-y @my-mcp-server"
                  />
                </div>
              </>
            )}

            {/* Remote Server Config */}
            {(mcpFormData.type === 'http' || mcpFormData.type === 'sse') && (
              <div>
                <label className="text-xs text-copilot-text-muted mb-1 block">URL</label>
                <input
                  type="text"
                  value={mcpFormData.url}
                  onChange={(e) => setMcpFormData({ ...mcpFormData, url: e.target.value })}
                  className="w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text font-mono placeholder-copilot-text-muted focus:border-copilot-accent outline-none"
                  placeholder="https://mcp-server.example.com"
                />
              </div>
            )}

            {/* Tools */}
            <div>
              <label className="text-xs text-copilot-text-muted mb-1 block">
                Tools (* for all, or comma-separated list)
              </label>
              <input
                type="text"
                value={mcpFormData.tools}
                onChange={(e) => setMcpFormData({ ...mcpFormData, tools: e.target.value })}
                className="w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text font-mono placeholder-copilot-text-muted focus:border-copilot-accent outline-none"
                placeholder="*"
              />
            </div>

            {/* Actions */}
            <Modal.Footer className="pt-2">
              <Button variant="ghost" onClick={() => setShowMcpModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveMcpServer}
                disabled={
                  !mcpFormData.name.trim() ||
                  (mcpFormData.type === 'local'
                    ? !mcpFormData.command.trim()
                    : !mcpFormData.url.trim())
                }
              >
                {editingMcpServer ? 'Save Changes' : 'Add Server'}
              </Button>
            </Modal.Footer>
          </Modal.Body>
        </Modal>

        {/* MCP JSON View Modal */}
        <Modal
          isOpen={showMcpJsonModal}
          onClose={() => setShowMcpJsonModal(false)}
          title="MCP Configuration"
          width="600px"
        >
          <Modal.Body>
            <div className="mb-3">
              <pre className="bg-copilot-bg border border-copilot-border rounded p-3 text-xs text-copilot-text font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                {JSON.stringify({ mcpServers }, null, 2)}
              </pre>
            </div>
            <Modal.Footer className="pt-2">
              <Button variant="ghost" onClick={() => setShowMcpJsonModal(false)}>
                Close
              </Button>
              <Button variant="primary" onClick={handleOpenMcpConfigInEditor}>
                Open in Editor
              </Button>
            </Modal.Footer>
          </Modal.Body>
        </Modal>

        {/* Session History Modal */}
        <SessionHistory
          isOpen={showSessionHistory}
          onClose={() => setShowSessionHistory(false)}
          sessions={previousSessions}
          activeSessions={tabs}
          activeSessionId={activeTabId}
          onResumeSession={handleResumePreviousSession}
          onSwitchToSession={handleSwitchTab}
          onDeleteSession={handleDeleteSessionFromHistory}
          onRemoveWorktreeSession={handleRemoveWorktreeSession}
          onOpenWorktreeSession={handleOpenWorktreeSession}
        />

        {/* Create Worktree Session Modal */}
        <CreateWorktreeSession
          isOpen={showCreateWorktree}
          onClose={() => setShowCreateWorktree(false)}
          repoPath={worktreeRepoPath}
          onSessionCreated={handleWorktreeSessionCreated}
        />

        {/* Terminal Output Shrink Modal */}
        {pendingTerminalOutput && (
          <TerminalOutputShrinkModal
            isOpen={!!pendingTerminalOutput}
            onClose={() => setPendingTerminalOutput(null)}
            onConfirm={handleShrinkModalConfirm}
            output={pendingTerminalOutput.output}
            lineCount={pendingTerminalOutput.lineCount}
            lastCommandStart={pendingTerminalOutput.lastCommandStart}
          />
        )}

        {/* Image Lightbox Modal */}
        {lightboxImage && (
          <div
            className="fixed top-[var(--titlebar-height)] left-0 right-0 bottom-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm cursor-pointer"
            onClick={() => setLightboxImage(null)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.alt}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={() => setLightboxImage(null)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-copilot-surface text-copilot-text rounded-full flex items-center justify-center hover:bg-copilot-surface-hover transition-colors shadow-lg"
                title="Close"
              >
                <CloseIcon size={16} />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-sm px-3 py-2 rounded-b-lg truncate">
                {lightboxImage.alt}
              </div>
            </div>
          </div>
        )}

        {/* Environment Modal */}
        <EnvironmentModal
          isOpen={showEnvironmentModal}
          onClose={() => setShowEnvironmentModal(false)}
          instructions={instructions}
          skills={skills}
          cwd={activeTab?.cwd}
          initialTab={environmentTab}
          fileViewMode={activeTab?.fileViewMode || 'flat'}
          onViewModeChange={(mode) => {
            if (activeTab) {
              updateTab(activeTab.id, { fileViewMode: mode });
            }
          }}
          onTabChange={(tab) => setEnvironmentTab(tab)}
        />

        {/* File Preview Modal */}
        <FilePreviewModal
          isOpen={!!filePreviewPath}
          onClose={() => setFilePreviewPath(null)}
          filePath={filePreviewPath || ''}
          cwd={activeTab?.cwd}
          isGitRepo={isGitRepo}
          editedFiles={activeTab ? getCleanEditedFiles(activeTab.editedFiles) : []}
          untrackedFiles={activeTab?.untrackedFiles || []}
          conflictedFiles={commitModal.conflictedFiles}
          fileViewMode={activeTab?.fileViewMode || 'flat'}
          onUntrackFile={(filePath) => {
            if (activeTab) {
              const newUntracked = [...(activeTab.untrackedFiles || []), filePath];
              updateTab(activeTab.id, { untrackedFiles: newUntracked });
            }
          }}
          onRetrackFile={(filePath) => {
            if (activeTab) {
              const newUntracked = (activeTab.untrackedFiles || []).filter((f) => f !== filePath);
              updateTab(activeTab.id, { untrackedFiles: newUntracked });
            }
          }}
          onViewModeChange={(mode) => {
            if (activeTab) {
              updateTab(activeTab.id, { fileViewMode: mode });
            }
          }}
        />

        {/* Update Available Modal */}
        <UpdateAvailableModal
          isOpen={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
          currentVersion={updateInfo?.currentVersion || buildInfo.baseVersion}
          newVersion={updateInfo?.latestVersion || ''}
          onDontRemind={() => {
            if (updateInfo?.latestVersion) {
              window.electronAPI.updates.dismissVersion(updateInfo.latestVersion);
            }
          }}
        />

        {/* Release Notes Modal */}
        <ReleaseNotesModal
          isOpen={showReleaseNotesModal}
          onClose={() => {
            setShowReleaseNotesModal(false);
            // Show update modal if there's an update available
            if (updateInfo) {
              setShowUpdateModal(true);
            }
          }}
          version={buildInfo.baseVersion}
          releaseNotes={buildInfo.releaseNotes || ''}
        />

        {/* Settings Modal */}
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => {
            setShowSettingsModal(false);
            setSettingsDefaultSection(undefined);
          }}
          soundEnabled={soundEnabled}
          onSoundEnabledChange={handleSoundEnabledChange}
          defaultSection={settingsDefaultSection}
          // Voice settings
          voiceSupported={voiceSpeech.isSupported}
          voiceMuted={voiceSpeech.isMuted}
          onToggleVoiceMute={voiceSpeech.toggleMute}
          pushToTalk={pushToTalk}
          onTogglePushToTalk={handleTogglePushToTalk}
          alwaysListening={alwaysListening}
          onToggleAlwaysListening={handleToggleAlwaysListening}
          // Voice status
          isRecording={voiceSpeech.isRecording}
          isSpeaking={voiceSpeech.isSpeaking}
          isModelLoading={voiceModelLoading}
          modelLoaded={voiceModelLoaded}
          voiceError={voiceInitError}
          alwaysListeningError={alwaysListeningError}
          voiceDownloadProgress={voiceDownloadProgress}
          onInitVoice={handleInitVoice}
          availableVoices={voiceSpeech.availableVoices}
          selectedVoiceURI={voiceSpeech.selectedVoiceURI}
          onVoiceChange={voiceSpeech.setSelectedVoiceURI}
          // Global commands
          globalSafeCommands={globalSafeCommands}
          onAddGlobalSafeCommand={async (cmd) => {
            try {
              await window.electronAPI.copilot.addGlobalSafeCommand(cmd);
              setGlobalSafeCommands((prev) => [...prev, cmd]);
            } catch (error) {
              console.error('Failed to add global safe command:', error);
            }
          }}
          onRemoveGlobalSafeCommand={handleRemoveGlobalSafeCommand}
        />

        {/* Welcome Wizard - Spotlight Tour */}
        <SpotlightTour
          isOpen={showWelcomeWizard}
          onClose={() => setShowWelcomeWizard(false)}
          onComplete={async () => {
            try {
              await window.electronAPI.wizard.markWelcomeAsSeen();
            } catch (error) {
              console.error('Failed to mark welcome wizard as seen:', error);
            }
          }}
        />

        {/* Session Context Menu (right-click on tab) */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-copilot-surface border border-copilot-border rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {(() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              const isMarked = tab?.markedForReview;
              return (
                <>
                  <button
                    onClick={() => handleToggleMarkForReview(contextMenu.tabId)}
                    className="w-full px-3 py-1.5 text-left text-xs text-copilot-text hover:bg-copilot-bg transition-colors flex items-center gap-2"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${isMarked ? 'bg-copilot-text-muted' : 'bg-cyan-500'}`}
                    />
                    {isMarked ? 'Remove Mark' : 'Mark for Review'}
                  </button>
                  <button
                    onClick={() => handleOpenNoteModal(contextMenu.tabId)}
                    className="w-full px-3 py-1.5 text-left text-xs text-copilot-text hover:bg-copilot-bg transition-colors flex items-center gap-2"
                  >
                    <EditIcon size={10} />
                    {tab?.reviewNote ? 'Edit Note...' : 'Add Note...'}
                  </button>
                  <div className="border-t border-copilot-border my-1" />
                  <button
                    onClick={() => {
                      setTabs((prev) =>
                        prev.map((t) =>
                          t.id === contextMenu.tabId
                            ? { ...t, isRenaming: true, renameDraft: t.name }
                            : t
                        )
                      );
                      setContextMenu(null);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs text-copilot-text hover:bg-copilot-bg transition-colors flex items-center gap-2"
                  >
                    <EditIcon size={10} />
                    Rename...
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {/* Note Input Modal */}
        {noteInputModal && (
          <div className="fixed top-[var(--titlebar-height)] left-0 right-0 bottom-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-copilot-surface border border-copilot-border rounded-lg shadow-xl w-full max-w-md mx-4 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-copilot-text">
                  {noteInputModal.currentNote ? 'Edit Review Note' : 'Add Review Note'}
                </h3>
                <button
                  onClick={() => {
                    setNoteInputModal(null);
                    setNoteInputValue('');
                  }}
                  className="text-copilot-text-muted hover:text-copilot-text"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
              <textarea
                autoFocus
                value={noteInputValue}
                onChange={(e) => setNoteInputValue(e.target.value)}
                placeholder="Leave a note to remind yourself what to do when you return..."
                className="w-full h-24 px-3 py-2 text-sm bg-copilot-bg border border-copilot-border rounded text-copilot-text placeholder:text-copilot-text-muted resize-none focus:outline-none focus:border-copilot-accent"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSaveNote();
                  }
                  if (e.key === 'Escape') {
                    setNoteInputModal(null);
                    setNoteInputValue('');
                  }
                }}
              />
              <div className="flex justify-end gap-2 mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNoteInputModal(null);
                    setNoteInputValue('');
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSaveNote}>
                  Save Note
                </Button>
              </div>
              <p className="text-[10px] text-copilot-text-muted mt-2">
                Tip: Press {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to save
              </p>
            </div>
          </div>
        )}
      </div>
    </TerminalProvider>
  );
};

export default App;
