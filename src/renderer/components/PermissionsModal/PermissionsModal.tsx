import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Modal } from '../Modal'
import { Button } from '../Button'

interface PermissionStatus {
  platform: string
  screenRecording: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
  accessibility: 'granted' | 'denied'
  modalDismissed: boolean
  appName: string
  appPath: string
  appBundlePath: string
  isDev: boolean
}

interface PermissionsModalProps {
  isOpen: boolean
  onClose: () => void
  onDismiss: () => void
}

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const AlertIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const MonitorIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
)

const AccessibilityIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="4" r="2" />
    <path d="M12 6v4" />
    <path d="M8 8h8" />
    <path d="M9 12l-2 10" />
    <path d="M15 12l2 10" />
    <path d="M12 14v4" />
  </svg>
)

export const PermissionsModal: React.FC<PermissionsModalProps> = ({ isOpen, onClose, onDismiss }) => {
  const [status, setStatus] = useState<PermissionStatus | null>(null)
  const previousStatusRef = useRef<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const newStatus = await window.electronAPI.permissions.getStatus()
      // Only update state if the status actually changed (prevents flickering)
      const statusKey = `${newStatus.screenRecording}-${newStatus.accessibility}`
      if (statusKey !== previousStatusRef.current) {
        previousStatusRef.current = statusKey
        setStatus(newStatus)
      }
    } catch (error) {
      console.error('Failed to get permissions status:', error)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      refreshStatus()
      // Poll for permission changes while modal is open (less frequently to avoid flicker)
      const interval = setInterval(refreshStatus, 3000)
      return () => clearInterval(interval)
    }
  }, [isOpen, refreshStatus])

  const handleOpenScreenRecording = async () => {
    await window.electronAPI.permissions.openScreenRecordingSettings()
  }

  const handleOpenAccessibility = async () => {
    await window.electronAPI.permissions.openAccessibilitySettings()
  }

  const handleRevealInFinder = async () => {
    await window.electronAPI.permissions.revealInFinder()
  }

  const handleDismiss = async () => {
    await window.electronAPI.permissions.dismissModal()
    onDismiss()
  }

  const allPermissionsGranted = status && 
    status.screenRecording === 'granted' && 
    status.accessibility === 'granted'

  const appName = status?.appName || 'Copilot Skins'

  const renderPermissionRow = (
    icon: React.ReactNode,
    name: string,
    description: string,
    granted: boolean,
    onOpenSettings: () => void
  ) => (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-copilot-bg border border-copilot-border">
      <div className="flex-shrink-0 text-copilot-text-muted mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-copilot-text">{name}</span>
          {granted ? (
            <span className="flex items-center gap-1 text-xs text-copilot-success">
              <CheckIcon className="text-copilot-success" />
              Granted
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-copilot-warning">
              <AlertIcon className="text-copilot-warning" />
              Not Granted
            </span>
          )}
        </div>
        <p className="text-xs text-copilot-text-muted mt-1">{description}</p>
        {!granted && (
          <button
            onClick={onOpenSettings}
            className="mt-2 text-xs text-copilot-accent hover:text-copilot-accent-hover underline"
          >
            Open System Settings
          </button>
        )}
      </div>
    </div>
  )

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Permission Setup"
      width="500px"
      showCloseButton={true}
      testId="permissions-modal"
    >
      <Modal.Body className="space-y-4">
        <p className="text-sm text-copilot-text-muted">
          Copilot Skins uses certain macOS permissions to provide enhanced features. 
          Grant these permissions for the best experience, or continue with limited functionality.
        </p>

        {status && (
          <div className="space-y-3">
            {renderPermissionRow(
              <MonitorIcon />,
              'Screen Recording',
              status.isDev && status.screenRecording !== 'granted'
                ? 'Required for screenshots. In development mode, macOS may not allow adding unsigned apps. Build the production app to enable this feature.'
                : 'Required for taking screenshots of your screen and windows. Used by the screenshot tool to capture visual evidence.',
              status.screenRecording === 'granted',
              handleOpenScreenRecording
            )}

            {renderPermissionRow(
              <AccessibilityIcon />,
              'Accessibility',
              status.isDev && status.accessibility === 'granted'
                ? 'Shared across Electron apps. If you\'ve granted this to any Electron app before, it applies here too.'
                : 'Enables advanced window management and automation features. Allows the app to interact with other applications.',
              status.accessibility === 'granted',
              handleOpenAccessibility
            )}
          </div>
        )}

        {status && !allPermissionsGranted && !status.isDev && (
          <div className="p-3 rounded-lg bg-copilot-accent-muted border border-copilot-accent/30 space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-copilot-text font-medium">
                To grant permissions:
              </p>
              <ol className="text-xs text-copilot-text-muted list-decimal list-inside space-y-1">
                <li>Click "Open System Settings" above</li>
                <li>Click the + button to add an app</li>
                <li>Navigate to and select this app:</li>
              </ol>
            </div>
            {status.appBundlePath && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-copilot-text font-mono break-all flex-1">
                  {status.appBundlePath}
                </p>
                <button
                  onClick={handleRevealInFinder}
                  className="flex-shrink-0 text-xs text-copilot-accent hover:text-copilot-accent-hover underline"
                >
                  Show in Finder
                </button>
              </div>
            )}
            <p className="text-xs text-copilot-text-muted">
              Restart the app after granting permissions.
            </p>
          </div>
        )}

        {status && status.isDev && status.screenRecording !== 'granted' && (
          <div className="p-3 rounded-lg bg-copilot-warning-muted border border-copilot-warning/30 space-y-2">
            <p className="text-xs text-copilot-warning font-medium">
              Development Mode Limitation
            </p>
            <p className="text-xs text-copilot-text-muted">
              Screen Recording requires a signed app bundle. Run <code className="bg-copilot-bg px-1 rounded">npm run dist</code> to build a production version, then run it from the <code className="bg-copilot-bg px-1 rounded">release/</code> folder.
            </p>
          </div>
        )}
      </Modal.Body>

      <Modal.Body className="pt-0">
        <Modal.Footer className="border-t border-copilot-border pt-4 mt-2">
          <Button variant="ghost" onClick={handleDismiss} data-testid="permissions-dont-show-again">
            Don't show again
          </Button>
          <Button 
            variant={allPermissionsGranted ? 'primary' : 'secondary'} 
            onClick={onClose}
            data-testid="permissions-continue"
          >
            {allPermissionsGranted ? 'Continue' : 'Continue anyway'}
          </Button>
        </Modal.Footer>
      </Modal.Body>
    </Modal>
  )
}

export default PermissionsModal
