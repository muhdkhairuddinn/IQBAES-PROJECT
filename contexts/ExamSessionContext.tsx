import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface ExamSessionContextType {
  // Session identifiers
  sessionId: string | null;
  examId: string | null;
  startTime: Date | null;
  isInvalidated: boolean;
  // Controls
  startSession: (examId: string, examTitle: string, totalQuestions: number, userId: string, userName?: string) => Promise<void>;
  updateProgress: (currentQuestionIndex: number) => void;
  stopSession: () => void;
}

const ExamSessionContext = createContext<ExamSessionContextType | null>(null);

export const ExamSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, startExamSession } = useAuth();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [examId, setExamId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [isInvalidated, setIsInvalidated] = useState(false);

  const totalQuestionsRef = useRef<number>(0);
  const currentQuestionRef = useRef<number>(0);
  const socketRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressQueueRef = useRef<Array<{ currentQuestion: number; totalQuestions: number }>>([]);

  const connectSocket = useCallback(async () => {
    if (socketRef.current) return; // already connected/connecting
    const { io } = await import('socket.io-client');

    const envUrl = (window as any).VITE_SOCKET_URL;
    let socketUrl = envUrl || window.location.origin;
    const port = window.location.port;
    if (!envUrl && (port === '5173' || port === '5174')) {
      socketUrl = `${window.location.protocol}//${window.location.hostname}:5000`;
    }

    const socket = io(socketUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Subscribe to monitoring and exam rooms when available
      socket.emit('join_monitoring');
      if (examId) socket.emit('subscribe_exam', examId);
      if (user?.id) socket.emit('join_user_room', user.id);
      // Flush any queued progress
      const sid = sessionId;
      const eid = examId;
      if (sid && eid && progressQueueRef.current.length > 0) {
        progressQueueRef.current.forEach((q) => {
          socket.emit('student_progress_update', {
            sessionId: sid,
            examId: eid,
            currentQuestion: q.currentQuestion,
            totalQuestions: q.totalQuestions,
            timestamp: new Date().toISOString(),
            userId: user?.id,
            userName: user?.name || user?.username,
          });
        });
        progressQueueRef.current = [];
      }
    });

    socket.on('session_invalidated', (data: any) => {
      if (data.userId === user?.id && data.examId === examId) {
        setIsInvalidated(true);
        // Stop heartbeat on invalidation
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      }
    });
  }, [examId, sessionId, user?.id, user?.name, user?.username]);

  const sendHeartbeat = useCallback(async () => {
    if (!examId || !sessionId) return;
    const token = sessionStorage.getItem('iqbaes-token');
    if (!token) return;
    try {
      const response = await fetch('/api/monitoring/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          examId,
          sessionId,
          currentQuestion: currentQuestionRef.current,
          totalQuestions: totalQuestionsRef.current,
        }),
      });
      // Ignore non-ok to keep heartbeat robust
      if (response.ok) {
        const data = await response.json();
        // If server marks session abandoned, reflect
        if (data.sessionStatus === 'abandoned' || data.invalidated) {
          setIsInvalidated(true);
        }
      }
    } catch {
      // Silent fail: heartbeat will try again on next tick
    }
  }, [examId, sessionId]);

  const startSession = useCallback(async (examIdArg: string, examTitle: string, totalQuestions: number, userId: string, userName?: string) => {
    if (!user) throw new Error('User not authenticated');
    // Update refs
    totalQuestionsRef.current = totalQuestions;
    setIsInvalidated(false);
    setExamId(examIdArg);
    // Init backend session
    const res = await startExamSession(examIdArg, examTitle);
    const sid = String(res?.sessionId || '');
    const st = res?.startTime ? new Date(res.startTime) : new Date();
    setSessionId(sid);
    setStartTime(st);

    // Ensure socket is connected and rooms joined
    await connectSocket();
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('subscribe_exam', examIdArg);
      socketRef.current.emit('join_user_room', userId);
    }

    // Start heartbeat loop (10s) and send one immediately
    await sendHeartbeat();
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 10000);
  }, [user, startExamSession, connectSocket, sendHeartbeat]);

  const updateProgress = useCallback((currentQuestionIndex: number) => {
    currentQuestionRef.current = currentQuestionIndex;
    if (!sessionId || !examId) {
      // queue until ready
      progressQueueRef.current.push({ currentQuestion: currentQuestionIndex, totalQuestions: totalQuestionsRef.current });
      return;
    }
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      progressQueueRef.current.push({ currentQuestion: currentQuestionIndex, totalQuestions: totalQuestionsRef.current });
      return;
    }
    socket.emit('student_progress_update', {
      sessionId,
      examId,
      currentQuestion: currentQuestionIndex,
      totalQuestions: totalQuestionsRef.current,
      timestamp: new Date().toISOString(),
      userId: user?.id,
      userName: user?.name || user?.username,
    });
  }, [examId, sessionId, user?.id, user?.name, user?.username]);

  const stopSession = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    // Keep socket connection for other app areas; do not disconnect here
    // Reset session-specific state
    setSessionId(null);
    setExamId(null);
    setStartTime(null);
    totalQuestionsRef.current = 0;
    currentQuestionRef.current = 0;
    progressQueueRef.current = [];
  }, []);

  // Cleanup socket on provider unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const value: ExamSessionContextType = {
    sessionId,
    examId,
    startTime,
    isInvalidated,
    startSession,
    updateProgress,
    stopSession,
  };

  return (
    <ExamSessionContext.Provider value={value}>
      {children}
    </ExamSessionContext.Provider>
  );
};

export const useExamSession = (): ExamSessionContextType => {
  const ctx = useContext(ExamSessionContext);
  if (!ctx) throw new Error('useExamSession must be used within ExamSessionProvider');
  return ctx;
};