import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Icon } from './Icon';
import { useExamMonitoringSocket } from '../hooks/useExamMonitoringSocket';
import { useToast } from './Toast';

// Simplified interfaces for better type safety
interface LiveSession {
  id: string;
  studentName: string;
  examTitle: string;
  examId: string;
  startTime: Date;
  timeRemaining: number;
  status: 'active' | 'flagged' | 'completed';
  violationCount: number;
  ipAddress: string;
  progress: {
    current: number;
    total: number;
  };
}

interface LiveAlert {
  id: string;
  sessionId: string;
  studentName: string;
  examTitle: string;
  examId: string;
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  resolved: boolean;
}

interface MonitoringStats {
  totalSessions: number;
  activeSessions: number;
  flaggedSessions: number;
  totalAlerts: number;
  criticalAlerts: number;
}

interface ExamMonitoringDashboardProps {
  exams: any[];
  submissions: any[];
  userRole?: 'admin' | 'lecturer' | 'student';
}

// Helper function to convert indexed character format back to readable text
const convertIndexedDetailsToText = (details: any): string => {
  if (typeof details === 'string') {
    return details; // Already a string, return as is
  }
  
  if (typeof details === 'object' && details !== null) {
    // Check if it's an indexed character object (e.g., {"0": "T", "1": "a", "2": "b"})
    const keys = Object.keys(details);
    const isIndexedFormat = keys.every(key => /^\d+$/.test(key)) && keys.length > 0;
    
    if (isIndexedFormat) {
      // Convert indexed format back to string
      const sortedKeys = keys.sort((a, b) => parseInt(a) - parseInt(b));
      return sortedKeys.map(key => details[key]).join('');
    }
    
    // If it's an object with a message property, return that
    if (details.message) {
      return details.message;
    }
    
    // Create user-friendly messages based on the object content
    if (details.violationCount && details.status) {
      const violationText = details.violationCount === 1 ? 'violation' : 'violations';
      return `Student has ${details.violationCount} ${violationText} detected (Status: ${details.status})`;
    }
    
    if (details.type) {
      return `Violation: ${details.type}`;
    }
    
    if (details.reason) {
      return `Reason: ${details.reason}`;
    }
    
    // If it's a simple object with just a few properties, create a readable summary
    const simpleProps = Object.keys(details).filter(key => 
      typeof details[key] === 'string' || typeof details[key] === 'number'
    );
    
    if (simpleProps.length <= 3) {
      const summary = simpleProps.map(key => `${key}: ${details[key]}`).join(', ');
      return summary;
    }
    
    // Last resort: return a generic message instead of raw JSON
    return 'Violation detected';
  }
  
  return String(details);
};

