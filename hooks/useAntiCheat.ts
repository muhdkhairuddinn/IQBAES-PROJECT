
import { useState, useEffect, useCallback, useRef } from 'react';
import { violationService } from '../services/violationService';

interface ViolationDetails {
  type: string;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface AntiCheatOptions {
  examId?: string;
  sessionId?: string;
  enableWarnings?: boolean;
  userRole?: string;
  isDisabled?: boolean; // New option to disable anti-cheat monitoring (e.g., when session is invalidated)
}

export const useAntiCheat = (onDetect: (violation: string) => void, options: AntiCheatOptions = {}) => {
  const [violationCount, setViolationCount] = useState(0);
  const [violations, setViolations] = useState<ViolationDetails[]>([]);
  const [lastWarningTime, setLastWarningTime] = useState(0);
  const onDetectRef = useRef(onDetect);
  const logViolationRef = useRef<((type: string, message: string, severity?: 'low' | 'medium' | 'high' | 'critical') => void) | null>(null);
  const { examId, sessionId, enableWarnings = true, userRole, isDisabled = false } = options;

  // Check for legitimate navigation flag (set when user confirms leaving exam)
  const isLegitimateNavigation = () => {
    return sessionStorage.getItem('iqbaes-legitimate-navigation') === 'true';
  };

  // Only activate anti-cheat for students and when not disabled
  const isActive = userRole === 'student' && !isDisabled;

  // NOTE: Always call hooks in the same order - never use early return
  // This ensures React's Rules of Hooks are followed

  // Update the ref when onDetect changes
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  // Enhanced violation logging with server integration
  const logViolation = useCallback((type: string, message: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') => {
    // Don't log violations if anti-cheat is disabled (e.g., session invalidated)
    if (isDisabled) {
      return;
    }
    
    // Don't log violations if user has confirmed legitimate navigation
    if (isLegitimateNavigation()) {
      return;
    }
    
    const now = Date.now();
    const violation: ViolationDetails = {
      type,
      message,
      timestamp: new Date().toISOString(),
      severity
    };
    
    console.log('🚨 Anti-cheat violation detected:', violation);
    
    setViolations(prev => {
      const newViolations = [...prev, violation];
      const newCount = newViolations.length;
      
      // Record violation to server
      violationService.recordViolation({
        ...violation,
        sessionId,
        examId
      }, newCount);
      
      return newViolations;
    });
    
    setViolationCount(prev => {
      const newCount = prev + 1;
      
      // Show user-friendly warning with throttling (max once every 3 seconds)
      if (enableWarnings && now - lastWarningTime > 3000) {
        setLastWarningTime(now);
        
        // Call the detection callback with a user-friendly message
        if (onDetectRef.current) {
          let userMessage = '';
          switch (severity) {
            case 'critical':
              userMessage = `⚠️ Critical violation detected! Please focus on your exam.`;
              break;
            case 'high':
              userMessage = `⚠️ Please stay focused on your exam. Violations: ${newCount}`;
              break;
            default:
              userMessage = `ℹ️ Please keep your attention on the exam.`;
          }
          onDetectRef.current(userMessage);
        }
      }
      
      return newCount;
    });
  }, [examId, sessionId, enableWarnings, lastWarningTime, isDisabled]);

  // Update logViolation ref
  useEffect(() => {
    logViolationRef.current = logViolation;
  }, [logViolation]);

  // Store isDisabled in a ref so event handlers can check it
  // Event handlers will check legitimate navigation flag directly via isLegitimateNavigation()
  const isDisabledRef = useRef(isDisabled);
  useEffect(() => {
    isDisabledRef.current = isDisabled;
  }, [isDisabled]);

  // Separate useEffect for event listeners to prevent state reset when onDetect changes
  useEffect(() => {
    // Debug logging
    console.log('🔍 useAntiCheat useEffect - Setting up event listeners:', {
      isActive,
      isDisabled,
      isLegitimateNavigation: isLegitimateNavigation(),
      userRole,
      examId,
      sessionId
    });
    
    // Don't set up event listeners if disabled or if legitimate navigation is in progress
    if (isDisabled || isLegitimateNavigation()) {
      console.log('⚠️ Anti-cheat event listeners NOT set up - disabled or legitimate navigation');
      return;
    }
    
    if (!isActive) {
      console.log('⚠️ Anti-cheat event listeners NOT set up - not active (userRole:', userRole, ')');
      return;
    }
    
    console.log('✅ Setting up anti-cheat event listeners');
    
    // Track user behavior patterns
    let mouseMovementCount = 0;
    let keystrokeCount = 0;
    let lastActivityTime = Date.now();
    let windowFocusCount = 0;
    let textSelectionCount = 0;
    let textSelectionResetTimeout: NodeJS.Timeout | null = null;
    const TEXT_SELECTION_THRESHOLD = 15; // Increased from 3 to 15 - allow more rapid selections
    const TEXT_SELECTION_WINDOW_MS = 5000; // 5 second window - only count rapid selections within this time
    const TEXT_SELECTION_RESET_MS = 3000; // Reset counter after 3 seconds of inactivity
    let resizeCount = 0;
    
    // Track window state to prevent repeated violation logging
    let wasDocumentHidden = document.hidden;
    let hasLoggedBlurViolation = false;
    let mouseOutsideTimeout: NodeJS.Timeout | null = null;
    let lastMousePosition = { x: 0, y: 0 };
    let isMouseOverExamArea = true;

    // Helper function to check if mouse is over exam content or allowed UI areas
    const isMouseOverExamContent = (x: number, y: number): boolean => {
      // IMPORTANT: If legitimate navigation is in progress, always allow mouse movement
      // This prevents false positives when user is clicking "Leave Exam" modal buttons
      if (isLegitimateNavigation()) {
        return true;
      }
      
      // Get the exam container element
      const examContainer = document.querySelector('[data-exam-container]');
      if (!examContainer) {
        // If no exam container found, assume mouse is over content
        return true;
      }
      
      // Get element at mouse position
      const elementAtPoint = document.elementFromPoint(x, y);
      if (!elementAtPoint) {
        return false;
      }
      
      // Check if element is in a modal (Leave Exam modal, etc.)
      // Modals are typically rendered with high z-index and fixed positioning
      // Use data attribute for reliable detection (more reliable than class names)
      const isInLeaveExamModal = elementAtPoint.closest('[data-leave-exam-modal="true"]') !== null;
      
      // Check for modal by dialog role
      const isInDialogModal = elementAtPoint.closest('[role="dialog"]') !== null;
      
      // Check for modal by text content (Leave Exam modal has specific text)
      // Check parent elements to catch buttons and text inside the modal
      const isLeaveExamModalByText = elementAtPoint.closest('div')?.textContent?.includes('Leave Exam') ||
                                     elementAtPoint.closest('div')?.textContent?.includes('Are you sure you want to leave') ||
                                     elementAtPoint.closest('button')?.textContent?.includes('Leave Exam') ||
                                     elementAtPoint.closest('button')?.textContent?.includes('Yes, Leave Exam') ||
                                     elementAtPoint.textContent?.includes('Leave Exam');
      
      // Check if element is in a fixed overlay with high z-index (modal overlay)
      const modalOverlay = elementAtPoint.closest('.fixed.inset-0');
      const computedZIndex = modalOverlay ? parseInt(window.getComputedStyle(modalOverlay).zIndex) : 0;
      const isInModalOverlay = modalOverlay !== null && computedZIndex >= 9999;
      
      // Check if element is in any modal (Leave Exam modal, dialog, or high z-index overlay)
      const isInModal = isInLeaveExamModal || isInDialogModal || isLeaveExamModalByText || isInModalOverlay;
      
      // If in modal, always allow (legitimate navigation)
      if (isInModal) {
        return true;
      }
      
      // Check if the element is within the exam container or its children
      const isInExamContainer = examContainer.contains(elementAtPoint);
      
      // Also check if element is in the header/navbar (should be allowed)
      // The header/navbar is part of the Layout component, not the exam container
      // Check for various header/navbar indicators:
      const navElement = elementAtPoint.closest('nav');
      const headerElement = elementAtPoint.closest('header');
      const headerContainer = elementAtPoint.closest('.bg-white.shadow-sm'); // Layout header container
      const isNavButton = elementAtPoint.closest('button') && 
                         (elementAtPoint.textContent?.includes('Dashboard') || 
                          elementAtPoint.textContent?.includes('Feedback') ||
                          elementAtPoint.closest('nav') !== null);
      
      // Check if mouse is in the top navigation area (first 64px typically for header)
      const isInTopNavArea = y <= 64 && (navElement !== null || headerElement !== null || headerContainer !== null);
      
      // Allow if in exam container OR in header/navbar area OR in modal
      return isInExamContainer || navElement !== null || headerElement !== null || headerContainer !== null || isNavButton || isInTopNavArea || isInModal;
    };

    // Define event handlers inside useEffect to have access to current logViolation
    const handleVisibilityChange = () => {
      console.log('👁️ Visibility change detected:', {
        hidden: document.hidden,
        wasHidden: wasDocumentHidden,
        isDisabled: isDisabledRef.current,
        isLegitimate: isLegitimateNavigation()
      });
      
      // Don't log if disabled or if legitimate navigation is in progress
      if (isDisabledRef.current || isLegitimateNavigation()) {
        console.log('⚠️ Visibility change ignored - disabled or legitimate navigation');
        // Still reset flags even if disabled, to keep state consistent
        if (!document.hidden && wasDocumentHidden) {
          hasLoggedBlurViolation = false;
          isMouseOverExamArea = true;
          // Clear any pending mouse timeout when returning to exam
          if (mouseOutsideTimeout) {
            clearTimeout(mouseOutsideTimeout);
            mouseOutsideTimeout = null;
          }
        }
        wasDocumentHidden = document.hidden;
        return;
      }
      
      // Only log violation when transitioning from visible to hidden (user switches tab/window)
      // Log immediately for fast detection, but cancel if user returns quickly (false positive)
      if (document.hidden && !wasDocumentHidden && logViolationRef.current) {
        console.log('👁️ Document hidden - tab switch detected, logging immediately...');
        
        // Log immediately for fast detection (no delay)
        // If user returns quickly, we'll cancel it
        if (!hasLoggedBlurViolation && logViolationRef.current) {
          console.log('🚨 Logging window switch violation (immediate detection)');
          logViolationRef.current('window_switch', 'Exam Window Switched Away', 'high');
          hasLoggedBlurViolation = true;
          // Clear any pending mouse timeout since we're logging via visibilitychange
          if (mouseOutsideTimeout) {
            clearTimeout(mouseOutsideTimeout);
            mouseOutsideTimeout = null;
          }
        }
        
        // Set a short timeout to check if it was a false positive (user returned quickly)
        // If they return within 500ms, it might be a system notification or brief event
        const falsePositiveCheckTimeout = setTimeout(() => {
          // If document is visible again within 500ms, it was likely a false positive
          // But we've already logged it, so we can't undo it - this is just for logging
          if (!document.hidden) {
            console.log('⚠️ Document visible again quickly - might have been a false positive');
          }
        }, 500); // Short check for false positives
        
        // Store timeout so we can clear it if document becomes visible quickly
        if (typeof window !== 'undefined') {
          (window as any).__falsePositiveCheckTimeout = falsePositiveCheckTimeout;
        }
      }
      
      // Reset flag when document becomes visible again
      if (!document.hidden && wasDocumentHidden) {
        // Clear any pending false positive check
        if (typeof window !== 'undefined' && (window as any).__falsePositiveCheckTimeout) {
          clearTimeout((window as any).__falsePositiveCheckTimeout);
          (window as any).__falsePositiveCheckTimeout = null;
        }
        // Reset violation flag for next tab switch
        hasLoggedBlurViolation = false;
        isMouseOverExamArea = true; // Reset mouse tracking
        // Clear any pending mouse timeout when returning to exam
        if (mouseOutsideTimeout) {
          clearTimeout(mouseOutsideTimeout);
          mouseOutsideTimeout = null;
        }
      }
      
      wasDocumentHidden = document.hidden;
    };

    const handleWindowFocus = () => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      windowFocusCount++;
      if (windowFocusCount > 3 && logViolationRef.current) {
        logViolationRef.current('window_focus', 'Frequent Window Focus Changes', 'medium');
      }
      // Reset mouse tracking when window regains focus
      isMouseOverExamArea = true;
      if (mouseOutsideTimeout) {
        clearTimeout(mouseOutsideTimeout);
        mouseOutsideTimeout = null;
      }
    };

    const handleWindowBlur = () => {
      console.log('👁️ Window blur detected');
      
      if (isDisabledRef.current || isLegitimateNavigation()) {
        console.log('⚠️ Window blur ignored - disabled or legitimate navigation');
        return;
      }
      
      // When window loses focus, check if it's a real window/tab switch
      // Use a short delay to see if focus returns quickly (false positive)
      setTimeout(() => {
        if (isDisabledRef.current || isLegitimateNavigation()) {
          console.log('⚠️ Window blur timeout ignored - disabled or legitimate navigation');
          return;
        }
        
        // Don't log blur violations - visibilitychange handles tab switches more reliably
        // Blur events are too noisy (browser UI clicks, system notifications, etc.)
        // The visibilitychange handler with 2-second delay will catch real tab switches
        // Just track state here, don't log violations
      }, 100);
      
      lastActivityTime = Date.now();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't monitor if disabled or if legitimate navigation is in progress
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      
      keystrokeCount++;
      lastActivityTime = Date.now();

      // Block common cheating shortcuts
      if (
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'a' || e.key === 'f' || e.key === 's' || e.key === 'p')) ||
        (e.altKey && e.key === 'Tab') ||
        (e.altKey && e.key === 'F4') ||
        e.key === 'F12' ||
        e.key === 'F5' ||
        e.key === 'F11' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        (e.ctrlKey && e.shiftKey && e.key === 'C') ||
        (e.ctrlKey && e.key === 'u') ||
        (e.ctrlKey && e.key === 'h') ||
        (e.ctrlKey && e.key === 'g') ||
        (e.ctrlKey && e.key === 'r') ||
        (e.ctrlKey && e.key === 't') ||
        (e.ctrlKey && e.key === 'n') ||
        (e.ctrlKey && e.key === 'w') ||
        (e.ctrlKey && e.key === 'l') ||
        (e.ctrlKey && e.key === 'd') ||
        (e.ctrlKey && e.key === 'z') ||
        (e.ctrlKey && e.key === 'y')
      ) {
        e.preventDefault();
        const shortcut = `${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`;
        const message = `${shortcut}`;
        if (logViolationRef.current) {
          const severity = (e.key === 'F12' || (e.ctrlKey && e.shiftKey) || e.key === 'F11') ? 'critical' : 'high';
          logViolationRef.current('keyboard_shortcut', message, severity);
        }
      }

    };

