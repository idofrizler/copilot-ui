import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import logo from "./assets/logo.png";
import { useTheme } from "./context/ThemeContext";
import {
  Spinner,
  GitBranchWidget,
  WindowControls,
  Dropdown,
  Modal,
  Button,
  IconButton,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  MoonIcon,
  SunIcon,
  MonitorIcon,
  UploadIcon,
  ClockIcon,
  FolderIcon,
  CommitIcon,
  FileIcon,
  EditIcon,
  StopIcon,
  TrashIcon,
  GlobeIcon,
  RalphIcon,
  TerminalIcon,
  TerminalPanel,
  WorktreeSessionsList,
  CreateWorktreeSession,
} from "./components";
import {
  Status,
  Message,
  ActiveTool,
  ModelInfo,
  PendingConfirmation,
  TabState,
  PreviousSession,
  MCPServerConfig,
  MCPLocalServerConfig,
  MCPRemoteServerConfig,
  RalphConfig,
  RALPH_COMPLETION_SIGNAL,
} from "./types";
import {
  generateId,
  generateTabName,
  formatToolOutput,
  setTabCounter,
} from "./utils/session";
import { playNotificationSound } from "./utils/sound";
import buildInfo from "./build-info.json";

const App: React.FC = () => {
  const [status, setStatus] = useState<Status>("connecting");
  const [inputValue, setInputValue] = useState("");
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [previousSessions, setPreviousSessions] = useState<PreviousSession[]>(
    [],
  );
  const [showPreviousSessions, setShowPreviousSessions] = useState(false);
  const [showAlwaysAllowed, setShowAlwaysAllowed] = useState(false);
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [addCommandValue, setAddCommandValue] = useState("");
  const [showEditedFiles, setShowEditedFiles] = useState(true);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitAction, setCommitAction] = useState<'push' | 'merge' | 'pr'>('push');
  const [removeWorktreeAfterMerge, setRemoveWorktreeAfterMerge] = useState(false);
  const [pendingMergeInfo, setPendingMergeInfo] = useState<{ incomingFiles: string[] } | null>(null);

  // Theme context
  const {
    themePreference,
    activeTheme,
    availableThemes,
    setTheme,
    importTheme,
  } = useTheme();
  // MCP Server state
  const [mcpServers, setMcpServers] = useState<Record<string, MCPServerConfig>>(
    {},
  );
  const [showMcpServers, setShowMcpServers] = useState(false);
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [editingMcpServer, setEditingMcpServer] = useState<{
    name: string;
    server: MCPServerConfig;
  } | null>(null);
  const [mcpFormData, setMcpFormData] = useState({
    name: "",
    type: "local" as "local" | "http" | "sse",
    command: "",
    args: "",
    url: "",
    tools: "*",
  });

  // Ralph Wiggum loop state
  const [showRalphSettings, setShowRalphSettings] = useState(false);
  const [ralphEnabled, setRalphEnabled] = useState(false);
  const [ralphMaxIterations, setRalphMaxIterations] = useState(20);

  // Worktree session state
  const [showWorktreeList, setShowWorktreeList] = useState(false);
  const [showCreateWorktree, setShowCreateWorktree] = useState(false);
  const [worktreeRepoPath, setWorktreeRepoPath] = useState("");

  // Terminal panel state - track which session has terminal open
  const [terminalOpenForSession, setTerminalOpenForSession] = useState<string | null>(null);
  // Terminal output attachment state
  const [terminalAttachment, setTerminalAttachment] = useState<{output: string; lineCount: number} | null>(null);

  // Resizable panel state
  const [leftPanelWidth, setLeftPanelWidth] = useState(192); // default w-48
  const [rightPanelWidth, setRightPanelWidth] = useState(288); // default w-72
  const resizingPanel = useRef<'left' | 'right' | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeTabIdRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  // Focus input when active tab changes
  useEffect(() => {
    if (activeTabId) {
      inputRef.current?.focus();
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
      }));
      window.electronAPI.copilot.saveOpenSessions(openSessions);
    }
  }, [tabs]);

  // Get the active tab
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeTab?.messages]);

  // Resize handlers for side panels
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, panel: 'left' | 'right') => {
    e.preventDefault();
    resizingPanel.current = panel;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = panel === 'left' ? leftPanelWidth : rightPanelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftPanelWidth, rightPanelWidth]);

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

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (!inputValue && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [inputValue]);

  // Load MCP servers on startup
  useEffect(() => {
    const loadMcpConfig = async () => {
      try {
        const config = await window.electronAPI.mcp.getConfig();
        setMcpServers(config.mcpServers || {});
        console.log(
          "Loaded MCP servers:",
          Object.keys(config.mcpServers || {}),
        );
      } catch (error) {
        console.error("Failed to load MCP config:", error);
      }
    };
    loadMcpConfig();
  }, []);

  // Helper to update a specific tab
  const updateTab = useCallback((tabId: string, updates: Partial<TabState>) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab)),
    );
  }, []);

  // Set up IPC listeners
  useEffect(() => {
    const unsubscribeReady = window.electronAPI.copilot.onReady(
      async (data) => {
        console.log(
          "Copilot ready with sessions:",
          data.sessions.length,
          "previous:",
          data.previousSessions.length,
        );
        setStatus("connected");
        setAvailableModels(data.models);
        setPreviousSessions(data.previousSessions);

        // If no sessions exist, we need to create one (with trust check)
        if (data.sessions.length === 0) {
          // Check trust for current directory
          const cwd = await window.electronAPI.copilot.getCwd();
          const trustResult =
            await window.electronAPI.copilot.checkDirectoryTrust(cwd);
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
              currentIntent: null,
              currentIntentTimestamp: null,
              gitBranchRefresh: 0,
            };
            setTabs([newTab]);
            setActiveTabId(result.sessionId);
          } catch (error) {
            console.error("Failed to create initial session:", error);
            setStatus("error");
          }
          return;
        }

        // Create tabs for all resumed/created sessions
        const initialTabs: TabState[] = data.sessions.map((s, idx) => ({
          id: s.sessionId,
          name: s.name || `Session ${idx + 1}`,
          messages: [], // Will be loaded below
          model: s.model,
          cwd: s.cwd,
          isProcessing: false,
          activeTools: [],
          hasUnreadCompletion: false,
          pendingConfirmations: [],
          needsTitle: !s.name, // Only need title if no name provided
          alwaysAllowed: s.alwaysAllowed || [],
          editedFiles: s.editedFiles || [],
          currentIntent: null,
          currentIntentTimestamp: null,
          gitBranchRefresh: 0,
        }));

        // Update tab counter to avoid duplicate names
        setTabCounter(data.sessions.length);

        setTabs(initialTabs);
        setActiveTabId(data.sessions[0]?.sessionId || null);

        // Load message history for each session
        for (const s of data.sessions) {
          window.electronAPI.copilot
            .getMessages(s.sessionId)
            .then((messages) => {
              if (messages.length > 0) {
                setTabs((prev) =>
                  prev.map((tab) =>
                    tab.id === s.sessionId
                      ? {
                          ...tab,
                          messages: messages.map((m, i) => ({
                            id: `hist-${i}`,
                            ...m,
                            isStreaming: false,
                          })),
                          needsTitle: false,
                        }
                      : tab,
                  ),
                );
              }
            })
            .catch((err) =>
              console.error(`Failed to load history for ${s.sessionId}:`, err),
            );
        }
      },
    );

    // Also fetch models in case ready event was missed
    window.electronAPI.copilot
      .getModels()
      .then((data) => {
        console.log("Fetched models:", data);
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          setStatus("connected");
        }
      })
      .catch((err) =>
        console.log("getModels failed (SDK may still be initializing):", err),
      );

    const unsubscribeDelta = window.electronAPI.copilot.onDelta((data) => {
      const { sessionId, content } = data;
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;
          const last = tab.messages[tab.messages.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            return {
              ...tab,
              messages: [
                ...tab.messages.slice(0, -1),
                { ...last, content: last.content + content },
              ],
            };
          }
          return tab;
        }),
      );
    });

    const unsubscribeMessage = window.electronAPI.copilot.onMessage((data) => {
      const { sessionId, content } = data;
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;
          const last = tab.messages[tab.messages.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            return {
              ...tab,
              messages: [
                ...tab.messages.slice(0, -1),
                { ...last, content, isStreaming: false, timestamp: Date.now() },
              ],
            };
          }
          return {
            ...tab,
            messages: [
              ...tab.messages,
              {
                id: generateId(),
                role: "assistant",
                content,
                isStreaming: false,
                timestamp: Date.now(),
              },
            ],
          };
        }),
      );
    });

    const unsubscribeIdle = window.electronAPI.copilot.onIdle((data) => {
      const { sessionId } = data;

      // Play notification sound when session completes
      playNotificationSound();

      // First update tab state
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === sessionId);

        // Check for Ralph loop continuation
        if (tab?.ralphConfig?.active) {
          const lastMessage = tab.messages[tab.messages.length - 1];
          const hasCompletionPromise = lastMessage?.content?.includes(
            RALPH_COMPLETION_SIGNAL
          );
          const maxReached = tab.ralphConfig.currentIteration >= tab.ralphConfig.maxIterations;

          if (!hasCompletionPromise && !maxReached) {
            // Continue Ralph loop - re-send the same prompt
            const nextIteration = tab.ralphConfig.currentIteration + 1;
            console.log(`[Ralph] Iteration ${nextIteration}/${tab.ralphConfig.maxIterations}`);
            
            // Schedule the re-send after state update
            setTimeout(() => {
              window.electronAPI.copilot.send(sessionId, tab.ralphConfig!.originalPrompt);
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
            // Ralph loop complete - stop it
            console.log(`[Ralph] Loop complete. Reason: ${hasCompletionPromise ? 'completion promise found' : 'max iterations reached'}`);
          }
        }

        // If tab needs a title and has messages, trigger title generation
        if (tab?.needsTitle && tab.messages.length > 0) {
          // Build conversation summary for title generation
          const conversation = tab.messages
            .filter((m) => m.content.trim())
            .slice(0, 4) // First few messages only
            .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
            .join("\n");

          // Generate title async (don't await here)
          window.electronAPI.copilot
            .generateTitle(conversation)
            .then((title) => {
              setTabs((p) =>
                p.map((t) =>
                  t.id === sessionId
                    ? { ...t, name: title, needsTitle: false }
                    : t,
                ),
              );
            })
            .catch((err) => {
              console.error("Failed to generate title:", err);
              // Fall back to truncated first message
              const firstUserMsg = tab.messages.find(
                (m) => m.role === "user",
              )?.content;
              if (firstUserMsg) {
                const fallback =
                  firstUserMsg.slice(0, 30) +
                  (firstUserMsg.length > 30 ? "..." : "");
                setTabs((p) =>
                  p.map((t) =>
                    t.id === sessionId
                      ? { ...t, name: fallback, needsTitle: false }
                      : t,
                  ),
                );
              }
            });
        }

        return prev.map((tab) => {
          if (tab.id !== sessionId) return tab;
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
            // Mark as unread if this tab is not currently active
            hasUnreadCompletion: tab.id !== activeTabIdRef.current,
            messages: tab.messages
              .filter((msg) => msg.content.trim() || msg.role === "user")
              .map((msg) =>
                msg.isStreaming ? { ...msg, isStreaming: false } : msg,
              ),
          };
        });
      });
    });

    const unsubscribeToolStart = window.electronAPI.copilot.onToolStart(
      (data) => {
        const { sessionId, toolCallId, toolName, input } = data;
        const name = toolName || "unknown";
        const id = toolCallId || generateId();

        console.log(
          `[Tool Start] ${name}: toolCallId=${toolCallId}, id=${id}, input=`,
          input,
        );

        // Capture intent from report_intent tool
        if (name === "report_intent") {
          const intent = input?.intent as string | undefined;
          if (intent) {
            setTabs((prev) =>
              prev.map((tab) =>
                tab.id === sessionId ? { ...tab, currentIntent: intent, currentIntentTimestamp: Date.now() } : tab,
              ),
            );
          }
          return;
        }

        // Skip other internal tools
        if (name === "update_todo") return;

        // Track edited/created files at start time (we have reliable input here)
        const isFileOperation = name === "edit" || name === "create";

        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.id !== sessionId) return tab;

            // Track edited/created files at start time (we have reliable input here)
            let newEditedFiles = tab.editedFiles;
            if (isFileOperation && input) {
              const path = input.path as string | undefined;
              if (path && !tab.editedFiles.includes(path)) {
                newEditedFiles = [...tab.editedFiles, path];
                console.log(
                  `[Tool Start] Added to editedFiles:`,
                  newEditedFiles,
                );
              }
            }

            return {
              ...tab,
              editedFiles: newEditedFiles,
              activeTools: [
                ...tab.activeTools,
                { toolCallId: id, toolName: name, status: "running", input },
              ],
            };
          }),
        );
      },
    );

    const unsubscribeToolEnd = window.electronAPI.copilot.onToolEnd((data) => {
      const { sessionId, toolCallId, toolName, input, output } = data;
      const name = toolName || "unknown";

      console.log(`[Tool End] ${name}:`, {
        toolCallId,
        input,
        hasInput: !!input,
      });

      // Skip internal tools
      if (name === "report_intent" || name === "update_todo") return;

      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;

          // Get the tool's input from activeTools (more reliable than event data)
          const activeTool = tab.activeTools.find(
            (t) => t.toolCallId === toolCallId,
          );
          const toolInput = input || activeTool?.input;

          return {
            ...tab,
            activeTools: tab.activeTools.map((t) =>
              t.toolCallId === toolCallId
                ? {
                    ...t,
                    status: "done" as const,
                    input: toolInput || t.input,
                    output,
                  }
                : t,
            ),
          };
        }),
      );
    });

    // Listen for permission requests
    const unsubscribePermission = window.electronAPI.copilot.onPermission(
      (data) => {
        // Play notification sound when permission is needed
        playNotificationSound();

        console.log(
          "Permission requested (full data):",
          JSON.stringify(data, null, 2),
        );
        const sessionId = data.sessionId as string;
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
                  pendingConfirmations: [
                    ...tab.pendingConfirmations,
                    confirmation,
                  ],
                }
              : tab,
          ),
        );
      },
    );

    const unsubscribeError = window.electronAPI.copilot.onError((data) => {
      const { sessionId, message } = data;
      console.error("Copilot error:", message);

      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== sessionId) return tab;
          const newMessages = !message.includes("invalid_request_body")
            ? [
                ...tab.messages,
                {
                  id: generateId(),
                  role: "assistant" as const,
                  content: `⚠️ ${message}`,
                  timestamp: Date.now(),
                },
              ]
            : tab.messages;
          return { ...tab, isProcessing: false, messages: newMessages };
        }),
      );
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
    };
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() && !terminalAttachment) return;
    if (!activeTab || activeTab.isProcessing) return;

    // Build message content with terminal attachment if present
    let messageContent = inputValue.trim();
    if (terminalAttachment) {
      const terminalBlock = `\`\`\`\n${terminalAttachment.output}\n\`\`\``;
      messageContent = messageContent 
        ? `${messageContent}\n\nTerminal output:\n${terminalBlock}`
        : `Terminal output:\n${terminalBlock}`;
    }

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: messageContent,
    };

    const tabId = activeTab.id;

    // Set up Ralph config if enabled - auto-inject completion instruction
    const ralphConfig: RalphConfig | undefined = ralphEnabled
      ? {
          originalPrompt: userMessage.content,
          maxIterations: ralphMaxIterations,
          currentIteration: 1,
          active: true,
        }
      : undefined;
    
    // If Ralph is enabled, append completion instruction to the prompt
    const promptToSend = ralphEnabled
      ? `${userMessage.content}\n\nWhen you have fully completed this task, output exactly: ${RALPH_COMPLETION_SIGNAL}`
      : userMessage.content;

    updateTab(tabId, {
      messages: [
        ...activeTab.messages,
        userMessage,
        {
          id: generateId(),
          role: "assistant",
          content: "",
          isStreaming: true,
          timestamp: Date.now(),
        },
      ],
      isProcessing: true,
      activeTools: [],
      ralphConfig,
    });
    setInputValue("");
    setTerminalAttachment(null);
    
    // Reset Ralph UI state after sending
    if (ralphEnabled) {
      setRalphEnabled(false);
      setShowRalphSettings(false);
    }

    try {
      await window.electronAPI.copilot.send(tabId, promptToSend);
    } catch (error) {
      console.error("Send error:", error);
      updateTab(tabId, { isProcessing: false, ralphConfig: undefined });
    }
  }, [inputValue, activeTab, updateTab, ralphEnabled, ralphMaxIterations, terminalAttachment]);

  // Handle sending terminal output to the agent
  const handleSendTerminalOutput = useCallback((output: string, lineCount: number) => {
    if (!output.trim()) return;
    // Store the terminal output as an attachment to be included in next message
    setTerminalAttachment({ output: output.trim(), lineCount });
    // Focus the input field
    inputRef.current?.focus();
  }, []);

  const handleStop = useCallback(() => {
    if (!activeTab) return;
    window.electronAPI.copilot.abort(activeTab.id);
    // Also stop Ralph loop if active
    updateTab(activeTab.id, { 
      isProcessing: false,
      ralphConfig: activeTab.ralphConfig 
        ? { ...activeTab.ralphConfig, active: false }
        : undefined,
    });
  }, [activeTab, updateTab]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const handleConfirmation = async (
    decision: "approved" | "always" | "denied",
  ) => {
    // Get the first pending confirmation from the queue
    const pendingConfirmation = activeTab?.pendingConfirmations?.[0];
    if (!pendingConfirmation || !activeTab) return;

    try {
      await window.electronAPI.copilot.respondPermission({
        requestId: pendingConfirmation.requestId,
        decision,
      });

      // Remove this confirmation from the queue
      const remainingConfirmations = activeTab.pendingConfirmations.slice(1);

      // If "always" was selected, update the local alwaysAllowed list
      if (decision === "always" && pendingConfirmation.executable) {
        // Split comma-separated executables into individual entries
        const newExecutables = pendingConfirmation.executable
          .split(", ")
          .filter((e) => e.trim());
        updateTab(activeTab.id, {
          pendingConfirmations: remainingConfirmations,
          alwaysAllowed: [...activeTab.alwaysAllowed, ...newExecutables],
        });
        return;
      }
      updateTab(activeTab.id, { pendingConfirmations: remainingConfirmations });
    } catch (error) {
      console.error("Permission response failed:", error);
      // Still remove from queue on error to avoid being stuck
      updateTab(activeTab.id, {
        pendingConfirmations: activeTab.pendingConfirmations.slice(1),
      });
    }
  };

  const handleRemoveAlwaysAllowed = async (executable: string) => {
    if (!activeTab) return;
    try {
      await window.electronAPI.copilot.removeAlwaysAllowed(
        activeTab.id,
        executable,
      );
      updateTab(activeTab.id, {
        alwaysAllowed: activeTab.alwaysAllowed.filter((e) => e !== executable),
      });
    } catch (error) {
      console.error("Failed to remove always-allowed:", error);
    }
  };

  const refreshAlwaysAllowed = async () => {
    if (!activeTab) return;
    try {
      const list = await window.electronAPI.copilot.getAlwaysAllowed(
        activeTab.id,
      );
      updateTab(activeTab.id, { alwaysAllowed: list });
    } catch (error) {
      console.error("Failed to fetch always-allowed:", error);
    }
  };

  const handleAddAlwaysAllowed = async () => {
    if (!activeTab || !addCommandValue.trim()) return;
    try {
      await window.electronAPI.copilot.addAlwaysAllowed(
        activeTab.id,
        addCommandValue.trim(),
      );
      updateTab(activeTab.id, {
        alwaysAllowed: [...activeTab.alwaysAllowed, addCommandValue.trim()],
      });
      setAddCommandValue("");
      setShowAddCommand(false);
    } catch (error) {
      console.error("Failed to add always-allowed:", error);
    }
  };

  // MCP Server handlers
  const openAddMcpModal = () => {
    setEditingMcpServer(null);
    setMcpFormData({
      name: "",
      type: "local",
      command: "",
      args: "",
      url: "",
      tools: "*",
    });
    setShowMcpModal(true);
  };

  const openEditMcpModal = (name: string, server: MCPServerConfig) => {
    setEditingMcpServer({ name, server });
    const isLocal =
      !server.type || server.type === "local" || server.type === "stdio";
    setMcpFormData({
      name,
      type: isLocal ? "local" : (server.type as "http" | "sse"),
      command: isLocal ? (server as MCPLocalServerConfig).command : "",
      args: isLocal ? (server as MCPLocalServerConfig).args.join(" ") : "",
      url: !isLocal ? (server as MCPRemoteServerConfig).url : "",
      tools: server.tools[0] === "*" ? "*" : server.tools.join(", "),
    });
    setShowMcpModal(true);
  };

  const handleSaveMcpServer = async () => {
    const { name, type, command, args, url, tools } = mcpFormData;
    if (!name.trim()) return;

    const toolsArray =
      tools === "*"
        ? ["*"]
        : tools
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

    let serverConfig: MCPServerConfig;
    if (type === "local") {
      serverConfig = {
        type: "local",
        command: command.trim(),
        args: args.split(" ").filter((a) => a.trim()),
        tools: toolsArray,
      };
    } else {
      serverConfig = {
        type: type as "http" | "sse",
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
      console.error("Failed to save MCP server:", error);
    }
  };

  const handleDeleteMcpServer = async (name: string) => {
    try {
      await window.electronAPI.mcp.deleteServer(name);
      const config = await window.electronAPI.mcp.getConfig();
      setMcpServers(config.mcpServers || {});
    } catch (error) {
      console.error("Failed to delete MCP server:", error);
    }
  };

  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  const handleOpenCommitModal = async () => {
    if (!activeTab) return;

    setCommitError(null);
    setIsCommitting(false);
    setCommitMessage("Checking files...");
    setIsGeneratingMessage(true);
    setShowCommitModal(true);

    try {
      // Get ALL changed files in the repo, not just the ones we tracked
      const changedResult = await window.electronAPI.git.getChangedFiles(
        activeTab.cwd,
        activeTab.editedFiles,
        true, // includeAll: get all changed files, including package-lock.json etc.
      );
      
      const actualChangedFiles = changedResult.success ? changedResult.files : activeTab.editedFiles;
      
      // Update the tab's editedFiles list with all changed files
      if (changedResult.success) {
        updateTab(activeTab.id, { editedFiles: actualChangedFiles });
      }
      
      // If no files have changes, show error and close
      if (actualChangedFiles.length === 0) {
        setCommitMessage("");
        setCommitError("No files have changes to commit");
        setIsGeneratingMessage(false);
        return;
      }

      // Get diff for actual changed files
      setCommitMessage("Generating commit message...");
      const diffResult = await window.electronAPI.git.getDiff(
        activeTab.cwd,
        actualChangedFiles,
      );
      if (diffResult.success && diffResult.diff) {
        // Generate AI commit message from diff
        const message = await window.electronAPI.git.generateCommitMessage(
          diffResult.diff,
        );
        setCommitMessage(message);
      } else {
        // Fallback to simple message
        const fileNames = actualChangedFiles
          .map((f) => f.split("/").pop())
          .join(", ");
        setCommitMessage(`Update ${fileNames}`);
      }
    } catch (error) {
      console.error("Failed to generate commit message:", error);
      const fileNames = activeTab.editedFiles
        .map((f) => f.split("/").pop())
        .join(", ");
      setCommitMessage(`Update ${fileNames}`);
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  const handleCommitAndPush = async () => {
    if (!activeTab || !commitMessage.trim()) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      // First commit and push
      const result = await window.electronAPI.git.commitAndPush(
        activeTab.cwd,
        activeTab.editedFiles,
        commitMessage.trim(),
        commitAction === 'merge',
      );

      if (result.success) {
        // If merge synced with main and brought in changes, notify user to test first
        if (result.mainSyncedWithChanges && commitAction === 'merge') {
          setPendingMergeInfo({ incomingFiles: result.incomingFiles || [] });
          // Clear the edited files list and refresh git branch widget (commit was successful)
          updateTab(activeTab.id, { 
            editedFiles: [],
            gitBranchRefresh: (activeTab.gitBranchRefresh || 0) + 1
          });
          setShowCommitModal(false);
          setCommitMessage('');
          setIsCommitting(false);
          return;
        }
        
        // If creating PR, do that after commit
        if (commitAction === 'pr') {
          const prResult = await window.electronAPI.git.createPullRequest(activeTab.cwd, commitMessage.split('\n')[0]);
          if (prResult.success && prResult.prUrl) {
            window.open(prResult.prUrl, '_blank');
          } else if (!prResult.success) {
            setCommitError(prResult.error || 'Failed to create PR');
            setIsCommitting(false);
            return;
          }
        }
        
        // If merge was selected and removeWorktreeAfterMerge is checked, remove the worktree and close session
        const isWorktreePath = activeTab.cwd.includes('.copilot-sessions')
        if (commitAction === 'merge' && removeWorktreeAfterMerge && isWorktreePath) {
          // Find the worktree session by path
          const sessionId = activeTab.cwd.split('/').pop() || ''
          if (sessionId) {
            await window.electronAPI.worktree.removeSession({ sessionId, force: true })
            // Close this tab
            handleCloseTab(activeTab.id)
            setShowCommitModal(false)
            setCommitMessage('')
            setCommitAction('push')
            setRemoveWorktreeAfterMerge(false)
            setIsCommitting(false)
            return
          }
        }
        
        // Clear the edited files list and refresh git branch widget
        updateTab(activeTab.id, { 
          editedFiles: [],
          gitBranchRefresh: (activeTab.gitBranchRefresh || 0) + 1
        })
        setShowCommitModal(false)
        setCommitMessage('')
        setCommitAction('push')
        setRemoveWorktreeAfterMerge(false)
      } else {
        setCommitError(result.error || "Commit failed");
      }
    } catch (error) {
      setCommitError(String(error));
    } finally {
      setIsCommitting(false);
    }
  };

  const handleNewTab = async () => {
    // Always show folder picker when creating a new session
    try {
      const folderResult = await window.electronAPI.copilot.pickFolder();
      if (folderResult.canceled || !folderResult.path) {
        return; // User cancelled folder selection
      }

      // Check trust for the selected directory
      const trustResult = await window.electronAPI.copilot.checkDirectoryTrust(
        folderResult.path,
      );
      if (!trustResult.trusted) {
        return; // User declined to trust, don't create session
      }

      setStatus("connecting");
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
        currentIntent: null,
        currentIntentTimestamp: null,
        gitBranchRefresh: 0,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(result.sessionId);
      setStatus("connected");
    } catch (error) {
      console.error("Failed to create new tab:", error);
      setStatus("connected");
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
      console.error("Failed to pick folder for worktree:", error);
    }
  };

  // Handle when worktree session is created
  const handleWorktreeSessionCreated = async (
    worktreePath: string,
    branch: string,
    autoStart?: { issueInfo: { url: string; title: string; body: string | null } }
  ) => {
    try {
      // Check trust for the worktree directory
      const trustResult = await window.electronAPI.copilot.checkDirectoryTrust(worktreePath);
      if (!trustResult.trusted) {
        // User declined trust - remove the worktree we just created
        const sessionId = worktreePath.split('/').pop() || '';
        await window.electronAPI.worktree.removeSession({ sessionId, force: true });
        return;
      }

      setStatus("connecting");
      const result = await window.electronAPI.copilot.createSession({
        cwd: worktreePath,
      });

      // If autoStart is enabled, pre-approve GitHub web fetches and file writes
      const preApprovedCommands = autoStart
        ? ['write', 'url:github.com']
        : [];
      
      // Add pre-approved commands to the session
      if (autoStart) {
        for (const cmd of preApprovedCommands) {
          await window.electronAPI.copilot.addAlwaysAllowed(result.sessionId, cmd);
        }
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
        currentIntent: null,
        currentIntentTimestamp: null,
        gitBranchRefresh: 0,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(result.sessionId);
      setStatus("connected");

      // If autoStart is enabled, send the initial prompt with issue context
      if (autoStart) {
        const issueContext = autoStart.issueInfo.body
          ? `## Issue Description\n\n${autoStart.issueInfo.body}`
          : '';
        
        const initialPrompt = `Please implement the following GitHub issue:

**Issue URL:** ${autoStart.issueInfo.url}
**Title:** ${autoStart.issueInfo.title}

${issueContext}

Start by exploring the codebase to understand the current implementation, then make the necessary changes to address this issue.`;

        const userMessage: Message = {
          id: generateId(),
          role: "user",
          content: initialPrompt,
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
                      role: "assistant",
                      content: "",
                      isStreaming: true,
                    },
                  ],
                  isProcessing: true,
                }
              : tab
          )
        );

        // Send the prompt
        try {
          await window.electronAPI.copilot.send(result.sessionId, initialPrompt);
        } catch (error) {
          console.error("Failed to send initial prompt:", error);
          setTabs((prev) =>
            prev.map((tab) =>
              tab.id === result.sessionId
                ? { ...tab, isProcessing: false }
                : tab
            )
          );
        }
      }
    } catch (error) {
      console.error("Failed to create worktree session tab:", error);
      setStatus("connected");
    }
  };

  // Handle opening an existing worktree session
  const handleOpenWorktreeSession = async (session: { worktreePath: string; branch: string }) => {
    // Check if this worktree is already open in an existing tab
    const existingTab = tabs.find(tab => tab.cwd === session.worktreePath);
    if (existingTab) {
      // Switch to the existing tab instead of opening a new one
      setActiveTabId(existingTab.id);
      setShowWorktreeList(false);
      return;
    }
    
    setShowWorktreeList(false);
    await handleWorktreeSessionCreated(session.worktreePath, session.branch);
  };

  const handleCloseTab = async (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // If closing the last tab, delete it and create a new one
    if (tabs.length === 1) {
      try {
        setStatus("connecting");
        await window.electronAPI.copilot.closeSession(tabId);
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
          currentIntent: null,
          currentIntentTimestamp: null,
          gitBranchRefresh: 0,
        };
        setTabs([newTab]);
        setActiveTabId(result.sessionId);
        setStatus("connected");
      } catch (error) {
        console.error("Failed to replace tab:", error);
        setStatus("connected");
      }
      return;
    }

    try {
      await window.electronAPI.copilot.closeSession(tabId);

      // If closing the active tab, switch to another one
      if (activeTabId === tabId) {
        const currentIndex = tabs.findIndex((t) => t.id === tabId);
        const newActiveTab = tabs[currentIndex - 1] || tabs[currentIndex + 1];
        setActiveTabId(newActiveTab?.id || null);
      }

      setTabs((prev) => prev.filter((t) => t.id !== tabId));
    } catch (error) {
      console.error("Failed to close tab:", error);
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
      console.error("Failed to switch session:", error);
    }
  };

  const handleResumePreviousSession = async (prevSession: PreviousSession) => {
    try {
      setStatus("connecting");
      const result = await window.electronAPI.copilot.resumePreviousSession(
        prevSession.sessionId,
        prevSession.cwd,
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
        currentIntent: null,
        currentIntentTimestamp: null,
        gitBranchRefresh: 0,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(result.sessionId);

      // Remove from previous sessions list
      setPreviousSessions((prev) =>
        prev.filter((s) => s.sessionId !== prevSession.sessionId),
      );

      // Load message history
      window.electronAPI.copilot
        .getMessages(result.sessionId)
        .then((messages) => {
          if (messages.length > 0) {
            setTabs((prev) =>
              prev.map((tab) =>
                tab.id === result.sessionId
                  ? {
                      ...tab,
                      messages: messages.map((m, i) => ({
                        id: `hist-${i}`,
                        ...m,
                        isStreaming: false,
                      })),
                      needsTitle: false,
                    }
                  : tab,
              ),
            );
          }
        })
        .catch((err) =>
          console.error(`Failed to load history for ${result.sessionId}:`, err),
        );

      setStatus("connected");
    } catch (error) {
      console.error("Failed to resume previous session:", error);
      setStatus("connected");
    }
  };

  const handleModelChange = async (model: string) => {
    if (!activeTab || model === activeTab.model) {
      return;
    }

    setStatus("connecting");

    try {
      // If current tab has messages, create a new tab with the new model instead of replacing
      if (activeTab.messages.length > 0) {
        const result = await window.electronAPI.copilot.createSession();
        // Now change the model on the new session
        const modelResult = await window.electronAPI.copilot.setModel(
          result.sessionId,
          model,
        );

        const newTab: TabState = {
          id: modelResult.sessionId,
          name: generateTabName(),
          messages: [],
          model: modelResult.model,
          cwd: modelResult.cwd || result.cwd,
          isProcessing: false,
          activeTools: [],
          hasUnreadCompletion: false,
          pendingConfirmations: [],
          needsTitle: true,
          alwaysAllowed: [],
          editedFiles: [],
          currentIntent: null,
          currentIntentTimestamp: null,
          gitBranchRefresh: 0,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(modelResult.sessionId);
        setStatus("connected");
        return;
      }

      // Empty tab - replace the session with the new model
      const result = await window.electronAPI.copilot.setModel(
        activeTab.id,
        model,
      );
      // Update the tab with new session ID and model, clear messages
      setTabs((prev) => {
        const updated = prev.filter((t) => t.id !== activeTab.id);
        return [
          ...updated,
          {
            id: result.sessionId,
            name: activeTab.name,
            messages: [],
            model: result.model,
            cwd: result.cwd || activeTab.cwd,
            isProcessing: false,
            activeTools: [],
            hasUnreadCompletion: false,
            pendingConfirmations: [],
            needsTitle: true,
            alwaysAllowed: [],
            editedFiles: [],
            currentIntent: null,
            currentIntentTimestamp: null,
            gitBranchRefresh: 0,
          },
        ];
      });
      setActiveTabId(result.sessionId);
      setStatus("connected");
    } catch (error) {
      console.error("Failed to change model:", error);
      setStatus("connected");
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-copilot-bg rounded-xl">
      {/* Title Bar */}
      <div className="drag-region flex items-center justify-between px-4 py-2.5 bg-copilot-surface border-b border-copilot-border shrink-0">
        <div className="flex items-center gap-3">
          <WindowControls />

          <div className="flex items-center gap-2 ml-2">
            <img
              src={logo}
              alt="Copilot Skins"
              className="w-4 h-4 rounded-sm"
            />
            <span className="text-copilot-text text-sm font-medium">
              Copilot Skins
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 no-drag">
          {/* Model Selector */}
          <Dropdown
            value={activeTab?.model || null}
            options={availableModels.map((model) => ({
              id: model.id,
              label: model.name,
              rightContent: (
                <span
                  className={`ml-2 ${
                    model.multiplier === 0
                      ? "text-copilot-success"
                      : model.multiplier < 1
                        ? "text-copilot-success"
                        : model.multiplier > 1
                          ? "text-copilot-warning"
                          : "text-copilot-text-muted"
                  }`}
                >
                  {model.multiplier === 0 ? "free" : `${model.multiplier}×`}
                </span>
              ),
            }))}
            onSelect={handleModelChange}
            placeholder="Loading..."
            title="Model"
            minWidth="240px"
          />

          {/* Theme Selector */}
          <Dropdown
            value={themePreference}
            options={[
              {
                id: "system",
                label: "System",
                icon: <MonitorIcon size={12} />,
              },
              ...availableThemes.map((theme) => ({
                id: theme.id,
                label: theme.name,
                icon:
                  theme.type === "dark" ? (
                    <MoonIcon size={12} />
                  ) : (
                    <SunIcon size={12} />
                  ),
                rightContent: theme.author && (
                  <span className="ml-auto text-copilot-text-muted text-[10px]">
                    by {theme.author}
                  </span>
                ),
              })),
            ]}
            onSelect={(id) => setTheme(id)}
            trigger={
              <>
                {activeTheme.type === "dark" ? (
                  <MoonIcon size={12} />
                ) : (
                  <SunIcon size={12} />
                )}
                <span>
                  {themePreference === "system" ? "System" : activeTheme.name}
                </span>
                <ChevronDownIcon size={10} />
              </>
            }
            title="Theme"
            minWidth="180px"
            dividers={[0]}
            footerActions={
              <button
                onClick={async () => {
                  const result = await importTheme();
                  if (result.error) {
                    console.error("Failed to import theme:", result.error);
                  }
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface-hover transition-colors flex items-center gap-2"
              >
                <UploadIcon size={12} />
                <span>Import Theme...</span>
              </button>
            }
          />
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Vertical Tabs */}
        <div 
          className="bg-copilot-bg border-r border-copilot-border flex flex-col shrink-0"
          style={{ width: leftPanelWidth }}
        >
          {/* New Tab Button */}
          <button
            onClick={() => handleNewTab()}
            className="flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors border-b border-copilot-border"
          >
            <PlusIcon size={12} />
            New Session
          </button>
          
          {/* Worktree Session Buttons */}
          <div className="flex border-b border-copilot-border">
            <button
              onClick={() => handleNewWorktreeSession()}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
              title="Create isolated worktree session"
            >
              <PlusIcon size={10} />
              Worktree
            </button>
            <button
              onClick={() => setShowWorktreeList(true)}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors border-l border-copilot-border"
              title="View all worktree sessions"
            >
              <FolderIcon size={10} />
              List
            </button>
          </div>

          {/* Open Tabs */}
          <div className="flex-1 overflow-y-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => handleSwitchTab(tab.id)}
                className={`group w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left cursor-pointer ${
                  tab.id === activeTabId
                    ? "bg-copilot-surface text-copilot-text border-l-2 border-l-copilot-accent"
                    : "text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface border-l-2 border-l-transparent"
                }`}
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
                {tab.isRenaming ? (
                  <input
                    autoFocus
                    value={tab.renameDraft ?? tab.name}
                    onChange={(e) =>
                      setTabs((prev) =>
                        prev.map((t) =>
                          t.id === tab.id
                            ? { ...t, renameDraft: e.target.value }
                            : t,
                        ),
                      )
                    }
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onKeyUp={async (e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setTabs((prev) =>
                          prev.map((t) =>
                            t.id === tab.id
                              ? {
                                  ...t,
                                  isRenaming: false,
                                  renameDraft: undefined,
                                }
                              : t,
                          ),
                        );
                        return;
                      }
                      if (e.key === "Enter") {
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
                              : t,
                          ),
                        );
                        try {
                          await window.electronAPI.copilot.renameSession(
                            tab.id,
                            finalName,
                          );
                        } catch (err) {
                          console.error("Failed to rename session:", err);
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
                            : t,
                        ),
                      );
                      try {
                        await window.electronAPI.copilot.renameSession(
                          tab.id,
                          finalName,
                        );
                      } catch (err) {
                        console.error("Failed to rename session:", err);
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
                          t.id === tab.id
                            ? { ...t, isRenaming: true, renameDraft: t.name }
                            : t,
                        ),
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

          {/* Previous Sessions Expander */}
          {previousSessions.length > 0 && (
            <div className="border-t border-copilot-border">
              <button
                onClick={() => setShowPreviousSessions(!showPreviousSessions)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
              >
                <ChevronRightIcon
                  size={10}
                  className={`transition-transform ${showPreviousSessions ? "rotate-90" : ""}`}
                />
                <span>Previous ({previousSessions.length})</span>
              </button>

              {showPreviousSessions && (
                <div className="max-h-48 overflow-y-auto">
                  {previousSessions.slice(0, 50).map((prevSession) => (
                    <button
                      key={prevSession.sessionId}
                      onClick={() => handleResumePreviousSession(prevSession)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors text-left border-l-2 border-l-transparent"
                    >
                      <ClockIcon
                        size={10}
                        className="shrink-0 opacity-50"
                        strokeWidth={1.5}
                      />
                      <span className="flex-1 truncate">
                        {prevSession.name ||
                          prevSession.sessionId.slice(0, 12) + "..."}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Build Info */}
          <div className="border-t border-copilot-border px-3 py-2 text-[10px] text-copilot-text-muted">
            <div className="flex items-center gap-1" title={`Build: ${buildInfo.version}\nBranch: ${buildInfo.gitBranch}\nCommit: ${buildInfo.gitSha}\nBuilt: ${buildInfo.buildDate} ${buildInfo.buildTime}`}>
              <span className="opacity-60">v{buildInfo.baseVersion}</span>
              <span className="opacity-40">•</span>
              <span className="opacity-60 truncate">{buildInfo.gitBranch === 'main' ? buildInfo.gitSha : buildInfo.gitBranch}</span>
            </div>
          </div>
        </div>

        {/* Left Resize Handle */}
        <div
          className="w-1 hover:w-1.5 bg-transparent hover:bg-copilot-accent/50 cursor-col-resize shrink-0 transition-all"
          onMouseDown={(e) => handleResizeMouseDown(e, 'left')}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Terminal Toggle Button */}
          {activeTab && (
            <button
              onClick={() => setTerminalOpenForSession(
                terminalOpenForSession === activeTab.id ? null : activeTab.id
              )}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 text-xs border-b border-copilot-border transition-colors ${
                terminalOpenForSession === activeTab.id
                  ? "text-copilot-accent bg-copilot-surface" 
                  : "text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface"
              }`}
            >
              <TerminalIcon size={14} />
              <span className="font-medium">Terminal</span>
              <ChevronDownIcon
                size={12}
                className={`transition-transform ${terminalOpenForSession === activeTab.id ? "rotate-180" : ""}`}
              />
            </button>
          )}

          {/* Embedded Terminal Panel */}
          {activeTab && (
            <TerminalPanel
              sessionId={activeTab.id}
              cwd={activeTab.cwd}
              isOpen={terminalOpenForSession === activeTab.id}
              onClose={() => setTerminalOpenForSession(null)}
              onSendToAgent={handleSendTerminalOutput}
            />
          )}

          {/* Messages Area - Conversation Only */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
            {activeTab?.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-full text-center -m-4 p-4">
                <img
                  src={logo}
                  alt="Copilot Skins"
                  className="w-16 h-16 mb-4"
                />
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
                .filter((m) => m.role !== "system")
                .filter((m) => m.role === "user" || m.content.trim());
              
              // Find the last assistant message index
              let lastAssistantIndex = -1;
              for (let i = filteredMessages.length - 1; i >= 0; i--) {
                if (filteredMessages[i].role === "assistant") {
                  lastAssistantIndex = i;
                  break;
                }
              }
              
              return filteredMessages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2.5 overflow-hidden ${
                      message.role === "user"
                        ? "bg-copilot-success text-copilot-text-inverse"
                        : "bg-copilot-surface text-copilot-text"
                    }`}
                  >
                    <div className="text-sm break-words overflow-hidden">
                      {message.role === "user" ? (
                        <span className="whitespace-pre-wrap break-words">
                          {message.content}
                        </span>
                      ) : message.content ? (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0">{children}</p>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-semibold text-copilot-text">
                                {children}
                              </strong>
                            ),
                            em: ({ children }) => (
                              <em className="italic">{children}</em>
                            ),
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
                            li: ({ children }) => (
                              <li className="ml-2">{children}</li>
                            ),
                            code: ({ children, className }) => {
                              const isBlock = className?.includes("language-");
                              return isBlock ? (
                                <pre className="bg-copilot-bg rounded p-2 my-2 overflow-x-auto text-xs max-w-full">
                                  <code className="text-copilot-text">
                                    {children}
                                  </code>
                                </pre>
                              ) : (
                                <code className="bg-copilot-bg px-1 py-0.5 rounded text-copilot-warning text-xs break-all">
                                  {children}
                                </code>
                              );
                            },
                            pre: ({ children }) => (
                              <div className="overflow-x-auto max-w-full">
                                {children}
                              </div>
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
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      ) : null}
                      {message.isStreaming && message.content && (
                        <span className="inline-block w-2 h-4 ml-1 bg-copilot-accent animate-pulse rounded-sm" />
                      )}
                    </div>
                  </div>
                  {/* Show timestamp for the last assistant message */}
                  {index === lastAssistantIndex && message.timestamp && (
                    <span className="text-[10px] text-copilot-text-muted mt-1 ml-1">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              ));
            })()}

            {/* Thinking indicator when processing but no streaming content yet */}
            {activeTab?.isProcessing &&
              !activeTab?.messages.some((m) => m.isStreaming && m.content) && (
                <div className="flex flex-col items-start">
                  <div className="bg-copilot-surface text-copilot-text rounded-lg px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      <Spinner size="sm" />
                      <span className="text-copilot-text-muted">
                        {activeTab?.currentIntent || "Thinking..."}
                      </span>
                    </div>
                  </div>
                  {(() => {
                    // Show intent timestamp if available, otherwise fall back to streaming message timestamp
                    const timestamp = activeTab?.currentIntentTimestamp || activeTab?.messages.find((m) => m.isStreaming)?.timestamp;
                    return timestamp ? (
                      <span className="text-[10px] text-copilot-text-muted mt-1 ml-1">
                        {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : null;
                  })()}
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
                <div className="shrink-0 mx-3 mb-2 p-4 bg-copilot-surface rounded-lg border border-copilot-warning">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-copilot-warning text-lg">⚠️</span>
                    <span className="text-copilot-text text-sm font-medium">
                      {pendingConfirmation.isOutOfScope ? (
                        <>Allow reading outside workspace?</>
                      ) : pendingConfirmation.kind === "write" ? (
                        <>Allow file changes?</>
                      ) : pendingConfirmation.kind === "shell" ? (
                        <>
                          Allow{" "}
                          <strong>
                            {pendingConfirmation.executable || "command"}
                          </strong>
                          ?
                        </>
                      ) : pendingConfirmation.kind === "url" ? (
                        <>
                          Allow <strong>URL access</strong>?
                        </>
                      ) : pendingConfirmation.kind === "mcp" ? (
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
                  {pendingConfirmation.kind === "mcp" &&
                    (pendingConfirmation.toolTitle ||
                      pendingConfirmation.toolName ||
                      pendingConfirmation.serverName) && (
                      <div
                        className="text-xs text-copilot-accent mb-2 font-mono truncate"
                        title={`${pendingConfirmation.serverName || ""} ${pendingConfirmation.toolName || ""}`.trim()}
                      >
                        🔌{" "}
                        {pendingConfirmation.toolTitle ||
                          pendingConfirmation.toolName ||
                          "MCP tool"}
                        {pendingConfirmation.serverName
                          ? ` @${pendingConfirmation.serverName}`
                          : ""}
                      </div>
                    )}
                  {pendingConfirmation.kind === "url" &&
                    pendingConfirmation.url && (
                      <div
                        className="text-xs text-copilot-accent mb-2 font-mono truncate"
                        title={pendingConfirmation.url}
                      >
                        🌐 {pendingConfirmation.url}
                      </div>
                    )}
                  {pendingConfirmation.path &&
                    pendingConfirmation.kind !== "write" && (
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
                  <div className="flex gap-2 mt-3">
                    {pendingConfirmation.isOutOfScope ? (
                      <>
                        <button
                          onClick={() => handleConfirmation("approved")}
                          className="flex-1 px-3 py-2 rounded bg-copilot-success hover:brightness-110 text-copilot-text-inverse text-sm font-medium transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => handleConfirmation("denied")}
                          className="flex-1 px-3 py-2 rounded bg-copilot-surface hover:bg-copilot-surface-hover text-copilot-error text-sm font-medium border border-copilot-border transition-colors"
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleConfirmation("approved")}
                          className="px-4 py-2 rounded bg-copilot-success hover:brightness-110 text-copilot-text-inverse text-sm font-medium transition-colors"
                        >
                          Once
                        </button>
                        <button
                          onClick={() => handleConfirmation("always")}
                          className="px-4 py-2 rounded bg-copilot-surface hover:bg-copilot-surface-hover text-copilot-text text-sm font-medium border border-copilot-border transition-colors"
                        >
                          Always
                        </button>
                        <button
                          onClick={() => handleConfirmation("denied")}
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
            {/* Ralph Settings Panel */}
            {showRalphSettings && !activeTab?.isProcessing && (
              <div className="mb-2 p-3 bg-copilot-bg rounded-lg border border-copilot-border">
                <div className={`flex items-center gap-2 ${ralphEnabled ? 'mb-2' : ''}`}>
                  <RalphIcon size={28} />
                  <span className="text-xs font-medium text-copilot-text">Ralph Wiggum Loop</span>
                  <label className="ml-auto flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ralphEnabled}
                      onChange={(e) => setRalphEnabled(e.target.checked)}
                      className="rounded border-copilot-border w-3.5 h-3.5"
                    />
                    <span className="text-[10px] text-copilot-text-muted">Enable</span>
                  </label>
                  <button
                    onClick={() => setShowRalphSettings(false)}
                    className="p-1 rounded hover:bg-copilot-surface-hover"
                  >
                    <CloseIcon size={10} className="text-copilot-text-muted" />
                  </button>
                </div>
                {ralphEnabled && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-copilot-text-muted block mb-1">
                        Max iterations (safety limit)
                      </label>
                      <input
                        type="number"
                        value={ralphMaxIterations}
                        onChange={(e) => setRalphMaxIterations(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 bg-copilot-surface border border-copilot-border rounded px-2 py-1 text-xs text-copilot-text"
                        min={1}
                        max={100}
                      />
                    </div>
                    <p className="text-[10px] text-copilot-text-muted">
                      The agent will loop until it signals completion or hits the max iterations.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Terminal Attachment Indicator */}
            {terminalAttachment && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-copilot-surface rounded-t-lg border border-b-0 border-copilot-border">
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
            
            <div className={`flex items-center bg-copilot-bg border border-copilot-border focus-within:border-copilot-accent transition-colors ${terminalAttachment ? 'rounded-b-lg' : 'rounded-lg'}`}>
              {/* Ralph Toggle Button */}
              {!activeTab?.isProcessing && (
                <button
                  onClick={() => setShowRalphSettings(!showRalphSettings)}
                  className={`shrink-0 p-1.5 pl-2.5 pr-0 transition-colors ${
                    ralphEnabled 
                      ? "text-copilot-warning" 
                      : showRalphSettings 
                        ? "text-copilot-accent" 
                        : "text-copilot-text-muted hover:text-copilot-text"
                  }`}
                  title="Ralph Wiggum Loop - Iterative agent mode"
                >
                  <RalphIcon size={22} />
                </button>
              )}
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={ralphEnabled ? "Describe task with clear completion criteria..." : "Ask Copilot... (Shift+Enter for new line)"}
                className={`flex-1 bg-transparent py-2.5 ${activeTab?.isProcessing ? 'pl-3' : 'pl-1.5'} pr-2 text-copilot-text placeholder-copilot-text-muted outline-none text-sm resize-none min-h-[40px] max-h-[200px]`}
                disabled={status !== "connected" || activeTab?.isProcessing}
                autoFocus
                rows={1}
                style={{ height: "auto" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height =
                    Math.min(target.scrollHeight, 200) + "px";
                }}
              />
              {activeTab?.isProcessing ? (
                <button
                  onClick={handleStop}
                  className="shrink-0 px-4 py-2.5 text-copilot-error hover:brightness-110 text-xs font-medium transition-colors flex items-center gap-1.5"
                  title={activeTab?.ralphConfig?.active ? "Stop Ralph Loop" : "Stop"}
                >
                  <StopIcon size={10} />
                  {activeTab?.ralphConfig?.active ? "Stop Loop" : "Stop"}
                </button>
              ) : (
                <button
                  onClick={handleSendMessage}
                  disabled={
                    (!inputValue.trim() && !terminalAttachment) ||
                    status !== "connected" ||
                    activeTab?.isProcessing
                  }
                  className="shrink-0 px-4 py-2.5 text-copilot-accent hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-medium transition-colors"
                >
                  {ralphEnabled ? "Start Loop" : "Send"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Resize Handle */}
        <div
          className="w-1 hover:w-1.5 bg-transparent hover:bg-copilot-accent/50 cursor-col-resize shrink-0 transition-all"
          onMouseDown={(e) => handleResizeMouseDown(e, 'right')}
        />

        {/* Right Panel - Activity & Session Info */}
        <div 
          className="border-l border-copilot-border flex flex-col shrink-0 bg-copilot-bg"
          style={{ width: rightPanelWidth }}
        >
          {/* Activity Header with Intent */}
          <div className="px-3 py-2 border-b border-copilot-border bg-copilot-surface">
            <div className="flex items-center gap-2">
              {activeTab?.isProcessing ? (
                <>
                  {activeTab?.ralphConfig?.active ? (
                    <RalphIcon size={12} className="text-copilot-warning animate-pulse" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-copilot-warning animate-pulse" />
                  )}
                  <span className="text-xs font-medium text-copilot-text truncate">
                    {activeTab?.ralphConfig?.active 
                      ? `Ralph ${activeTab.ralphConfig.currentIteration}/${activeTab.ralphConfig.maxIterations}`
                      : (activeTab?.currentIntent || "Working...")}
                  </span>
                  {activeTab?.ralphConfig?.active && activeTab?.currentIntent && (
                    <span className="text-[10px] text-copilot-text-muted truncate">
                      — {activeTab.currentIntent}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-copilot-success" />
                  <span className="text-xs font-medium text-copilot-text-muted">
                    Ready
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Tool Activity Log */}
          <div className="flex-1 overflow-y-auto">
            {/* Tools List */}
            {(activeTab?.activeTools?.length || 0) > 0 && (
              <div className="border-b border-copilot-surface">
                {(() => {
                  type GroupedTool = { tool: ActiveTool; count: number };

                  const tools = activeTab?.activeTools || [];
                  const groups: GroupedTool[] = [];

                  const getDescription = (tool: ActiveTool): string => {
                    const input = tool.input || {};
                    const path = input.path as string | undefined;
                    const shortPath = path
                      ? path.split("/").slice(-2).join("/")
                      : "";

                    if (tool.toolName === "grep") {
                      const pattern = (input.pattern as string) || "";
                      return pattern ? `"${pattern}"` : "";
                    }

                    if (tool.toolName === "glob") {
                      return (input.pattern as string) || "";
                    }

                    if (tool.toolName === "view") {
                      return shortPath || path || "";
                    }

                    if (
                      tool.toolName === "edit" ||
                      tool.toolName === "create"
                    ) {
                      return shortPath || path || "";
                    }

                    if (tool.toolName === "bash") {
                      const desc = (input.description as string) || "";
                      const cmd = ((input.command as string) || "").slice(
                        0,
                        40,
                      );
                      return desc || (cmd ? `$ ${cmd}...` : "");
                    }

                    if (
                      tool.toolName === "read_bash" ||
                      tool.toolName === "write_bash"
                    ) {
                      return "session";
                    }

                    if (tool.toolName === "web_fetch") {
                      return ((input.url as string) || "").slice(0, 30);
                    }

                    return "";
                  };

                  const getGroupKey = (tool: ActiveTool): string => {
                    const input = tool.input || {};
                    const description = getDescription(tool);
                    const summary =
                      tool.status === "done"
                        ? formatToolOutput(tool.toolName, input, tool.output)
                        : "";
                    let key = `${tool.toolName}|${description}|${summary}`;

                    // For edits, include first-line diff so unrelated edits don't collapse.
                    if (
                      tool.toolName === "edit" &&
                      tool.status === "done" &&
                      input.old_str
                    ) {
                      const oldLine = String(input.old_str).split("\n")[0];
                      const newLine =
                        input.new_str !== undefined
                          ? String(input.new_str).split("\n")[0]
                          : "";
                      key += `|${oldLine}|${newLine}`;
                    }

                    return key;
                  };

                  const groupMap = new Map<string, GroupedTool>();

                  // Group all completed tools by identical rendered label/summary.
                  for (const tool of tools) {
                    if (tool.status !== "done") {
                      groups.push({ tool, count: 1 });
                      continue;
                    }

                    const key = getGroupKey(tool);
                    const existing = groupMap.get(key);
                    if (existing) {
                      existing.count += 1;
                      continue;
                    }

                    const entry = { tool, count: 1 };
                    groupMap.set(key, entry);
                    groups.push(entry);
                  }

                  return groups.map(({ tool, count }) => {
                    const input = tool.input || {};
                    const isEdit = tool.toolName === "edit";
                    const description = getDescription(tool);

                    return (
                      <div
                        key={`${tool.toolCallId}-g`}
                        className="px-3 py-1.5 border-b border-copilot-bg last:border-b-0"
                      >
                        <div className="flex items-start gap-2 text-xs">
                          {tool.status === "running" ? (
                            <span className="text-copilot-warning shrink-0 mt-0.5">
                              ○
                            </span>
                          ) : (
                            <span className="text-copilot-success shrink-0">
                              ✓
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium ${tool.status === "done" ? "text-copilot-text" : "text-copilot-text-muted"}`}
                              >
                                {tool.toolName.charAt(0).toUpperCase() +
                                  tool.toolName.slice(1)}
                              </span>
                              {tool.status === "done" && count > 1 && (
                                <span className="text-[10px] text-copilot-text-muted">
                                  ×{count}
                                </span>
                              )}
                            </div>
                            {description && (
                              <span className="text-copilot-text-muted font-mono ml-1 text-[10px] truncate block">
                                {description}
                              </span>
                            )}
                            {tool.status === "done" && (
                              <div className="text-copilot-text-muted text-[10px] mt-0.5">
                                {formatToolOutput(
                                  tool.toolName,
                                  input,
                                  tool.output,
                                )}
                              </div>
                            )}
                            {isEdit &&
                              tool.status === "done" &&
                              !!input.old_str && (
                                <div className="mt-1 text-[10px] font-mono pl-2 border-l border-copilot-border">
                                  <div className="text-copilot-error truncate">
                                    −{" "}
                                    {(input.old_str as string)
                                      .split("\n")[0]
                                      .slice(0, 35)}
                                  </div>
                                  {input.new_str !== undefined && (
                                    <div className="text-copilot-success truncate">
                                      +{" "}
                                      {(input.new_str as string)
                                        .split("\n")[0]
                                        .slice(0, 35)}
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Processing indicator when no tools visible */}
            {activeTab?.isProcessing &&
              (activeTab?.activeTools?.length || 0) === 0 && (
                <div className="px-3 py-3 flex items-center gap-2 border-b border-copilot-surface">
                  <Spinner size="sm" />
                  <span className="text-xs text-copilot-text-muted">
                    Thinking...
                  </span>
                </div>
              )}

            {/* Session Info Section */}
            <div className="border-t border-copilot-border mt-auto">
              {/* Working Directory */}
              <div className="px-3 py-2 border-b border-copilot-surface">
                <div className="text-[10px] text-copilot-text-muted uppercase tracking-wide mb-1">
                  Directory
                </div>
                <div className="flex items-center gap-1.5 text-xs min-w-0">
                  <FolderIcon
                    size={12}
                    className="text-copilot-accent shrink-0"
                  />
                  <span
                    className="text-copilot-text font-mono truncate"
                    title={activeTab?.cwd}
                  >
                    {activeTab?.cwd || "Unknown"}
                  </span>
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
              <div className="border-b border-copilot-surface">
                <div className="flex items-center">
                  <button
                    onClick={() => setShowEditedFiles(!showEditedFiles)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    <ChevronRightIcon
                      size={8}
                      className={`transition-transform ${showEditedFiles ? "rotate-90" : ""}`}
                    />
                    <span>Edited Files</span>
                    {(activeTab?.editedFiles.length || 0) > 0 && (
                      <span className="text-copilot-accent">
                        ({activeTab?.editedFiles.length})
                      </span>
                    )}
                  </button>
                  <IconButton
                    icon={<CommitIcon size={12} />}
                    onClick={handleOpenCommitModal}
                    variant="accent"
                    size="sm"
                    title="Commit and push"
                    className="mr-1"
                  />
                </div>
                {showEditedFiles && activeTab && (
                  <div className="max-h-32 overflow-y-auto">
                    {activeTab.editedFiles.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                        No files edited
                      </div>
                    ) : (
                      activeTab.editedFiles.map((filePath) => (
                        <div
                          key={filePath}
                          className="flex items-center gap-2 px-3 py-1 text-[10px] text-copilot-text-muted hover:bg-copilot-surface"
                          title={filePath}
                        >
                          <FileIcon
                            size={8}
                            className="shrink-0 text-copilot-success"
                          />
                          <span className="truncate font-mono">
                            {filePath.split("/").pop()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Always Allowed */}
              <div className="border-b border-copilot-border">
                <div className="flex items-center">
                  <button
                    onClick={() => {
                      setShowAlwaysAllowed(!showAlwaysAllowed);
                      if (!showAlwaysAllowed) refreshAlwaysAllowed();
                    }}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    <ChevronRightIcon
                      size={8}
                      className={`transition-transform ${showAlwaysAllowed ? "rotate-90" : ""}`}
                    />
                    <span>Always Allowed</span>
                    {(activeTab?.alwaysAllowed.length || 0) > 0 && (
                      <span className="text-copilot-accent">
                        ({activeTab?.alwaysAllowed.length})
                      </span>
                    )}
                  </button>
                  <IconButton
                    icon={<PlusIcon size={12} />}
                    onClick={() => {
                      setShowAddCommand(!showAddCommand);
                      if (!showAlwaysAllowed) {
                        setShowAlwaysAllowed(true);
                        refreshAlwaysAllowed();
                      }
                    }}
                    variant="success"
                    size="sm"
                    title="Add allowed command"
                    className="mr-1"
                  />
                </div>
                {showAddCommand && activeTab && (
                  <div className="px-3 pb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={addCommandValue}
                        onChange={(e) => setAddCommandValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddAlwaysAllowed();
                          if (e.key === "Escape") {
                            setShowAddCommand(false);
                            setAddCommandValue("");
                          }
                        }}
                        placeholder="e.g., npm, git, python"
                        className="flex-1 px-2 py-1 text-[10px] bg-copilot-surface border border-copilot-border rounded text-copilot-text placeholder:text-copilot-text-muted focus:outline-none focus:border-copilot-accent"
                        autoFocus
                      />
                      <button
                        onClick={handleAddAlwaysAllowed}
                        disabled={!addCommandValue.trim()}
                        className="px-2 py-1 text-[10px] bg-copilot-accent text-copilot-text rounded hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
                {showAlwaysAllowed && activeTab && (
                  <div className="max-h-32 overflow-y-auto">
                    {activeTab.alwaysAllowed.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                        No always-allowed
                      </div>
                    ) : (
                      (() => {
                        const isSpecialExe = (exe: string) =>
                          exe.startsWith("write") ||
                          exe.startsWith("url") ||
                          exe.startsWith("mcp");
                        const toPretty = (exe: string) => {
                          const hasColon = exe.includes(":");
                          const [rawPrefix, rawRest] = hasColon
                            ? exe.split(":", 2)
                            : [exe, null];
                          const prefix = rawPrefix;
                          const rest = rawRest;

                          const isSpecial =
                            prefix === "write" ||
                            prefix === "url" ||
                            prefix === "mcp";
                          const meaning =
                            prefix === "write"
                              ? "File changes"
                              : prefix === "url"
                                ? "Web access"
                                : prefix === "mcp"
                                  ? "MCP tools"
                                  : "";

                          return isSpecial
                            ? rest
                              ? `${meaning}: ${rest}`
                              : meaning
                            : exe;
                        };

                        const list = [...activeTab.alwaysAllowed].sort(
                          (a, b) => {
                            const ra = isSpecialExe(a) ? 0 : 1;
                            const rb = isSpecialExe(b) ? 0 : 1;
                            if (ra !== rb) return ra - rb;
                            return toPretty(a).localeCompare(toPretty(b));
                          },
                        );

                        return (
                          <div className="px-3 pb-2 flex flex-wrap gap-2">
                            {list.map((exe) => {
                              const hasColon = exe.includes(":");
                              const [rawPrefix, rawRest] = hasColon
                                ? exe.split(":", 2)
                                : [exe, null];
                              const prefix = rawPrefix;
                              const rest = rawRest;

                              const isSpecial =
                                prefix === "write" ||
                                prefix === "url" ||
                                prefix === "mcp";
                              const meaning =
                                prefix === "write"
                                  ? "File changes"
                                  : prefix === "url"
                                    ? "Web access"
                                    : prefix === "mcp"
                                      ? "MCP tools"
                                      : "";
                              const pretty = isSpecial
                                ? rest
                                  ? `${meaning}: ${rest}`
                                  : meaning
                                : exe;

                              return (
                                <div
                                  key={exe}
                                  className={`flex items-center gap-2 rounded border px-2 py-1 text-[10px] font-mono ${
                                    isSpecial
                                      ? "bg-copilot-surface-hover border-copilot-border text-copilot-accent"
                                      : "bg-copilot-surface-hover border-copilot-border text-copilot-text-muted"
                                  }`}
                                  title={pretty}
                                >
                                  <span className="truncate max-w-[180px]">
                                    {pretty}
                                  </span>
                                  <button
                                    onClick={() =>
                                      handleRemoveAlwaysAllowed(exe)
                                    }
                                    className="shrink-0 text-copilot-error hover:brightness-110"
                                    title="Remove"
                                  >
                                    <CloseIcon size={10} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>

              {/* MCP Servers */}
              <div>
                <div className="flex items-center">
                  <button
                    onClick={() => setShowMcpServers(!showMcpServers)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-copilot-text-muted hover:text-copilot-text hover:bg-copilot-surface transition-colors"
                  >
                    <ChevronRightIcon
                      size={8}
                      className={`transition-transform ${showMcpServers ? "rotate-90" : ""}`}
                    />
                    <span>MCP Servers</span>
                    {Object.keys(mcpServers).length > 0 && (
                      <span className="text-copilot-accent">
                        ({Object.keys(mcpServers).length})
                      </span>
                    )}
                  </button>
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
                    {Object.keys(mcpServers).length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-copilot-text-muted">
                        No MCP servers configured
                      </div>
                    ) : (
                      Object.entries(mcpServers).map(([name, server]) => {
                        const isLocal =
                          !server.type ||
                          server.type === "local" ||
                          server.type === "stdio";
                        const toolCount =
                          server.tools[0] === "*"
                            ? "all"
                            : `${server.tools.length}`;
                        return (
                          <div
                            key={name}
                            className="group px-3 py-1.5 hover:bg-copilot-surface border-b border-copilot-border last:border-b-0"
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
                                <div className="text-[10px] text-copilot-accent">
                                  {toolCount} tools
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
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commit Modal */}
      <Modal
        isOpen={showCommitModal && !!activeTab}
        onClose={() => setShowCommitModal(false)}
        title="Commit & Push Changes"
      >
        <Modal.Body>
          {activeTab && (
            <>
              {/* Files to commit */}
              <div className="mb-3">
                <div className="text-xs text-copilot-text-muted mb-2">
                  Files to commit ({activeTab.editedFiles.length}):
                </div>
                <div className="bg-copilot-bg rounded border border-copilot-surface max-h-32 overflow-y-auto">
                  {activeTab.editedFiles.map((filePath) => (
                    <div
                      key={filePath}
                      className="px-3 py-1.5 text-xs text-copilot-success font-mono truncate"
                      title={filePath}
                    >
                      {filePath}
                    </div>
                  ))}
                </div>
              </div>

              {/* Commit message */}
              <div className="mb-3 relative">
                <label className="text-xs text-copilot-text-muted mb-2 block">
                  Commit message:
                </label>
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className={`w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text placeholder-copilot-text-muted focus:border-copilot-accent outline-none resize-none ${isGeneratingMessage ? "opacity-50" : ""}`}
                  rows={3}
                  placeholder="Enter commit message..."
                  autoFocus
                  disabled={isGeneratingMessage}
                />
                {isGeneratingMessage && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="w-4 h-4 border-2 border-copilot-accent/30 border-t-copilot-accent rounded-full animate-spin"></span>
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs text-copilot-text-muted">After push:</span>
                <Dropdown
                  value={commitAction}
                  options={[
                    { id: 'push' as const, label: 'Nothing' },
                    { id: 'merge' as const, label: 'Merge to main' },
                    { id: 'pr' as const, label: 'Create PR' },
                  ]}
                  onSelect={(id) => {
                    setCommitAction(id)
                    if (id !== 'merge') setRemoveWorktreeAfterMerge(false)
                  }}
                  disabled={isCommitting}
                  align="left"
                  minWidth="120px"
                />
              </div>

              {/* Remove worktree option - only visible when merge is selected and in a worktree */}
              {commitAction === 'merge' && activeTab?.cwd.includes('.copilot-sessions') && (
                <div className="mb-4 flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-copilot-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeWorktreeAfterMerge}
                      onChange={(e) => setRemoveWorktreeAfterMerge(e.target.checked)}
                      className="rounded border-copilot-border bg-copilot-bg accent-copilot-accent"
                      disabled={isCommitting}
                    />
                    Remove worktree after merge
                  </label>
                </div>
              )}

              {/* Error message */}
              {commitError && (
                <div className="mb-3 px-3 py-2 bg-copilot-error-muted border border-copilot-error rounded text-xs text-copilot-error">
                  {commitError}
                </div>
              )}

              {/* Actions */}
              <Modal.Footer>
                <Button
                  variant="ghost"
                  onClick={() => setShowCommitModal(false)}
                  disabled={isCommitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCommitAndPush}
                  disabled={
                    !commitMessage.trim() || isCommitting || isGeneratingMessage
                  }
                  isLoading={isCommitting}
                  leftIcon={
                    !isCommitting ? <CommitIcon size={12} /> : undefined
                  }
                >
                  {isCommitting 
                    ? "Pushing..." 
                    : commitAction === 'pr' 
                      ? "Commit & Create PR" 
                      : commitAction === 'merge' 
                        ? "Commit & Merge" 
                        : "Commit & Push"}
                </Button>
              </Modal.Footer>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* Incoming Changes Modal - shown when merge from main brought changes */}
      <Modal
        isOpen={!!pendingMergeInfo && !!activeTab}
        onClose={() => setPendingMergeInfo(null)}
        title="Main Branch Had Changes"
        width="500px"
      >
        <Modal.Body>
          <div className="mb-4">
            <div className="text-sm text-copilot-text mb-2">
              Your branch has been synced with the latest changes from main. The following files were updated:
            </div>
            {pendingMergeInfo && pendingMergeInfo.incomingFiles.length > 0 ? (
              <div className="bg-copilot-bg rounded border border-copilot-surface max-h-40 overflow-y-auto">
                {pendingMergeInfo.incomingFiles.map((filePath) => (
                  <div
                    key={filePath}
                    className="px-3 py-1.5 text-xs text-copilot-warning font-mono truncate"
                    title={filePath}
                  >
                    {filePath}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-copilot-text-muted italic">
                (Unable to determine changed files)
              </div>
            )}
          </div>
          <div className="text-sm text-copilot-text-muted mb-4">
            We recommend testing your changes before completing the merge to main.
          </div>
          <Modal.Footer>
            <Button
              variant="ghost"
              onClick={() => setPendingMergeInfo(null)}
            >
              Test First
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!activeTab) return;
                setIsCommitting(true);
                try {
                  const result = await window.electronAPI.git.mergeToMain(activeTab.cwd, removeWorktreeAfterMerge);
                  if (result.success) {
                    if (removeWorktreeAfterMerge && activeTab.cwd.includes('.copilot-sessions')) {
                      const sessionId = activeTab.cwd.split('/').pop() || '';
                      if (sessionId) {
                        await window.electronAPI.worktree.removeSession({ sessionId, force: true });
                        handleCloseTab(activeTab.id);
                      }
                    }
                    updateTab(activeTab.id, { 
                      gitBranchRefresh: (activeTab.gitBranchRefresh || 0) + 1
                    });
                  } else {
                    setCommitError(result.error || 'Merge failed');
                  }
                } catch (error) {
                  setCommitError(String(error));
                } finally {
                  setIsCommitting(false);
                  setPendingMergeInfo(null);
                  setCommitAction('push');
                  setRemoveWorktreeAfterMerge(false);
                }
              }}
              isLoading={isCommitting}
            >
              Merge to Main Now
            </Button>
          </Modal.Footer>
        </Modal.Body>
      </Modal>

      {/* MCP Server Modal */}
      <Modal
        isOpen={showMcpModal}
        onClose={() => setShowMcpModal(false)}
        title={editingMcpServer ? "Edit MCP Server" : "Add MCP Server"}
        width="450px"
      >
        <Modal.Body className="space-y-4">
          {/* Server Name */}
          <div>
            <label className="text-xs text-copilot-text-muted mb-1 block">
              Server Name
            </label>
            <input
              type="text"
              value={mcpFormData.name}
              onChange={(e) =>
                setMcpFormData({ ...mcpFormData, name: e.target.value })
              }
              className="w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text placeholder-copilot-text-muted focus:border-copilot-accent outline-none"
              placeholder="my-mcp-server"
              autoFocus
            />
          </div>

          {/* Server Type */}
          <div>
            <label className="text-xs text-copilot-text-muted mb-1 block">
              Type
            </label>
            <div className="flex gap-2">
              {(["local", "http", "sse"] as const).map((type) => (
                <Button
                  key={type}
                  variant={mcpFormData.type === type ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => setMcpFormData({ ...mcpFormData, type })}
                >
                  {type === "local" ? "Local/Stdio" : type.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Local Server Config */}
          {mcpFormData.type === "local" && (
            <>
              <div>
                <label className="text-xs text-copilot-text-muted mb-1 block">
                  Command
                </label>
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
                  onChange={(e) =>
                    setMcpFormData({ ...mcpFormData, args: e.target.value })
                  }
                  className="w-full bg-copilot-bg border border-copilot-border rounded px-3 py-2 text-sm text-copilot-text font-mono placeholder-copilot-text-muted focus:border-copilot-accent outline-none"
                  placeholder="-y @my-mcp-server"
                />
              </div>
            </>
          )}

          {/* Remote Server Config */}
          {(mcpFormData.type === "http" || mcpFormData.type === "sse") && (
            <div>
              <label className="text-xs text-copilot-text-muted mb-1 block">
                URL
              </label>
              <input
                type="text"
                value={mcpFormData.url}
                onChange={(e) =>
                  setMcpFormData({ ...mcpFormData, url: e.target.value })
                }
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
              onChange={(e) =>
                setMcpFormData({ ...mcpFormData, tools: e.target.value })
              }
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
                (mcpFormData.type === "local"
                  ? !mcpFormData.command.trim()
                  : !mcpFormData.url.trim())
              }
            >
              {editingMcpServer ? "Save Changes" : "Add Server"}
            </Button>
          </Modal.Footer>
        </Modal.Body>
      </Modal>

      {/* Worktree Sessions List Modal */}
      <WorktreeSessionsList
        isOpen={showWorktreeList}
        onClose={() => setShowWorktreeList(false)}
        onOpenSession={handleOpenWorktreeSession}
        onRemoveSession={(worktreePath: string) => {
          // Close any tab that has this worktree path as cwd
          const tabToClose = tabs.find(tab => tab.cwd === worktreePath)
          if (tabToClose) {
            handleCloseTab(tabToClose.id)
          }
        }}
      />

      {/* Create Worktree Session Modal */}
      <CreateWorktreeSession
        isOpen={showCreateWorktree}
        onClose={() => setShowCreateWorktree(false)}
        repoPath={worktreeRepoPath}
        onSessionCreated={handleWorktreeSessionCreated}
      />
    </div>
  );
};

export default App;