// CRITICAL: This is REAL-TIME live monitoring via WebSocket
// Updates come instantly from student devices via WebSocket events, NOT from logs or polling
// Logs are only for record-keeping - live monitoring uses WebSocket + LiveExamSession state
const ExamMonitoringDashboard: React.FC<ExamMonitoringDashboardProps> = ({ exams, submissions, userRole = 'lecturer' }) => {
  // Simplified state management - all updates come via WebSocket events in real-time
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [stats, setStats] = useState<MonitoringStats>({
    totalSessions: 0,
    activeSessions: 0,
    flaggedSessions: 0,
    totalAlerts: 0,
    criticalAlerts: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedExam, setSelectedExam] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date()); // For real-time time calculation

  // Real-time timer that updates every second for LIVE monitoring
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second for true live monitoring
    
    return () => clearInterval(timer);
  }, []);

  // Calculate real-time time remaining for each session based on startTime and exam duration
  const sessionsWithLiveTime = useMemo(() => {
    return sessions.map(session => {
      // Find exam to get duration - prefer examDuration from session data if available
      const exam = exams.find(e => String(e.id || e._id) === String(session.examId));
      // Use examDuration from session if available (from WebSocket), otherwise look it up
      const examDuration = (session as any).examDuration || exam?.durationMinutes || 120; // Default 2 hours
      
      // CRITICAL: Calculate time remaining based on ACTUAL session startTime
      // This ensures the timer reflects the real exam time, not a reset timer
      const startTimeDate = session.startTime instanceof Date ? session.startTime : new Date(session.startTime);
      const elapsedMs = currentTime.getTime() - startTimeDate.getTime();
      const timeRemainingMs = Math.max(0, examDuration * 60000 - elapsedMs);
      // Use Math.round for more accurate display (shows 37m instead of 36m if 36.5m remaining)
      const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);
      
      // Log calculation for debugging (only when significant change to reduce console spam)
      // Only log if time remaining changed by more than 1 minute or if it's a new calculation
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const elapsedSeconds = Math.floor((elapsedMs % 60000) / 1000);
      
      // Only log every 30 seconds to reduce console spam, but always log on first calculation
      const shouldLog = !session._lastLogTime || (Date.now() - session._lastLogTime) > 30000;
      if (shouldLog) {
        console.log(`⏱️ REAL-TIME Timer for ${session.studentName}:`, {
          examDuration: examDuration,
          startTime: startTimeDate.toLocaleTimeString(),
          currentTime: currentTime.toLocaleTimeString(),
          elapsed: `${elapsedMinutes}m ${elapsedSeconds}s`,
          timeRemaining: `${timeRemainingMinutes}m`,
          calculation: `${examDuration}min - ${elapsedMinutes}.${Math.floor(elapsedSeconds/10)}min = ${timeRemainingMinutes}min`
        });
        session._lastLogTime = Date.now();
      }
      
      return {
        ...session,
        timeRemaining: timeRemainingMinutes, // Real-time calculated time
      };
    });
  }, [sessions, exams, currentTime]);

  // Handle real-time socket updates
  const handleSessionCreated = useCallback((payload: any) => {
    console.log('🟢 LIVE: Session created via WebSocket:', payload);
    setSessions(prev => {
      // CRITICAL: Deduplicate - remove any existing sessions with same userId+examId
      // Only keep ONE session per user-exam pair (the new one)
      let filtered = prev.filter(s => 
        !(String(s.examId) === String(payload.examId) && 
          s.studentName === (payload.userName || 'Unknown Student') &&
          s.id !== payload.sessionId) // Keep if it's the same sessionId
      );
      
      const idx = filtered.findIndex(s => s.id === payload.sessionId);
      // Extract progress from payload safely (0-based; 0 is valid)
      const payloadCurrent = (payload.currentQuestion !== undefined && payload.currentQuestion !== null)
        ? payload.currentQuestion
        : 0;
      const payloadTotal = (payload.totalQuestions !== undefined && payload.totalQuestions !== null)
        ? payload.totalQuestions
        : 0;

      if (idx >= 0) {
        // Merge without regressing progress if an updated event already advanced it
        const copy = [...filtered];
        const existing = copy[idx];
        const merged: LiveSession & { examDuration?: number } = {
          ...existing,
          studentName: payload.userName || existing.studentName,
          examTitle: payload.examTitle || existing.examTitle,
          examId: String(payload.examId || existing.examId),
          startTime: payload.startTime ? new Date(payload.startTime) : existing.startTime,
          timeRemaining: Math.max(0, payload.timeRemaining ?? existing.timeRemaining ?? 0),
          status: (payload.status === 'flagged') ? 'flagged' : (existing.status || 'active'),
          violationCount: payload.violationCount !== undefined ? payload.violationCount : existing.violationCount,
          ipAddress: payload.ipAddress || existing.ipAddress || 'Unknown',
          // Prefer the higher current progress to avoid reset; keep total from payload if provided
          progress: {
            current: Math.max(existing.progress?.current ?? 0, payloadCurrent ?? 0),
            total: payloadTotal || existing.progress?.total || 0,
          },
          examDuration: payload.examDuration !== undefined ? payload.examDuration : (existing as any).examDuration,
        };
        copy[idx] = merged;
        console.log('🟢 LIVE: Merged created event into existing session without regress:', merged.id, {
          existingCurrent: existing.progress?.current,
          payloadCurrent,
          finalCurrent: merged.progress.current
        });
        filtered = copy;
      } else {
        const nextSession: LiveSession & { examDuration?: number } = {
          id: payload.sessionId,
          studentName: payload.userName || 'Unknown Student',
          examTitle: payload.examTitle || 'Unknown Exam',
          examId: String(payload.examId || ''),
          startTime: new Date(payload.startTime),
          timeRemaining: Math.max(0, payload.timeRemaining ?? 0),
          status: (payload.status === 'flagged') ? 'flagged' : 'active',
          violationCount: payload.violationCount || 0,
          ipAddress: payload.ipAddress || 'Unknown',
          progress: {
            current: payloadCurrent,
            total: payloadTotal,
          },
          examDuration: payload.examDuration,
        };
        console.log('🟢 LIVE: Added new session:', nextSession.id);
        filtered = [nextSession, ...filtered];
      }
      
      const updatedSessions = filtered;
      
      // Update stats after adding new session
      setStats({
        totalSessions: updatedSessions.length,
        activeSessions: updatedSessions.filter(s => s.status === 'active').length,
        flaggedSessions: updatedSessions.filter(s => s.status === 'flagged').length,
        totalAlerts: alerts.length, // Keep existing alerts count
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length
      });
      
      return updatedSessions;
    });
  }, [alerts]);

  const handleSessionUpdated = useCallback((payload: any) => {
    if (!payload || !payload.sessionId) return;
    
    setSessions(prev => {
      // If status is 'submitted', 'expired', or 'abandoned', remove the session immediately
      if (payload.status === 'submitted' || payload.status === 'expired' || payload.status === 'abandoned') {
        console.log('🔴 LIVE: Removing session (completed):', payload.sessionId);
        const updatedSessions = prev.filter(s => s.id !== payload.sessionId);
        
        // Update stats after removing session
        setStats({
          totalSessions: updatedSessions.length,
          activeSessions: updatedSessions.filter(s => s.status === 'active').length,
          flaggedSessions: updatedSessions.filter(s => s.status === 'flagged').length,
          totalAlerts: alerts.length,
          criticalAlerts: alerts.filter(a => a.severity === 'critical').length
        });
        
        return updatedSessions;
      }
      
      // Don't process updates if sessionId is missing or invalid
      if (!payload.sessionId || payload.sessionId === 'removed') {
        console.warn('⚠️ LIVE: Invalid sessionId in update:', payload);
        return prev;
      }
      
      // CRITICAL: Find session by sessionId first (exact match) - this is the most reliable
      let idx = prev.findIndex(s => String(s.id) === String(payload.sessionId));
      
      // Fallback: If not found by sessionId, try to find by userId+examId match
      // This handles cases where sessionId format differs or session was created before dashboard loaded
      if (idx === -1) {
        idx = prev.findIndex(s => 
          String(s.examId) === String(payload.examId) && 
          s.studentName === (payload.userName || 'Unknown Student')
        );
        if (idx >= 0) {
          // CRITICAL: Update the session's ID to match the payload's sessionId
          // This ensures future updates find the session correctly
          prev[idx].id = String(payload.sessionId);
        }
      }
      
      // CRITICAL: Deduplicate FIRST - remove any OTHER sessions with same userId+examId (keep only the one we found/updated)
      // Only keep ONE session per user-exam pair
      // This must happen BEFORE we update the session, so we work with the correct array
      let filtered = prev.filter((s, i) => 
        i === idx || // Keep the session we're updating (if found)
        !(String(s.examId) === String(payload.examId) && 
          s.studentName === (payload.userName || 'Unknown Student'))
      );
      
      // If session was found, update idx to match new filtered array
      if (idx >= 0) {
        idx = filtered.findIndex(s => String(s.id) === String(payload.sessionId));
        // If still not found after deduplication, it means deduplication removed it - find by userId+examId
        if (idx === -1) {
          idx = filtered.findIndex(s => 
            String(s.examId) === String(payload.examId) && 
            s.studentName === (payload.userName || 'Unknown Student')
          );
        }
      }
      
      
      // If session doesn't exist, create it (might have been created before dashboard loaded)
      if (idx === -1) {
        // Don't create sessions that are already submitted/expired/abandoned
        if (payload.status === 'submitted' || payload.status === 'expired' || payload.status === 'abandoned') {
          return filtered;
        }
        
        if (!payload.startTime) {
          // Use fallback startTime if missing
        }
        const newSession: LiveSession = {
          id: String(payload.sessionId), // CRITICAL: Ensure sessionId is a string
          studentName: payload.userName || 'Unknown Student',
          examTitle: payload.examTitle || 'Unknown Exam',
          examId: String(payload.examId || ''),
          // CRITICAL: Use ACTUAL session startTime from database (backend always sends this)
          // If missing, log error but use fallback (should never happen)
          startTime: payload.startTime ? new Date(payload.startTime) : new Date(Date.now() - 60000), // Fallback: assume started 1 min ago
          // Backend already sends timeRemaining in minutes, don't divide by 60000 again!
          timeRemaining: Math.max(0, payload.timeRemaining ?? 0),
          status: payload.status || 'active',
          violationCount: payload.violationCount || 0,
          ipAddress: payload.ipAddress || 'Unknown',
          // CRITICAL: Handle progress correctly - 0 is a valid question index (first question)
          // Use !== undefined && !== null check, not || operator (which treats 0 as falsy)
          // Also check for progressCurrent/progressTotal for compatibility
          progress: {
            current: (payload.currentQuestion !== undefined && payload.currentQuestion !== null)
              ? payload.currentQuestion 
              : (payload.progressCurrent !== undefined && payload.progressCurrent !== null)
                ? payload.progressCurrent
                : 0,
            total: (payload.totalQuestions !== undefined && payload.totalQuestions !== null)
              ? payload.totalQuestions 
              : (payload.progressTotal !== undefined && payload.progressTotal !== null)
                ? payload.progressTotal
                : 0,
          },
        };
        return [newSession, ...filtered];
      }
      
      // Update existing session - preserve all fields, only update what's provided
      // CRITICAL: Don't remove session during updates - only update fields
      const copy = [...filtered];
      const session = copy[idx];
      
      // CRITICAL: Extract progress from payload - prioritize currentQuestion/totalQuestions
      // These come directly from the student's client via WebSocket
      const payloadCurrent = payload.currentQuestion !== undefined && payload.currentQuestion !== null
        ? payload.currentQuestion
        : payload.progressCurrent !== undefined && payload.progressCurrent !== null
          ? payload.progressCurrent
          : undefined;
      
      const payloadTotal = payload.totalQuestions !== undefined && payload.totalQuestions !== null
        ? payload.totalQuestions
        : payload.progressTotal !== undefined && payload.progressTotal !== null
          ? payload.progressTotal
          : undefined;
      
      // CRITICAL: ALWAYS use payload progress if available (even if it's 0)
      // The student's currentQuestion from WebSocket is ALWAYS the most current value - this is real-time
      const updatedProgress = payloadCurrent !== undefined
        ? {
            current: payloadCurrent,
            total: payloadTotal !== undefined ? payloadTotal : session.progress.total
          }
        : session.progress;
      
      // CRITICAL: Force progress update - if payload has currentQuestion, ALWAYS use it
      // This is the student's real-time action, it must be reflected immediately
      const finalProgress = (payload.currentQuestion !== undefined && payload.currentQuestion !== null) ||
                            (payload.progressCurrent !== undefined && payload.progressCurrent !== null)
        ? {
            current: payload.currentQuestion !== undefined && payload.currentQuestion !== null 
              ? payload.currentQuestion 
              : payload.progressCurrent,
            total: payload.totalQuestions !== undefined && payload.totalQuestions !== null
              ? payload.totalQuestions
              : (payload.progressTotal !== undefined && payload.progressTotal !== null
                  ? payload.progressTotal
                  : session.progress.total)
          }
        : updatedProgress;
      
      const updatedSession = {
        ...session,
        id: String(payload.sessionId),
        violationCount: payload.violationCount !== undefined ? payload.violationCount : session.violationCount,
        status: payload.status || session.status,
        progress: finalProgress,
        // CRITICAL: Use backend's timeRemaining if provided (it's calculated server-side with actual startTime)
        // Only recalculate if backend didn't send it (fallback - should never happen)
        timeRemaining: payload.timeRemaining !== undefined 
          ? Math.max(0, Math.round(payload.timeRemaining)) // Use backend's calculated time (rounded)
          : (() => {
              // Fallback: recalculate if backend didn't send timeRemaining (should never happen)
              console.warn('⚠️ Backend did not send timeRemaining, recalculating client-side:', payload.sessionId);
              const exam = exams.find(e => String(e.id || e._id) === String(payload.examId));
              const examDuration = exam?.durationMinutes || 120;
              const startTime = payload.startTime ? new Date(payload.startTime) : session.startTime;
              const elapsedMs = Date.now() - startTime.getTime();
              return Math.max(0, Math.round((examDuration * 60000 - elapsedMs) / 60000));
            })(),
        // Update last activity timestamp
        startTime: payload.startTime ? new Date(payload.startTime) : session.startTime,
        // Update examDuration if provided
        examDuration: payload.examDuration !== undefined ? payload.examDuration : (session as any).examDuration,
      } as LiveSession & { examDuration?: number };
      
      copy[idx] = updatedSession;
      
      // Update stats after session update
      const updatedSessions = copy;
      setStats({
        totalSessions: updatedSessions.length,
        activeSessions: updatedSessions.filter(s => s.status === 'active').length,
        flaggedSessions: updatedSessions.filter(s => s.status === 'flagged').length,
        totalAlerts: alerts.length, // Keep existing alerts count
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length
      });
      
      return copy;
    });
  }, [alerts]);

  // Handle real-time alert updates
  const handleAlertCreated = useCallback((payload: any) => {
    setAlerts(prev => {
      // Check if alert already exists
      const existingIndex = prev.findIndex(a => a.id === payload.id);
      if (existingIndex >= 0) {
        // Update existing alert
        const copy = [...prev];
        copy[existingIndex] = {
          id: payload.id,
          sessionId: payload.sessionId || '',
          studentName: payload.userName || 'Unknown Student',
          examTitle: payload.examTitle || 'Unknown Exam',
          examId: String(payload.examId || ''),
          type: payload.type || 'violation',
          message: payload.message || 'Violation detected',
          severity: payload.severity || 'medium',
          timestamp: new Date(payload.timestamp),
          resolved: false
        };
        return copy;
      }
      // Add new alert
      return [{
        id: payload.id,
        sessionId: payload.sessionId || '',
        studentName: payload.userName || 'Unknown Student',
        examTitle: payload.examTitle || 'Unknown Exam',
        examId: String(payload.examId || ''),
        type: payload.type || 'violation',
        message: payload.message || 'Violation detected',
        severity: payload.severity || 'medium',
        timestamp: new Date(payload.timestamp),
        resolved: false
      }, ...prev];
    });
    
    // Update stats
    setStats(prev => ({
      ...prev,
      totalAlerts: prev.totalAlerts + 1,
      criticalAlerts: payload.severity === 'critical' ? prev.criticalAlerts + 1 : prev.criticalAlerts
    }));
  }, []);

  const handleAlertResolved = useCallback((payload: any) => {
    setAlerts(prev => prev.filter(a => a.id !== payload.alertId));
    
    // Update stats
    setStats(prev => ({
      ...prev,
      totalAlerts: Math.max(0, prev.totalAlerts - 1)
    }));
  }, []);

  const { connectionStatus: socketStatus } = useExamMonitoringSocket({
    examId: selectedExam !== 'all' ? selectedExam : null,
    onSessionCreated: handleSessionCreated,
    onSessionUpdated: handleSessionUpdated,
    onAlertCreated: handleAlertCreated,
    onAlertResolved: handleAlertResolved,
  });

  useEffect(() => {
    // Merge API connectivity and socket connectivity
    if (socketStatus === 'reconnecting') setConnectionStatus('reconnecting');
    else if (socketStatus === 'connected') setConnectionStatus('connected');
  }, [socketStatus]);

  // Simplified API helper with better error handling
  const apiFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    try {
      const token = sessionStorage.getItem('iqbaes-token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const response = await fetch(`/api${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error: any) {
      // Don't log connection errors to reduce noise when backend is not running
      // Only log if it's not a connection error
      if (error?.message && !error.message.includes('ECONNREFUSED') && !error.message.includes('fetch')) {
        console.error('API Fetch Error:', error);
      }
      setConnectionStatus('disconnected');
      throw error;
    }
  }, []);

  // Simplified data fetching with robust error handling
  const fetchMonitoringData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setConnectionStatus('reconnecting');

      const data = await apiFetch('/submissions/active-sessions');
      
      // Process sessions with validation - use actual status from real-time data
      // This ensures ALL students appear immediately when they start exams, not just after violations
      const processedSessions: LiveSession[] = (data.activeSessions || data.sessions || [])
        .map((session: any) => ({
          id: session.sessionId || `${session.userId || session.studentId}-${session.examId}`,
          studentName: session.userName || session.studentName || 'Unknown Student',
          examTitle: session.examTitle || 'Unknown Exam',
          examId: String(session.examId || ''),
          startTime: new Date(session.startTime),
          timeRemaining: Math.max(0, session.timeRemaining || 0),
          // Use actual status from backend (real-time LiveExamSession data)
          status: session.status || (session.timeRemaining <= 0 ? 'completed' : 'active'),
          violationCount: session.violationCount || 0,
          ipAddress: session.ipAddress || 'Unknown',
          // CRITICAL: Handle progress correctly - use progressCurrent/progressTotal from API
          // The API returns progressCurrent and progressTotal, not currentQuestion/totalQuestions
          progress: {
            current: session.progressCurrent !== undefined && session.progressCurrent !== null
              ? session.progressCurrent 
              : (session.currentQuestion !== undefined && session.currentQuestion !== null ? session.currentQuestion : 0),
            total: session.progressTotal !== undefined && session.progressTotal !== null
              ? session.progressTotal 
              : (session.totalQuestions !== undefined && session.totalQuestions !== null ? session.totalQuestions : 1)
          }
        }));

      // Process alerts with validation - allow unknown student placeholders
       const processedAlerts: LiveAlert[] = (data.alerts || [])
         .map((alert: any) => ({
           id: alert.id || `alert-${Date.now()}-${Math.random()}`,
           sessionId: alert.sessionId || '',
           studentName: alert.userName || alert.studentName || 'Unknown Student',
           examTitle: alert.examTitle || 'Unknown Exam',
           examId: String(alert.examId || ''),
           type: alert.type || 'violation',
           message: convertIndexedDetailsToText(alert.details) || alert.message || 'Violation detected',
           severity: alert.severity || 'medium',
           timestamp: new Date(alert.timestamp),
           resolved: alert.resolved || false
         }));

      // Calculate stats
      const newStats: MonitoringStats = {
        totalSessions: processedSessions.length,
        activeSessions: processedSessions.filter(s => s.status === 'active').length,
        flaggedSessions: processedSessions.filter(s => s.status === 'flagged').length,
        totalAlerts: processedAlerts.filter(a => !a.resolved).length,
        criticalAlerts: processedAlerts.filter(a => a.severity === 'critical' && !a.resolved).length
      };

      setSessions(processedSessions);
      setAlerts(processedAlerts.filter(a => !a.resolved));
      setStats(newStats);
      setLastUpdate(new Date());
      setConnectionStatus('connected');

    } catch (error) {
      console.error('Error fetching monitoring data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch monitoring data');
      setConnectionStatus('disconnected');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  // Initial data fetch on mount
  useEffect(() => {
    fetchMonitoringData();
  }, [fetchMonitoringData]);
  
  // CRITICAL: WebSocket is the PRIMARY real-time mechanism - no polling when connected
  // Polling is ONLY used as a fallback when WebSocket is disconnected
  // This ensures true real-time monitoring: updates arrive instantly via WebSocket, not after delays
  useEffect(() => {
    if (!autoRefresh) return;
    
    // Only poll if WebSocket is disconnected (backup mechanism)
    // When WebSocket is connected, all updates come instantly via live_session_updated events
    if (socketStatus === 'disconnected') {
      const interval = setInterval(() => {
        console.log('🔄 Polling backup (WebSocket disconnected)');
        fetchMonitoringData();
      }, 20000); // 20 seconds - only when WebSocket is down
      return () => clearInterval(interval);
    }
    // When WebSocket is connected, NO polling - all updates are real-time via WebSocket
  }, [fetchMonitoringData, autoRefresh, socketStatus]);

  // Filter sessions by selected exam - use examId for exact matching
  // Use sessionsWithLiveTime for real-time time updates
  const filteredSessions = useMemo(() => {
    if (selectedExam === 'all') return sessionsWithLiveTime;
    return sessionsWithLiveTime.filter(session => String(session.examId) === String(selectedExam));
  }, [sessionsWithLiveTime, selectedExam]);

  // Filter alerts by selected exam - use examId for exact matching
  const filteredAlerts = useMemo(() => {
    if (selectedExam === 'all') return alerts;
    return alerts.filter(alert => String(alert.examId) === String(selectedExam));
  }, [alerts, selectedExam]);

  // Calculate filtered stats based on selected exam - FIXED VERSION
  const filteredStats = useMemo(() => {
    if (selectedExam === 'all') return stats;
    
    return {
      totalSessions: filteredSessions.length,
      activeSessions: filteredSessions.filter(s => s.status === 'active').length,
      flaggedSessions: filteredSessions.filter(s => s.status === 'flagged').length,
      totalAlerts: filteredAlerts.length,
      criticalAlerts: filteredAlerts.filter(a => a.severity === 'critical').length
    };
  }, [filteredSessions, filteredAlerts, selectedExam, stats]);

  // REMOVED: Debug console.log statements for better performance

  // Action handlers with error handling
  const handleResolveAlert = useCallback(async (alertId: string) => {
    try {
      await apiFetch('/monitoring/resolve-alert', {
        method: 'POST',
        body: JSON.stringify({ alertId })
      });
      setAlerts(prev => prev.filter(alert => alert.id !== alertId));
    } catch (error) {
      console.error('Error resolving alert:', error);
      setError('Failed to resolve alert');
    }
  }, [apiFetch]);

  const handleFlagSession = useCallback(async (sessionId: string, reason: string) => {
    try {
      await apiFetch('/monitoring/flag-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId, reason })
      });
      // Show success toast with animation
      showToast({
        message: '🚩 Flag for Admin Done!',
        subtitle: 'Session has been flagged for admin review',
        type: 'success'
      });
      await fetchMonitoringData();
    } catch (error) {
      console.error('Error flagging session:', error);
      showToast({
        message: '❌ Failed to Flag Session',
        subtitle: 'An error occurred while flagging',
        type: 'error'
      });
      setError('Failed to flag session');
    }
  }, [apiFetch, fetchMonitoringData, showToast]);

  // Admin impact actions
  const adminInvalidate = useCallback(async (sessionId: string) => {
    if (!confirm('Invalidate this attempt? The session will be disqualified.')) return;
    try {
      await apiFetch('/monitoring/admin/invalidate', { method: 'POST', body: JSON.stringify({ sessionId, reason: 'Admin invalidated from dashboard' }) });
      await fetchMonitoringData();
    } catch (e) {
      setError('Failed to invalidate session');
    }
  }, [apiFetch, fetchMonitoringData]);

  const adminRetake = useCallback(async (sessionId: string) => {
    const maxAttempts = prompt('Grant retake. Optionally set max attempts (leave blank to keep).');
    try {
      await apiFetch('/monitoring/admin/retake', { method: 'POST', body: JSON.stringify({ sessionId, maxAttempts: maxAttempts ? Number(maxAttempts) : undefined }) });
      await fetchMonitoringData();
    } catch (e) {
      setError('Failed to grant retake');
    }
  }, [apiFetch, fetchMonitoringData]);

  const adminPenalty = useCallback(async (sessionId: string) => {
    const pct = prompt('Penalty percentage (e.g., 20):', '20');
    if (!pct) return;
    try {
      await apiFetch('/monitoring/admin/penalty', { method: 'POST', body: JSON.stringify({ sessionId, penaltyPct: Number(pct) }) });
      await fetchMonitoringData();
    } catch (e) {
      setError('Failed to apply penalty');
    }
  }, [apiFetch, fetchMonitoringData]);

  // Utility functions
  const formatTimeRemaining = (minutes: number) => {
    if (minutes <= 0) return 'Time Up';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'flagged': return 'bg-red-100 text-red-800 border-red-200';
      case 'completed': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-50 border-red-200 text-red-900';
      case 'high': return 'bg-orange-50 border-orange-200 text-orange-900';
      case 'medium': return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      case 'low': return 'bg-blue-50 border-blue-200 text-blue-900';
      default: return 'bg-gray-50 border-gray-200 text-gray-900';
    }
  };

  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              📊 Live Exam Monitoring
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                connectionStatus === 'connected' ? 'bg-green-100 text-green-800' :
                connectionStatus === 'reconnecting' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {connectionStatus === 'connected' ? '🟢 Live' :
                 connectionStatus === 'reconnecting' ? '🟡 Connecting' :
                 '🔴 Offline'}
              </span>
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Last updated: {lastUpdate.toLocaleTimeString()} • 
              {filteredStats.activeSessions} active sessions • 
              {filteredStats.totalAlerts} unresolved alerts
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            
            <button
              onClick={fetchMonitoringData}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className="w-4 h-4" />
              )}
              {isLoading ? 'Updating...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2">
              <Icon path="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12V15.75z" className="w-5 h-5 text-red-600" />
              <span className="text-red-800 font-medium">Error</span>
            </div>
            <p className="text-red-700 mt-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 text-sm mt-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Exam Filter - use examId */}
        <div>
          <select
            value={selectedExam}
            onChange={(e) => {
              const newValue = e.target.value;
              setSelectedExam(newValue);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Exams ({sessions.length} sessions)</option>
            {exams.map(exam => {
              const examSessions = sessions.filter(s => String(s.examId) === String(exam.id));
              return (
                <option key={exam.id} value={exam.id}>
                  {exam.title} ({examSessions.length} sessions)
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900">{filteredStats.totalSessions}</p>
            </div>
            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
              📊
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-2xl font-bold text-green-600">{filteredStats.activeSessions}</p>
            </div>
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              🟢
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Flagged</p>
              <p className="text-2xl font-bold text-red-600">{filteredStats.flaggedSessions}</p>
            </div>
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              🚩
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Alerts</p>
              <p className="text-2xl font-bold text-yellow-600">{filteredStats.totalAlerts}</p>
            </div>
            <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
              ⚠️
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Critical</p>
              <p className="text-2xl font-bold text-purple-600">{filteredStats.criticalAlerts}</p>
            </div>
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              🚨
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Sessions */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Active Sessions ({filteredSessions.length})
            </h2>
          </div>
          <div className="p-4">
            {filteredSessions.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 text-4xl mb-2">📝</div>
                <p className="text-gray-500">No active sessions</p>
                <p className="text-sm text-gray-400 mt-1">Sessions will appear here when students start exams</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredSessions.map((session) => (
                  <div key={session.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-medium text-gray-900">{session.studentName}</h3>
                        <p className="text-sm text-gray-600">{session.examTitle}</p>
                      </div>
                      {/* Removed status badge - alerts already flag sessions for review */}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                      <div>Time: <span className="font-medium">{formatTimeRemaining(session.timeRemaining)}</span></div>
                      <div>Progress: <span className="font-medium">{session.progress.current + 1}/{session.progress.total}</span></div>
                      <div>Started: <span className="font-medium">{session.startTime.toLocaleTimeString()}</span></div>
                      <div>Violations: <span className={`font-medium ${session.violationCount >= 3 ? 'text-red-600' : 'text-gray-900'}`}>{session.violationCount}</span></div>
                    </div>
                    
                    {session.violationCount >= 3 && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFlagSession(session.id, `High violation count: ${session.violationCount}`)}
                          className="px-3 py-1 bg-red-100 text-red-800 rounded text-xs hover:bg-red-200"
                        >
                          Flag Session
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live Alerts */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">
                Live Alerts ({filteredAlerts.length})
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  Real-time
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  userRole === 'admin' 
                    ? 'bg-purple-100 text-purple-800' 
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {userRole === 'admin' ? '👑 Admin' : '👨‍🏫 Lecturer'}
                </div>
              </div>
            </div>
            {/* Role permissions info */}
            <div className="mt-2 text-xs text-gray-600">
              {userRole === 'admin' ? (
                <span>You can resolve alerts, flag sessions, and take disciplinary actions (invalidate, retake, penalty)</span>
              ) : (
                <span>You can monitor live sessions and flag suspicious behavior for admin review</span>
              )}
            </div>
          </div>
          <div className="p-4">
            {filteredAlerts.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 text-4xl mb-2">✅</div>
                <p className="text-gray-500">No active alerts</p>
                <p className="text-sm text-gray-400 mt-1">System monitoring for violations</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredAlerts.map((alert) => (
                  <div key={alert.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityBadgeColor(alert.severity)}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-gray-500">Live</span>
                      </div>
                      <span className="text-xs text-gray-500">{formatTimestamp(alert.timestamp)}</span>
                    </div>
                    
                    <p className="font-medium mb-1">{alert.message}</p>
                    <p className="text-sm opacity-75 mb-3">
                      {alert.studentName} • {alert.examTitle}
                    </p>
                    
                    <div className="flex flex-col gap-2">
                      {/* Lecturer actions - Only monitoring and flagging */}
                      {userRole === 'lecturer' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFlagSession(alert.sessionId, alert.message)}
                            className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 font-medium"
                          >
                            🚩 Flag for Admin Review
                          </button>
                        </div>
                      )}
                      
                      {/* Admin-only actions - All disciplinary and resolution actions */}
                      {userRole === 'admin' && (
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Admin Actions:</p>
                          <div className="flex flex-col gap-2">
                            {/* Primary admin actions */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolveAlert(alert.id)}
                                className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 font-medium"
                              >
                                ✓ Resolve Alert
                              </button>
                              <button
                                onClick={() => handleFlagSession(alert.sessionId, alert.message)}
                                className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700 font-medium"
                              >
                                🚩 Flag Session
                              </button>
                            </div>
                            
                            {/* Disciplinary actions */}
                            <div className="flex gap-1 text-xs">
                              <button 
                                onClick={() => adminInvalidate(alert.sessionId)} 
                                className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                Invalidate
                              </button>
                              <button 
                                onClick={() => adminRetake(alert.sessionId)} 
                                className="px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                Retake
                              </button>
                              <button 
                                onClick={() => adminPenalty(alert.sessionId)} 
                                className="px-2 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                              >
                                Penalty
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamMonitoringDashboard;