    const handleMouseMove = (e: MouseEvent) => {
      // Only log first few mouse moves to avoid spam
      if (mouseMovementCount < 3) {
        console.log('🖱️ Mouse move detected:', {
          x: e.clientX,
          y: e.clientY,
          isDisabled: isDisabledRef.current,
          isLegitimate: isLegitimateNavigation()
        });
      }
      
      if (isDisabledRef.current || isLegitimateNavigation()) {
        if (mouseMovementCount < 3) {
          console.log('⚠️ Mouse move ignored - disabled or legitimate navigation');
        }
        return;
      }
      
      mouseMovementCount++;
      lastActivityTime = Date.now();
      lastMousePosition = { x: e.clientX, y: e.clientY };
      
      // Check if mouse is over exam content area
      const isOverExam = isMouseOverExamContent(e.clientX, e.clientY);
      
      // Clear any pending timeout if mouse returns to exam area
      if (isOverExam) {
        isMouseOverExamArea = true;
        if (mouseOutsideTimeout) {
          clearTimeout(mouseOutsideTimeout);
          mouseOutsideTimeout = null;
        }
      } else {
        // Mouse is outside exam area
        isMouseOverExamArea = false;
        
        // Check if mouse is in browser chrome area (very top, y <= 2px)
        // This is a strong indicator of tab switching, so log immediately (no delay)
        const elementAtPos = document.elementFromPoint(e.clientX, e.clientY);
        const isInOurHeader = elementAtPos && (
          elementAtPos.closest('nav') !== null ||
          elementAtPos.closest('header') !== null ||
          elementAtPos.closest('.bg-white.shadow-sm') !== null ||
          elementAtPos.closest('[data-leave-exam-modal="true"]') !== null
        );
        
        // If mouse is in browser chrome area (y <= 2px) and not in our header, log immediately
        // This catches fast tab switches that might not trigger visibilitychange
        if (!isInOurHeader && e.clientY <= 2 && logViolationRef.current && 
            !isDisabledRef.current && !isLegitimateNavigation() && !document.hidden) {
          // Clear any pending timeout since we're logging immediately
          if (mouseOutsideTimeout) {
            clearTimeout(mouseOutsideTimeout);
            mouseOutsideTimeout = null;
          }
          logViolationRef.current('mouse_outside', 'Mouse moved to browser chrome area (possible tab switch attempt)', 'high');
          return; // Don't set timeout for browser chrome area
        }
        
        // For other areas outside exam, use a shorter timeout (200ms instead of 500ms)
        // This catches fast movements while still preventing false positives
        if (!mouseOutsideTimeout) {
          mouseOutsideTimeout = setTimeout(() => {
            if (isDisabledRef.current || isLegitimateNavigation()) return;
            
            // Double-check that mouse is still outside and document is still visible
            // (if document is hidden, visibilitychange will handle it)
            if (!isMouseOverExamContent(lastMousePosition.x, lastMousePosition.y) && 
                !document.hidden && 
                logViolationRef.current) {
              
              // Check if mouse is in the very top area (browser tabs/chrome, not our header)
              const elementAtPos = document.elementFromPoint(lastMousePosition.x, lastMousePosition.y);
              const isInOurHeader = elementAtPos && (
                elementAtPos.closest('nav') !== null ||
                elementAtPos.closest('header') !== null ||
                elementAtPos.closest('.bg-white.shadow-sm') !== null ||
                elementAtPos.closest('[data-leave-exam-modal="true"]') !== null
              );
              
              if (!isInOurHeader && lastMousePosition.y <= 2) {
                // Mouse is in browser chrome area (above our header)
                logViolationRef.current('mouse_outside', 'Mouse moved to browser chrome area (possible tab switch attempt)', 'high');
              } else if (!isInOurHeader) {
                // Mouse is outside exam area but not in browser chrome or our header
                // This could be sidebar, other browser UI, etc.
                logViolationRef.current('mouse_outside', 'Mouse moved outside exam area', 'medium');
              }
              // If isInOurHeader is true, don't log anything - user is just using the navbar
            }
            
            mouseOutsideTimeout = null;
          }, 200); // Reduced to 200ms for faster detection while still preventing false positives
        }
      }
    };
    
