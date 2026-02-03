import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../Button'

interface TourStep {
  selector: string
  selectorAfterClick?: string  // Selector for expanded element after click
  expandToIncludeOriginal?: boolean  // If true, highlight expands to include both original and afterClick elements
  title: string
  description: string
  descriptionAfterClick?: string  // Description to show after element is clicked/expanded
  position: 'top' | 'bottom' | 'left' | 'right'
  positionAfterClick?: 'top' | 'bottom' | 'left' | 'right'  // Position after click
  requiresClick?: boolean  // If true, user must click the element to proceed
  forceVisible?: boolean   // If true, force the element to be visible (for hidden elements)
  cleanupOnNext?: string   // Selector to click when leaving this step (to close panels)
  highlightPadding?: { top?: number; right?: number; bottom?: number; left?: number }  // Extra padding around highlight
  highlightPaddingAfterClick?: { top?: number; right?: number; bottom?: number; left?: number }  // Padding when expanded
}

const tourSteps: TourStep[] = [
  {
    selector: '[data-tour="sidebar-tabs"]',
    title: 'Multiple Sessions',
    description: 'Each tab is a separate session with its own working directory, model, and conversation. Click + to add more!',
    position: 'right'
  },
  {
    selector: '[data-tour="new-worktree"]',
    title: 'Git Worktree Sessions',
    description: 'Paste a GitHub issue URL here to create an isolated worktree. Work on multiple issues without branch switching!',
    position: 'right',
    forceVisible: true
  },
  {
    selector: '[data-tour="terminal-toggle"]',
    selectorAfterClick: '[data-tour="terminal-panel"]',
    expandToIncludeOriginal: true,  // Highlight both button and panel
    title: 'Embedded Terminal',
    description: 'Click here to open the terminal.',
    descriptionAfterClick: 'Use "Add to Message" to attach terminal output to your prompt!',
    position: 'bottom',
    requiresClick: true,
    cleanupOnNext: '[data-tour="terminal-toggle"]'
  },
  {
    selector: '[data-tour="agent-modes"]',
    selectorAfterClick: '[data-tour="agent-modes-panel"]',
    expandToIncludeOriginal: true,  // Keep chevron highlighted when expanded
    title: 'Agent Modes (Ralph & Lisa)',
    description: 'Click this to reveal the agent modes.',
    descriptionAfterClick: 'Ralph Wiggum runs iterative loops. Lisa Simpson does multi-phase analysis. Try them!',
    position: 'top',
    positionAfterClick: 'top',
    requiresClick: true,
    cleanupOnNext: '[data-tour="agent-modes"]',
    highlightPadding: { right: 8 },  // Extra padding to center around chevron
    highlightPaddingAfterClick: { left: 8, right: 8, bottom: 8 }  // Padding around expanded panel
  },
  {
    selector: '[data-tour="model-selector"]',
    title: 'Model Selection',
    description: 'Switch between GPT-4.1, Claude Opus-4, Sonnet, Gemini, and more models per session.',
    position: 'bottom'
  },
  {
    selector: '[data-tour="edited-files"]',
    title: 'Edited Files',
    description: 'Track files modified by Copilot. Click the commit button to push changes to your branch.',
    position: 'left'
  },
  {
    selector: '[data-tour="allowed-commands"]',
    title: 'Allowed Commands',
    description: 'Manage which shell commands can run automatically. Add trusted commands to skip approval prompts.',
    position: 'left'
  },
  {
    selector: '[data-tour="mcp-skills"]',
    title: 'MCP Servers & Skills',
    description: 'Connect external tools via MCP servers and add custom agent skills to extend capabilities.',
    position: 'left'
  }
]

export interface SpotlightTourProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
}

