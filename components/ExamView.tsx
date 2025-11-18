import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Exam, Question, QuestionType, UserAnswer, User } from '../types';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { useAntiCheat } from '../hooks/useAntiCheat';
import { useAuth } from '../contexts/AuthContext';

interface ExamViewProps {
  exam: Exam;
  courseName: string;
  user: User;
  onSubmit: (answers: UserAnswer[], exam: Exam) => void;
}

// CRITICAL: Timer must use actual session startTime, not just exam duration
// This ensures student and lecturer see the same time remaining
const Timer: React.FC<{ 
  initialMinutes: number, 
  onTimeUp: () => void,
  startTime?: Date | string, // Actual session start time from backend
  examDuration?: number // Exam duration in minutes
}> = ({ initialMinutes, onTimeUp, startTime, examDuration }) => {
    // CRITICAL: Calculate time remaining based on ACTUAL session startTime
    // This ensures the timer reflects the real exam time, not a reset timer
    const calculateTimeRemaining = useCallback(() => {
      if (startTime && examDuration) {
        const start = new Date(startTime);
        const now = new Date();
        const elapsedMs = now.getTime() - start.getTime();
        const totalMs = examDuration * 60 * 1000;
        const remainingMs = Math.max(0, totalMs - elapsedMs);
        const remainingSeconds = Math.floor(remainingMs / 1000);
        return remainingSeconds;
      }
      // Fallback: If no startTime yet, return null to indicate we're waiting
      // This prevents the timer from showing incorrect time
      return null;
    }, [startTime, examDuration]);

    // Initialize with fallback countdown, but will update when startTime is available
    const validInitialMinutes = typeof initialMinutes === 'number' && !isNaN(initialMinutes) && initialMinutes > 0 ? initialMinutes : 60;
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [fallbackStartTime, setFallbackStartTime] = useState<number | null>(null);

    // CRITICAL: When startTime becomes available, switch to real-time calculation
    // When startTime is not available yet, use a fallback countdown from when component mounted
    useEffect(() => {
      if (startTime && examDuration) {
        // Real startTime available - calculate based on actual elapsed time
        const start = new Date(startTime);
        const now = new Date();
        const elapsedMs = now.getTime() - start.getTime();
        const totalMs = examDuration * 60 * 1000;
        const remainingMs = Math.max(0, totalMs - elapsedMs);
        const remainingSeconds = Math.floor(remainingMs / 1000);
        setTimeLeft(remainingSeconds);
        setFallbackStartTime(null); // Clear fallback
      } else if (fallbackStartTime === null && timeLeft === null) {
        // No startTime yet, initialize fallback countdown
        const now = Date.now();
        setFallbackStartTime(now);
        setTimeLeft(validInitialMinutes * 60);
      }
    }, [startTime, examDuration, validInitialMinutes, fallbackStartTime, timeLeft]);

    // Update timer every second - either from real startTime or fallback
    useEffect(() => {
        const timerId = setInterval(() => {
            if (startTime && examDuration) {
                // Use real startTime calculation
                const start = new Date(startTime);
                const now = new Date();
                const elapsedMs = now.getTime() - start.getTime();
                const totalMs = examDuration * 60 * 1000;
                const remainingMs = Math.max(0, totalMs - elapsedMs);
                const remainingSeconds = Math.floor(remainingMs / 1000);
                setTimeLeft(remainingSeconds);
            } else if (fallbackStartTime !== null && timeLeft !== null) {
                // Use fallback countdown (counts down from initial mount)
                const elapsedMs = Date.now() - fallbackStartTime;
                const totalMs = validInitialMinutes * 60 * 1000;
                const remainingMs = Math.max(0, totalMs - elapsedMs);
                const remainingSeconds = Math.floor(remainingMs / 1000);
                setTimeLeft(remainingSeconds);
            }
            
            if (timeLeft !== null && timeLeft <= 0) {
                onTimeUp();
            }
        }, 1000);

        return () => clearInterval(timerId);
    }, [startTime, examDuration, fallbackStartTime, validInitialMinutes, timeLeft, onTimeUp]);

    // Handle null timeLeft (shouldn't happen, but safety check)
    if (timeLeft === null) {
        return (
            <div className="flex items-center space-x-2 font-mono text-lg font-semibold px-4 py-2 rounded-lg text-slate-700 bg-slate-200">
                <Icon path="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6"/>
                <span>Loading...</span>
            </div>
        );
    }

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <div className={`flex items-center space-x-2 font-mono text-lg font-semibold px-4 py-2 rounded-lg ${timeLeft < 60 ? 'text-red-600 bg-red-100' : 'text-slate-700 bg-slate-200'}`}>
            <Icon path="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6"/>
            <span>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
        </div>
    );
};