    // Monitor document-level mouse movements to detect when mouse leaves exam area
    const handleDocumentMouseOut = (e: MouseEvent) => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      
      // Check if mouse is leaving the document entirely (moving to browser chrome/tabs)
      // relatedTarget will be null when mouse leaves the document
      const relatedTarget = e.relatedTarget;
      
      // Check if mouse is over header/navbar - if so, don't trigger violation
      const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
      const isInHeader = elementAtPoint && (
        elementAtPoint.closest('nav') !== null ||
        elementAtPoint.closest('header') !== null ||
        elementAtPoint.closest('.bg-white.shadow-sm') !== null
      );
      
      // Mouse is leaving the document (going to browser chrome, another window, etc.)
      if (!relatedTarget && !isInHeader) {
        // Check if mouse is in the top area (browser tabs/chrome) - but not in our header
        // y <= 0 means top of viewport, but we need to be above our header (which is ~64px)
        // So check if y is very close to 0 (negative or 0-2px) which indicates browser chrome
        if (e.clientY <= 2) {
          // Mouse moved to top of window (likely browser tabs/chrome, not our header)
          isMouseOverExamArea = false;
          
          if (!mouseOutsideTimeout && logViolationRef.current) {
            mouseOutsideTimeout = setTimeout(() => {
              if (isDisabledRef.current || isLegitimateNavigation()) return;
              // Only log if document is still visible (not switched tabs yet)
              // If tab is switched, visibilitychange will handle it
              if (!document.hidden && logViolationRef.current) {
                logViolationRef.current('mouse_outside', 'Mouse moved to browser chrome area (possible tab switch attempt)', 'high');
              }
              mouseOutsideTimeout = null;
            }, 300);
          }
        }
      }
    };

    const handleClick = (e: MouseEvent) => {
      lastActivityTime = Date.now();
    };

    const handleTextSelection = (e: Event) => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      
      // Clear any existing reset timeout
      if (textSelectionResetTimeout) {
        clearTimeout(textSelectionResetTimeout);
        textSelectionResetTimeout = null;
      }
      
      textSelectionCount++;
      
      // Only log violation if threshold exceeded within the time window
      // This allows legitimate rapid selections (e.g., quickly answering multiple questions)
      if (textSelectionCount > TEXT_SELECTION_THRESHOLD && logViolationRef.current) {
        logViolationRef.current('text_selection', 'Excessive Text Selection', 'low'); // Reduced severity to 'low'
        textSelectionCount = 0; // Reset after logging
      }
      
      // Reset counter after period of inactivity (allows normal exam-taking behavior)
      textSelectionResetTimeout = setTimeout(() => {
        textSelectionCount = 0;
        textSelectionResetTimeout = null;
      }, TEXT_SELECTION_RESET_MS);
    };


    const handleResize = (e: Event) => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      resizeCount++;
      if (resizeCount > 2 && logViolationRef.current) {
        logViolationRef.current('window_resize', 'Window Resize Detected', 'medium');
      }
    };


    const handleDragStart = (e: DragEvent) => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      e.preventDefault();
      if (logViolationRef.current) {
        logViolationRef.current('drag_attempt', 'Drag Operation Attempted', 'high');
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      e.preventDefault();
      if (logViolationRef.current) {
        logViolationRef.current('drop_attempt', 'Drop Operation Attempted', 'high');
      }
    };

    const preventAndLog = (e: Event, type: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      e.preventDefault();
      let message = '';
      
      switch(type) {
        case 'Copy':
          message = 'Copy';
          break;
        case 'Paste':
          message = 'Paste';
          break;
        case 'Right-click':
          message = 'Right-click';
          break;
        case 'Print':
          message = 'Print';
          break;
        case 'Save':
          message = 'Save';
          break;
        default:
          message = type;
      }
      
      if (logViolationRef.current) {
        logViolationRef.current(type.toLowerCase().replace(' ', '_'), message, severity);
      }
    };

    const handleCopy = (e: Event) => preventAndLog(e, 'Copy', 'critical');
    const handlePaste = (e: Event) => preventAndLog(e, 'Paste', 'critical');
    const handleContextMenu = (e: Event) => preventAndLog(e, 'Right-click', 'medium');
    const handlePrint = (e: Event) => preventAndLog(e, 'Print', 'high');
    const handleSave = (e: Event) => preventAndLog(e, 'Save', 'high');

    // Monitor for developer tools (basic detection)
    const checkDevTools = () => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      const threshold = 160;
      if (window.outerHeight - window.innerHeight > threshold || 
          window.outerWidth - window.innerWidth > threshold) {
        if (logViolationRef.current) {
          logViolationRef.current('dev_tools', 'Developer Tools Detected', 'critical');
        }
      }
    };

    // Periodic checks for suspicious behavior
    const periodicCheck = setInterval(() => {
      if (isDisabledRef.current || isLegitimateNavigation()) return;
      checkDevTools();
      
      // Check for inactivity (potential external help)
      const now = Date.now();
      if (now - lastActivityTime > 300000) { // 5 minutes of inactivity
        if (logViolationRef.current) {
          logViolationRef.current('inactivity', 'Extended Inactivity Detected', 'medium');
        }
        lastActivityTime = now; // Reset to avoid spam
      }
    }, 30000); // Check every 30 seconds

    // Add event listeners
    console.log('✅ Attaching anti-cheat event listeners...');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseout', handleDocumentMouseOut, true); // Use capture phase
    document.addEventListener('click', handleClick);
    document.addEventListener('selectstart', handleTextSelection);
    window.addEventListener('resize', handleResize);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('beforeprint', handlePrint);
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's') handleSave(e);
    });
    console.log('✅ All anti-cheat event listeners attached successfully');
  
    return () => {
      clearInterval(periodicCheck);
      if (mouseOutsideTimeout) {
        clearTimeout(mouseOutsideTimeout);
      }
      // Cleanup text selection reset timeout
      if (textSelectionResetTimeout) {
        clearTimeout(textSelectionResetTimeout);
        textSelectionResetTimeout = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseout', handleDocumentMouseOut, true);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('selectstart', handleTextSelection);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('beforeprint', handlePrint);
    };
  }, [isDisabled]); // Re-run when isDisabled changes to clean up listeners

  // Return simple violation count and violations
  // Always return the same structure, regardless of isActive state
  // This ensures React hooks are always called in the same order
  return {
    violationsCount: isActive ? violationCount : 0,
    violations: isActive ? violations : [],
    detailedViolations: isActive ? violations : [],
    logViolation: isActive ? logViolation : () => {} // Empty function when inactive
  };
};