export const SpotlightTour: React.FC<SpotlightTourProps> = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const [arrowOffset, setArrowOffset] = useState<number | null>(null)  // Arrow offset from tooltip top/left
  const [waitingForClick, setWaitingForClick] = useState(false)
  const [hasClicked, setHasClicked] = useState(false)  // Track current expanded state (toggles)
  const [hasEverClicked, setHasEverClicked] = useState(false)  // Track if user has clicked at least once (for Next button)
  const [currentPosition, setCurrentPosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom')
  const hasClickedRef = useRef(false)  // Ref to avoid stale closure issues

  // Keep ref in sync
  useEffect(() => {
    hasClickedRef.current = hasClicked
  }, [hasClicked])

  // Define handlers first so they can be used in useEffects
  const cleanupForcedVisibility = useCallback(() => {
    tourSteps.forEach(step => {
      if (step.forceVisible) {
        const element = document.querySelector(step.selector) as HTMLElement
        if (element) {
          element.style.opacity = ''
          element.style.pointerEvents = ''
        }
      }
    })
  }, [])

  const handleSkip = useCallback(() => {
    cleanupForcedVisibility()
    onComplete()
    onClose()
  }, [onComplete, onClose, cleanupForcedVisibility])

  const handleFinish = useCallback(() => {
    cleanupForcedVisibility()
    onComplete()
    onClose()
  }, [onComplete, onClose, cleanupForcedVisibility])

  const updateTargetPosition = useCallback(() => {
    if (!isOpen) return
    
    const step = tourSteps[currentStep]
    const clicked = hasClickedRef.current
    
    // Use expanded selector if clicked and one is defined
    const useExpanded = clicked && step.selectorAfterClick
    const selector = useExpanded ? step.selectorAfterClick! : step.selector
    const position = (useExpanded && step.positionAfterClick) ? step.positionAfterClick : step.position
    const element = document.querySelector(selector) as HTMLElement
    
    // Update current position for arrow rendering
    setCurrentPosition(position)
    
    if (element) {
      // Force visibility for hidden elements
      if (step.forceVisible) {
        element.style.opacity = '1'
        element.style.pointerEvents = 'auto'
      }
      
      let rect = element.getBoundingClientRect()
      
      // If expandToIncludeOriginal is set and expanded, combine both rects
      if (useExpanded && step.expandToIncludeOriginal) {
        const originalElement = document.querySelector(step.selector) as HTMLElement
        if (originalElement) {
          const originalRect = originalElement.getBoundingClientRect()
          // Create a combined rect that encompasses both elements
          const minLeft = Math.min(rect.left, originalRect.left)
          const minTop = Math.min(rect.top, originalRect.top)
          const maxRight = Math.max(rect.right, originalRect.right)
          const maxBottom = Math.max(rect.bottom, originalRect.bottom)
          rect = {
            left: minLeft,
            top: minTop,
            right: maxRight,
            bottom: maxBottom,
            width: maxRight - minLeft,
            height: maxBottom - minTop,
            x: minLeft,
            y: minTop,
            toJSON: () => ({})
          } as DOMRect
        }
      }
      
      setTargetRect(rect)
      
      // Calculate tooltip position - align with element, not centered
      const padding = 12
      const tooltipWidth = 320
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      
      let style: React.CSSProperties = {}
      let arrow: number | null = null
      
      switch (position) {
        case 'right': {
          // Position to the right of element
          const tooltipTop = Math.min(rect.top, viewportHeight - 220)
          style = {
            left: Math.min(rect.right + padding, viewportWidth - tooltipWidth - padding),
            top: tooltipTop,
          }
          // Arrow points to vertical center of element
          arrow = rect.top + rect.height / 2 - tooltipTop
          break
        }
        case 'left': {
          // Position to the left of element
          const tooltipTop = Math.max(padding, Math.min(rect.top + rect.height / 2 - 60, viewportHeight - 220))
          style = {
            left: Math.max(padding, rect.left - tooltipWidth - padding),
            top: tooltipTop,
          }
          // Arrow points to vertical center of element
          arrow = rect.top + rect.height / 2 - tooltipTop
          break
        }
        case 'bottom':
          // Position below element, centered horizontally
          style = {
            left: Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, viewportWidth - tooltipWidth - padding)),
            top: rect.bottom + padding,
          }
          break
        case 'top':
          // Position above element using bottom anchor, centered horizontally
          // Calculate from bottom of viewport to top of element
          const distanceFromBottom = viewportHeight - rect.top + padding
          style = {
            left: Math.max(padding, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, viewportWidth - tooltipWidth - padding)),
            bottom: distanceFromBottom,
          }
          break
      }
      
      setTooltipStyle(style)
      setArrowOffset(arrow)
    } else {
      setTargetRect(null)
    }
  }, [isOpen, currentStep])

  // Handle click on target element for requiresClick steps
  useEffect(() => {
    const step = tourSteps[currentStep]
    if (!isOpen || !step.requiresClick) {
      setWaitingForClick(false)
      setHasClicked(false)
      setHasEverClicked(false)
      hasClickedRef.current = false
      return
    }

    // Only show "waiting for click" if never clicked
    if (!hasEverClicked) {
      setWaitingForClick(true)
    }
    
    const element = document.querySelector(step.selector) as HTMLElement
    if (!element) return

    const handleClick = () => {
      // Toggle the clicked state (open/close panel)
      const newClickedState = !hasClickedRef.current
      setHasClicked(newClickedState)
      hasClickedRef.current = newClickedState
      setHasEverClicked(true)  // User has clicked at least once
      setWaitingForClick(false)  // Enable Next button
      
      if (newClickedState) {
        // Opening: wait for expanded element to appear
        let attempts = 0
        const maxAttempts = 10
        const pollInterval = setInterval(() => {
          attempts++
          const expandedSelector = step.selectorAfterClick || step.selector
          const expandedElement = document.querySelector(expandedSelector)
          
          if (expandedElement || attempts >= maxAttempts) {
            clearInterval(pollInterval)
            updateTargetPosition()
          }
        }, 100)
      } else {
        // Closing: update position immediately
        updateTargetPosition()
      }
    }

    element.addEventListener('click', handleClick)
    return () => element.removeEventListener('click', handleClick)
  }, [isOpen, currentStep, hasClicked, hasEverClicked, updateTargetPosition])

  // Cleanup forced visibility when leaving a step
  useEffect(() => {
    return () => {
      const step = tourSteps[currentStep]
      if (step?.forceVisible) {
        const element = document.querySelector(step.selector) as HTMLElement
        if (element) {
          element.style.opacity = ''
          element.style.pointerEvents = ''
        }
      }
    }
  }, [currentStep])

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
      setWaitingForClick(false)
      updateTargetPosition()
    }
  }, [isOpen])

  useEffect(() => {
    updateTargetPosition()
    
    // Update position on resize/scroll
    window.addEventListener('resize', updateTargetPosition)
    window.addEventListener('scroll', updateTargetPosition, true)
    
    return () => {
      window.removeEventListener('resize', updateTargetPosition)
      window.removeEventListener('scroll', updateTargetPosition, true)
    }
  }, [updateTargetPosition])

  const handleNext = useCallback(() => {
    const step = tourSteps[currentStep]
    // Don't allow Next button for requiresClick steps until clicked
    if (step.requiresClick && waitingForClick) return
    
    // Cleanup: click element to close panel/terminal if needed
    if (step.cleanupOnNext && hasClickedRef.current) {
      const cleanupElement = document.querySelector(step.cleanupOnNext) as HTMLElement
      if (cleanupElement) {
        cleanupElement.click()
      }
    }
    
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1)
      setWaitingForClick(false)
      setHasClicked(false)
      setHasEverClicked(false)  // Reset for new step
      hasClickedRef.current = false
    } else {
      handleFinish()
    }
  }, [currentStep, waitingForClick, handleFinish])

  const handlePrevious = useCallback(() => {
    const step = tourSteps[currentStep]
    
    // Cleanup: click element to close panel/terminal if needed
    if (step.cleanupOnNext && hasClickedRef.current) {
      const cleanupElement = document.querySelector(step.cleanupOnNext) as HTMLElement
      if (cleanupElement) {
        cleanupElement.click()
      }
    }
    
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
      setWaitingForClick(false)
      setHasEverClicked(false)  // Reset for new step
      setHasClicked(false)
      hasClickedRef.current = false
    }
  }, [currentStep])

  if (!isOpen) return null

  const step = tourSteps[currentStep]
  const isLastStep = currentStep === tourSteps.length - 1
  const currentDescription = (hasClicked && step.descriptionAfterClick) ? step.descriptionAfterClick : step.description
  
  // Calculate padded rect for highlight - use different padding when expanded
  const padding = (hasClicked && step.highlightPaddingAfterClick) ? step.highlightPaddingAfterClick : (step.highlightPadding || {})
  const paddedRect = targetRect ? {
    left: targetRect.left - (padding.left || 0),
    top: targetRect.top - (padding.top || 0),
    width: targetRect.width + (padding.left || 0) + (padding.right || 0),
    height: targetRect.height + (padding.top || 0) + (padding.bottom || 0),
  } : null

  // Render the overlay with spotlight cutout
  const overlayContent = (
    <div className="fixed inset-0 z-[9999]" data-testid="spotlight-tour">
      {/* Dark overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {paddedRect && (
              <rect
                x={paddedRect.left}
                y={paddedRect.top}
                width={paddedRect.width}
                height={paddedRect.height}
                rx="4"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
          style={{ pointerEvents: 'auto', cursor: 'default' }}
          onClick={(e) => e.stopPropagation()}
        />
      </svg>

      {/* Highlight ring around target - allow clicks through for interactive steps */}
      {paddedRect && (
        <div
          className={`absolute border-2 border-copilot-accent rounded ${step.requiresClick ? 'pointer-events-none' : 'pointer-events-none'} animate-pulse`}
          style={{
            left: paddedRect.left,
            top: paddedRect.top,
            width: paddedRect.width,
            height: paddedRect.height,
            boxShadow: '0 0 0 4px rgba(var(--copilot-accent-rgb, 59, 130, 246), 0.3), 0 0 20px rgba(var(--copilot-accent-rgb, 59, 130, 246), 0.5)'
          }}
        />
      )}

      {/* Clickable area for interactive steps */}
      {paddedRect && step.requiresClick && (
        <div
          className="absolute cursor-pointer"
          style={{
            left: paddedRect.left,
            top: paddedRect.top,
            width: paddedRect.width,
            height: paddedRect.height,
            zIndex: 10001
          }}
          onClick={() => {
            const element = document.querySelector(step.selector) as HTMLElement
            if (element) element.click()
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute bg-copilot-bg border border-copilot-border rounded-xl shadow-2xl p-4 w-80"
        style={{
          ...tooltipStyle,
          zIndex: 10000
        }}
      >
        {/* Arrow indicator */}
        <div 
          className={`absolute w-3 h-3 bg-copilot-bg border-copilot-border rotate-45 ${
            currentPosition === 'right' ? '-left-1.5 border-l border-b' :
            currentPosition === 'left' ? '-right-1.5 border-r border-t' :
            currentPosition === 'bottom' ? '-top-1.5 left-1/2 -translate-x-1/2 border-l border-t' :
            '-bottom-1.5 left-1/2 -translate-x-1/2 border-r border-b'
          }`}
          style={
            (currentPosition === 'left' || currentPosition === 'right') && arrowOffset !== null
              ? { top: arrowOffset, transform: 'translateY(-50%) rotate(45deg)' }
              : undefined
          }
        />

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-3">
          {tourSteps.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === currentStep
                  ? 'w-4 bg-copilot-accent'
                  : index < currentStep
                  ? 'w-1.5 bg-copilot-accent/50'
                  : 'w-1.5 bg-copilot-border'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-copilot-text mb-2">
          {step.title}
        </h3>
        <p className="text-sm text-copilot-text-muted leading-relaxed mb-4">
          {currentDescription}
        </p>

        {/* Click instruction for interactive steps */}
        {step.requiresClick && waitingForClick && (
          <div className="mb-4 py-2 px-3 bg-copilot-accent/10 border border-copilot-accent/30 rounded-lg">
            <p className="text-sm text-copilot-accent font-medium text-center">
              Click the highlighted element to continue
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs text-copilot-text-muted hover:text-copilot-text transition-colors"
          >
            Skip tour
          </button>

          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={handlePrevious}>
                Back
              </Button>
            )}
            {!(step.requiresClick && waitingForClick) && (
              <Button variant="primary" size="sm" onClick={handleNext}>
                {isLastStep ? 'Finish' : 'Next'}
              </Button>
            )}
          </div>
        </div>

        {/* Step counter */}
        <div className="text-center text-xs text-copilot-text-muted mt-3">
          {currentStep + 1} of {tourSteps.length}
        </div>
      </div>

      {/* Fallback message if element not found */}
      {!targetRect && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-copilot-bg border border-copilot-border rounded-xl shadow-2xl p-6 w-96 text-center">
          <h3 className="text-lg font-semibold text-copilot-text mb-2">
            {step.title}
          </h3>
          <p className="text-sm text-copilot-text-muted leading-relaxed mb-4">
            {step.description}
          </p>
          <p className="text-xs text-copilot-warning mb-4">
            (Element not visible in current view)
          </p>
          <div className="flex justify-center gap-2">
            {currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={handlePrevious}>
                Back
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={handleNext}>
              {isLastStep ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  return createPortal(overlayContent, document.body)
}

export default SpotlightTour