const QuestionCard: React.FC<{
    question: Question;
    questionNumber: number;
    totalQuestions: number;
    onAnswer: (answer: string | boolean) => void;
    currentAnswer: UserAnswer | undefined;
}> = ({ question, questionNumber, totalQuestions, onAnswer, currentAnswer }) => {
    
    const renderQuestionBody = () => {
        switch(question.type) {
            case QuestionType.MultipleChoice:
                return (
                    <div className="space-y-3 mt-4">
                        {question.options?.map((option, index) => (
                            <label key={index} className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${currentAnswer?.answer === option ? 'bg-indigo-100 border-indigo-500' : 'bg-white hover:bg-slate-50 border-slate-200'}`}>
                                <input type="radio" name={question.id} value={option} checked={currentAnswer?.answer === option} onChange={e => onAnswer(e.target.value)} className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-slate-300"/>
                                <span className="ml-4 text-slate-700">{option}</span>
                            </label>
                        ))}
                    </div>
                );
            case QuestionType.TrueFalse:
                 return (
                    <div className="flex space-x-4 mt-4">
                        {[true, false].map((option) => (
                            <label key={String(option)} className={`flex-1 flex items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${currentAnswer?.answer === option ? 'bg-indigo-100 border-indigo-500' : 'bg-white hover:bg-slate-50 border-slate-200'}`}>
                                <input type="radio" name={question.id} value={String(option)} checked={currentAnswer?.answer === option} onChange={() => onAnswer(option)} className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-slate-300"/>
                                <span className="ml-4 text-slate-700 font-semibold">{option ? 'True' : 'False'}</span>
                            </label>
                        ))}
                    </div>
                );
            case QuestionType.ShortAnswer:
            case QuestionType.Essay:
                return (
                     <div className="mt-4">
                        <textarea
                            value={typeof currentAnswer?.answer === 'string' ? currentAnswer.answer : ''}
                            onChange={e => onAnswer(e.target.value)}
                            className="w-full p-3 border-2 border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition"
                            placeholder={question.type === QuestionType.Essay ? "Write your detailed essay answer here..." : "Type your answer here..."}
                            rows={question.type === QuestionType.Essay ? 8 : 4}
                        />
                     </div>
                );
            default:
                return null;
        }
    }
    
    return (
        <div className="bg-white p-8 rounded-2xl shadow-lg">
            <p className="text-sm font-semibold text-indigo-600">Question {questionNumber} of {totalQuestions} ({question.points} points)</p>
            <p className="mt-2 text-xl text-slate-800">{question.question || question.text}</p>
            {renderQuestionBody()}
        </div>
    )
};

export const ExamView: React.FC<ExamViewProps> = ({ exam, courseName, user, onSubmit }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<UserAnswer[]>(() => (exam?.questions || []).map(q => ({ questionId: q.id, answer: null })));
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null); // Store actual session startTime
  
  const { refreshData, startExamSession } = useAuth();
  
  // CRITICAL: Store the REAL MongoDB sessionId from backend (not client-generated)
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Keep a ref of sessionId for latest value inside socket handlers
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  
  // CRITICAL: Queue for progress updates that arrive before sessionId is ready
  const progressQueueRef = useRef<Array<{ currentQuestion: number; totalQuestions: number }>>([]);
  
  // CRITICAL: Store socket instance in ref so progress update effect can access it
  const socketRef = useRef<any>(null);
  
  // Track if user is leaving the exam legitimately (declared early for use in session start effect)
  const [isLeavingExam, setIsLeavingExam] = useState(false);
  
  // Track if session is invalidated
  const [isSessionInvalidated, setIsSessionInvalidated] = useState(false);
  
  // Track if we've already started a session to prevent duplicate starts
  const sessionStartedRef = useRef(false);
  
  // Auto-start exam session on mount for students (only once per exam)
  useEffect(() => {
    // CRITICAL: Only start session once per exam, not on every remount
    // This prevents duplicate exam_start logs when user navigates away and back
    if (sessionStartedRef.current || isLeavingExam) {
      return;
    }
    
    let cancelled = false;
    const ensureSessionStarted = async () => {
      try {
        if (user.role === 'student' && !sessionStartedRef.current) {
          sessionStartedRef.current = true; // Mark as started immediately to prevent duplicates
          
          const result = await startExamSession(exam.id, exam.title);
          
          const sessionIdValue = result?.sessionId;
          const startTimeValue = result?.startTime;
          
          if (sessionIdValue && !cancelled) {
            setSessionId(String(sessionIdValue));
            
            // Process queued progress updates
            if (progressQueueRef.current.length > 0 && socketRef.current?.connected) {
              progressQueueRef.current.forEach((queuedUpdate) => {
                socketRef.current.emit('student_progress_update', {
                  sessionId: sessionIdValue,
                  examId: exam.id,
                  currentQuestion: queuedUpdate.currentQuestion,
                  totalQuestions: queuedUpdate.totalQuestions,
                  timestamp: new Date().toISOString(),
                  userId: user.id,
                  userName: user.name || user.username
                });
              });
              progressQueueRef.current = [];
            }
          } else if (cancelled) {
            // If cancelled, reset the flag so it can be started again if needed
            sessionStartedRef.current = false;
          }
          
          if (startTimeValue && !cancelled) {
            const startTime = new Date(startTimeValue);
            if (!isNaN(startTime.getTime())) {
              setSessionStartTime(startTime);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to auto-start exam session:', err);
          // Reset flag on error so it can be retried
          sessionStartedRef.current = false;
        }
      }
    };
    ensureSessionStarted();
    return () => { cancelled = true; };
  }, [exam.id, exam.title, startExamSession, user.role, isLeavingExam]);
  
  // Reset session started flag when exam changes or component unmounts
  useEffect(() => {
    return () => {
      sessionStartedRef.current = false;
    };
  }, [exam.id]);
  
  // Heartbeat system - track if component is mounted
  const isMountedRef = useRef(true);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // CRITICAL: Use a ref to always get the latest currentQuestionIndex
  // This prevents stale closures in the heartbeat callback
  const currentQuestionIndexRef = useRef(currentQuestionIndex);
  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);
  
  // Heartbeat function to send activity signals with REAL-TIME progress
  const sendHeartbeat = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    try {
      const token = sessionStorage.getItem('iqbaes-token');
      if (!token) return;
      
      // CRITICAL: Always use the latest currentQuestionIndex from ref
      const latestQuestionIndex = currentQuestionIndexRef.current;
      
      const heartbeatData = {
        examId: exam.id,
        sessionId: sessionId,
        currentQuestion: latestQuestionIndex, // Send current question index (0-based) - always latest
        totalQuestions: exam.questions.length // Send total questions
      };
      
      console.log('📤 Sending heartbeat with progress:', {
        currentQuestion: latestQuestionIndex,
        displayQuestion: latestQuestionIndex + 1,
        totalQuestions: exam.questions.length
      });
      
      const response = await fetch('/api/monitoring/heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(heartbeatData)
      });
      
      if (!response.ok) {
        console.warn('❌ Heartbeat failed:', response.status, response.statusText);
      } else {
        const result = await response.json();
        console.log('✅ Heartbeat sent successfully:', result);
      }
    } catch (error) {
      console.warn('Heartbeat error:', error);
    }
  }, [exam.id, exam.questions.length, sessionId]); // Removed currentQuestionIndex from deps - using ref instead
  
  // Setup heartbeat interval on component mount
  useEffect(() => {
    // Send initial heartbeat immediately
    sendHeartbeat();
    
    // Setup interval to send heartbeat every 10 seconds
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 10000);
    
    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [sendHeartbeat]);
  
  // CRITICAL: Send REAL-TIME progress update via WebSocket when question changes
  useEffect(() => {
    if (!isMountedRef.current || currentQuestionIndex < 0) return;
    
    const socketInstance = socketRef.current;
    if (!socketInstance?.connected) {
      // Queue for later if socket not ready
      progressQueueRef.current.push({
        currentQuestion: currentQuestionIndex,
        totalQuestions: exam.questions.length
      });
      return;
    }
    
    if (!sessionId) {
      // Queue for later if sessionId not ready
      progressQueueRef.current.push({
        currentQuestion: currentQuestionIndex,
        totalQuestions: exam.questions.length
      });
      return;
    }
    
    socketInstance.emit('student_progress_update', {
      sessionId: sessionId,
      examId: exam.id,
      currentQuestion: currentQuestionIndex,
      totalQuestions: exam.questions.length,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.name || user.username
    });
  }, [currentQuestionIndex, exam.id, exam.questions.length, sessionId, user.id, user.name, user.username]);
  
  // Check if user has confirmed legitimate navigation
  // Use both custom event (fast) and sessionStorage polling (backup) for reliability
  useEffect(() => {
    // IMPORTANT: Clear any stale sessionStorage flag on mount FIRST
    // This prevents anti-cheat from being disabled if the flag was left from a previous session
    const staleFlag = sessionStorage.getItem('iqbaes-legitimate-navigation');
    if (staleFlag === 'true') {
      console.log('🧹 Clearing stale legitimate navigation flag on exam start');
      sessionStorage.removeItem('iqbaes-legitimate-navigation');
    }
    
    // Ensure isLeavingExam is false on mount (in case it was set incorrectly)
    setIsLeavingExam(false);
    
    // Use a ref to track if we're already leaving (to avoid stale closures)
    const isLeavingRef = { current: false };
    
    const checkLegitimateNavigation = () => {
      // Don't check if we're already leaving
      if (isLeavingRef.current) return;
      
      const isLegitimate = sessionStorage.getItem('iqbaes-legitimate-navigation') === 'true';
      if (isLegitimate) {
        isLeavingRef.current = true;
        setIsLeavingExam(true);
        console.log('✅ Legitimate navigation detected via sessionStorage - disabling anti-cheat');
      } else {
        // If flag was cleared, make sure we're not leaving
        if (isLeavingRef.current) {
          isLeavingRef.current = false;
          setIsLeavingExam(false);
        }
      }
    };
    
    // Listen for custom event from App.tsx (faster than polling)
    const handleCustomEvent = (event: CustomEvent) => {
      if (event.detail === true) {
        isLeavingRef.current = true;
        setIsLeavingExam(true);
        console.log('✅ Legitimate navigation event received - disabling anti-cheat');
      } else if (event.detail === false) {
        // Flag was cleared - re-enable anti-cheat
        isLeavingRef.current = false;
        setIsLeavingExam(false);
        console.log('🔄 Legitimate navigation flag cleared - re-enabling anti-cheat');
      }
    };
    
    window.addEventListener('iqbaes-legitimate-navigation', handleCustomEvent as EventListener);
    
    // Start polling after a small delay to ensure stale flags are cleared first
    // Poll less frequently (500ms instead of 100ms) to reduce overhead
    let pollInterval: NodeJS.Timeout | null = null;
    const timeout = setTimeout(() => {
      pollInterval = setInterval(checkLegitimateNavigation, 500);
    }, 200);
    
    return () => {
      clearTimeout(timeout);
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      window.removeEventListener('iqbaes-legitimate-navigation', handleCustomEvent as EventListener);
    };
  }, []); // Empty dependency array - only run once on mount
  
  // Disable anti-cheat when component is unmounting (user is leaving)
  useEffect(() => {
    return () => {
      // Component is unmounting - disable anti-cheat immediately
      setIsLeavingExam(true);
    };
  }, []);
  
  // Anti-cheat integration with user-friendly notifications
  // Disable anti-cheat monitoring when session is invalidated or user is leaving
  const { violationsCount } = useAntiCheat(
    (message: string) => {
      // Don't show notifications if user is leaving
      if (isLeavingExam) {
        console.log('⚠️ Anti-cheat violation detected but user is leaving - ignoring');
        return;
      }
      
      console.log('🚨 Anti-cheat violation detected:', message);
      setNotification(message);
      // Auto-hide notification after 4 seconds
      setTimeout(() => setNotification(null), 4000);
    },
    {
      examId: exam.id,
      sessionId,
      enableWarnings: true,
      userRole: user.role,
      isDisabled: isSessionInvalidated || isLeavingExam // Disable anti-cheat when session is invalidated or user is leaving
    }
  );
  
  // Only log anti-cheat state changes when session is invalidated or user is leaving (important state changes)
  // Don't spam console with every violation count update
  const prevStateRef = useRef({ isSessionInvalidated: false, isLeavingExam: false });
  useEffect(() => {
    const prevState = prevStateRef.current;
    const hasImportantChange = 
      prevState.isSessionInvalidated !== isSessionInvalidated ||
      prevState.isLeavingExam !== isLeavingExam;
    
    if (hasImportantChange) {
      console.log('🔍 Anti-cheat state changed:', {
        isSessionInvalidated,
        isLeavingExam,
        isDisabled: isSessionInvalidated || isLeavingExam,
        userRole: user.role,
        examId: exam.id
      });
      prevStateRef.current = { isSessionInvalidated, isLeavingExam };
    }
  }, [isSessionInvalidated, isLeavingExam, user.role, exam.id]);
  
  // Listen for real-time invalidation and penalty events
  useEffect(() => {
    if (user.role !== 'student') return;
    
    let socket: any = null;
    
    const setupSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        
        const envUrl = (window as any).VITE_SOCKET_URL;
        let socketUrl = envUrl || window.location.origin;
        const port = window.location.port;
        if (!envUrl && (port === '5173' || port === '5174')) {
          socketUrl = `${window.location.protocol}//${window.location.hostname}:5000`;
        }
        
        socket = io(socketUrl, {
          path: '/socket.io',
          transports: ['websocket', 'polling']
        });
        
        // CRITICAL: Store socket in ref so progress update effect can access it
        socketRef.current = socket;
        
        socket.on('connect', () => {
          console.log('✅ Student exam view connected to Socket.IO');
          // Join exam-specific room
          socket.emit('subscribe_exam', exam.id);
          // Join user-specific room
          socket.emit('join_user_room', user.id);
          // Also join monitoring room for general updates
          socket.emit('join_monitoring');

          // Flush any queued progress updates now that socket is connected
          const sid = sessionIdRef.current;
          if (sid && progressQueueRef.current.length > 0) {
            progressQueueRef.current.forEach((queuedUpdate) => {
              socket.emit('student_progress_update', {
                sessionId: sid,
                examId: exam.id,
                currentQuestion: queuedUpdate.currentQuestion,
                totalQuestions: queuedUpdate.totalQuestions,
                timestamp: new Date().toISOString(),
                userId: user.id,
                userName: user.name || user.username
              });
            });
            progressQueueRef.current = [];
          }
        });
        
        socket.on('session_invalidated', (data: any) => {
          console.log('🔴 Session invalidated event received:', data);
          if (data.userId === user.id && data.examId === exam.id) {
            setIsSessionInvalidated(true);
            setNotification(`⚠️ Your exam session has been invalidated by ${data.invalidatedBy || 'Administrator'}. Reason: ${data.reason || 'No reason provided'}. This exam attempt is disqualified.`);
            // Close any open modals (like submit confirmation)
            setShowSubmitModal(false);
            // Disable all exam interaction - the blocking overlay will show
          }
        });
        
        socket.on('penalty_applied', (data: any) => {
          console.log('📉 Penalty applied event received:', data);
          if (data.userId === user.id && data.examId === exam.id) {
            setNotification(`📉 A penalty of ${data.penaltyPct}% has been applied to your score by ${data.appliedBy || 'Administrator'}.`);
            setTimeout(() => setNotification(null), 8000); // Show longer for penalty
          }
        });
        
        socket.on('disconnect', () => {
          console.log('⚠️ Exam view socket disconnected');
        });
        
        socket.on('connect_error', (error: any) => {
          console.error('❌ Socket.IO connection error:', error);
        });
      } catch (error) {
        console.error('Failed to setup socket for exam view:', error);
      }
    };
    
    setupSocket();
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [user.id, user.role, exam.id]);
  
  // Periodically check session status via heartbeat
  useEffect(() => {
    if (user.role !== 'student' || isSessionInvalidated) return;
    
    const checkSessionStatus = async () => {
      try {
        const token = sessionStorage.getItem('iqbaes-token');
        if (!token) return;
        
        const response = await fetch(`/api/monitoring/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            examId: exam.id,
            sessionId: sessionId
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          // If session status is abandoned, invalidate locally
          if (data.sessionStatus === 'abandoned' || data.invalidated) {
            setIsSessionInvalidated(true);
            setNotification('⚠️ Your exam session has been invalidated. This exam attempt is disqualified.');
            // Close any open modals (like submit confirmation)
            setShowSubmitModal(false);
          }
        }
      } catch (error) {
        console.warn('Failed to check session status:', error);
      }
    };
    
    // Check every 10 seconds
    const interval = setInterval(checkSessionStatus, 10000);
    return () => clearInterval(interval);
  }, [user.role, exam.id, sessionId, isSessionInvalidated]);
  
  // Submit handler
  const handleSubmit = useCallback(() => {
    console.log('📤 Submitting exam...');
    // Clear heartbeat interval when submitting
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    onSubmit(answers, exam);
  }, [answers, exam, onSubmit]);
  
  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
      setNotification('Exam data refreshed successfully!');
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      setNotification('Failed to refresh exam data');
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshData]);

  const handleAnswer = (answer: string | boolean) => {
    setAnswers(prev => {
        const newAnswers = [...prev];
        newAnswers[currentQuestionIndex] = { questionId: exam.questions[currentQuestionIndex].id, answer };
        return newAnswers;
    });
  };

  const handleNext = () => {
    if (currentQuestionIndex < exam.questions.length - 1) {
      setCurrentQuestionIndex(prev => {
        const next = prev + 1;
        // Immediate progress emit to avoid waiting for effects
        const socketInstance = socketRef.current;
        const sid = sessionIdRef.current;
        if (!socketInstance?.connected || !sid) {
          progressQueueRef.current.push({ currentQuestion: next, totalQuestions: exam.questions.length });
        } else {
          socketInstance.emit('student_progress_update', {
            sessionId: sid,
            examId: exam.id,
            currentQuestion: next,
            totalQuestions: exam.questions.length,
            timestamp: new Date().toISOString(),
            userId: user.id,
            userName: user.name || user.username
          });
        }
        return next;
      });
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => {
        const next = prev - 1;
        const socketInstance = socketRef.current;
        const sid = sessionIdRef.current;
        if (!socketInstance?.connected || !sid) {
          progressQueueRef.current.push({ currentQuestion: next, totalQuestions: exam.questions.length });
        } else {
          socketInstance.emit('student_progress_update', {
            sessionId: sid,
            examId: exam.id,
            currentQuestion: next,
            totalQuestions: exam.questions.length,
            timestamp: new Date().toISOString(),
            userId: user.id,
            userName: user.name || user.username
          });
        }
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 relative" data-exam-container>
      {/* Session Invalidated Blocking Overlay - Fully blocks all exam interaction */}
      {isSessionInvalidated && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative z-[10000]">
            <div className="flex items-start mb-6">
              <div className="flex-shrink-0">
                <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-12 h-12 text-red-600" />
              </div>
              <div className="ml-4 flex-1">
                <h2 className="text-2xl font-bold text-red-800 mb-2">⚠️ Exam Session Invalidated</h2>
                <p className="text-lg text-gray-700 mb-4">
                  Your exam session has been invalidated by an administrator.
                </p>
                <p className="text-base text-gray-600 mb-6">
                  This exam attempt has been disqualified due to policy violations. You are no longer able to continue taking this exam.
                </p>
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <p className="text-sm text-red-700">
                    <strong>What happens next?</strong>
                  </p>
                  <ul className="list-disc list-inside text-sm text-red-600 mt-2 space-y-1">
                    <li>Your exam answers have been saved but this attempt is disqualified</li>
                    <li>You will see this notice when viewing your results</li>
                    <li>Please contact your lecturer or administrator if you believe this is an error</li>
                  </ul>
                </div>
                <button
                  onClick={() => {
                    // Force submit with current answers (if any) to show results
                    if (answers.some(a => a.answer !== null)) {
                      handleSubmit();
                    } else {
                      // Redirect to dashboard if no answers
                      window.location.hash = '#/';
                    }
                  }}
                  className="mt-6 bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors cursor-pointer"
                >
                  View Results / Return to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Hide entire exam UI when session is invalidated */}
      {!isSessionInvalidated && (
        <>
      
      {/* Anti-cheat notification */}
      {notification && !isSessionInvalidated && (
        <div className="fixed top-4 right-4 z-50 max-w-sm">
          <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-4 rounded-lg shadow-lg">
            <div className="flex items-center">
              <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-5 h-5 mr-3 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{notification}</p>
                {violationsCount > 0 && (
                  <p className="text-xs mt-1 opacity-75">Total notices: {violationsCount}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
        {/* Centered Container */}
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <header className="w-full max-w-4xl mx-auto flex justify-between items-center p-4 bg-white rounded-2xl shadow-md mb-6">
          <div>
              <h1 className="text-2xl font-bold text-slate-800">{exam.title}</h1>
              <p className="text-slate-500">{courseName}</p>
          </div>
          <Timer 
            initialMinutes={exam.duration} 
            onTimeUp={handleSubmit}
            startTime={sessionStartTime || undefined}
            examDuration={exam.duration}
          />
        </header>
        
        <main className="w-full max-w-4xl mx-auto flex-grow flex items-center justify-center">
            <div className={`w-full ${isSessionInvalidated ? 'opacity-50 pointer-events-none' : ''}`}>
              <QuestionCard
                question={exam.questions[currentQuestionIndex]}
                questionNumber={currentQuestionIndex + 1}
                totalQuestions={exam.questions.length}
                onAnswer={handleAnswer}
                currentAnswer={answers[currentQuestionIndex]}
              />
            </div>
        </main>

        <footer className="w-full max-w-4xl mx-auto mt-6">
        <div className={`bg-white p-4 rounded-2xl shadow-md flex justify-between items-center ${isSessionInvalidated ? 'opacity-50 pointer-events-none' : ''}`}>
            <button
                onClick={handlePrev}
                disabled={currentQuestionIndex === 0 || isSessionInvalidated}
                className="bg-slate-300 text-slate-800 font-bold py-3 px-6 rounded-lg hover:bg-slate-400 transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center"
            >
                <Icon path="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" className="w-5 h-5 mr-2"/>
                Previous
            </button>
            
            <div className="text-center">
              <p className="font-semibold">{currentQuestionIndex + 1} / {exam.questions.length}</p>
              <div className="flex justify-center mt-2 space-x-1">
                {exam.questions.map((_, index) => (
                   <button 
                    key={index} 
                    onClick={() => {
                      if (isSessionInvalidated) return;
                      setCurrentQuestionIndex(() => {
                        const next = index;
                        const socketInstance = socketRef.current;
                        const sid = sessionIdRef.current;
                        if (!socketInstance?.connected || !sid) {
                          progressQueueRef.current.push({ currentQuestion: next, totalQuestions: exam.questions.length });
                        } else {
                          socketInstance.emit('student_progress_update', {
                            sessionId: sid,
                            examId: exam.id,
                            currentQuestion: next,
                            totalQuestions: exam.questions.length,
                            timestamp: new Date().toISOString(),
                            userId: user.id,
                            userName: user.name || user.username
                          });
                        }
                        return next;
                      });
                    }}
                    disabled={isSessionInvalidated}
                    className={`w-8 h-2 rounded-full ${index === currentQuestionIndex ? 'bg-indigo-600' : (answers[index].answer !== null ? 'bg-green-400' : 'bg-slate-300')} ${isSessionInvalidated ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    aria-label={`Go to question ${index + 1}`}
                   />
                ))}
              </div>
            </div>

            {currentQuestionIndex === exam.questions.length - 1 ? (
                 <button
                    onClick={() => setShowSubmitModal(true)}
                    disabled={isSessionInvalidated}
                    className="bg-green-600 text-white font-bold py-4 px-8 rounded-lg hover:bg-green-700 transition-all transform hover:scale-105 shadow-xl flex items-center text-lg disabled:bg-slate-300 disabled:cursor-not-allowed disabled:transform-none"
                >
                    Submit & View Results
                    <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-6 h-6 ml-3"/>
                </button>
            ) : (
                <button
                    onClick={handleNext}
                    disabled={isSessionInvalidated}
                    className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-700 transition-colors flex items-center shadow-lg disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                    Next
                    <Icon path="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" className="w-5 h-5 ml-2"/>
                </button>
            )}
        </div>
      </footer>
      </div>
      </>
      )}

      {/* Submit Confirmation Modal - Only show if session is NOT invalidated */}
      {showSubmitModal && !isSessionInvalidated && (
        <Modal
          isOpen={showSubmitModal}
          onClose={() => setShowSubmitModal(false)}
          title="Submit Exam"
        >
          <div className="text-center">
            <p className="mb-4">Are you sure you want to submit your exam? This action cannot be undone.</p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSubmitModal(false);
                  setIsSubmitting(true);
                  handleSubmit();
                }}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ExamView;