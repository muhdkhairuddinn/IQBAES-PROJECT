import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SessionEventPayload {
  sessionId: string;
  userId: string;
  userName?: string;
  examId: string;
  examTitle?: string;
  startTime: string | Date;
  timeRemaining?: number;
  violationCount?: number;
  ipAddress?: string;
  userAgent?: string;
  currentQuestion?: number;
  totalQuestions?: number;
  status?: 'active' | 'flagged' | 'submitted' | 'expired' | 'abandoned';
  lastActivity?: string | Date;
}

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export function useExamMonitoringSocket({
  examId,
  onSessionCreated,
  onSessionUpdated,
  onAlertCreated,
  onAlertResolved,
  serverUrl,
}: {
  examId: string | null;
  onSessionCreated?: (payload: SessionEventPayload) => void;
  onSessionUpdated?: (payload: SessionEventPayload) => void;
  onAlertCreated?: (payload: any) => void;
  onAlertResolved?: (payload: any) => void;
  serverUrl?: string;
}) {
  const socketRef = useRef<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('disconnected');

  // Store callbacks in refs to prevent socket recreation on callback changes
  const onSessionCreatedRef = useRef(onSessionCreated);
  const onSessionUpdatedRef = useRef(onSessionUpdated);
  const onAlertCreatedRef = useRef(onAlertCreated);
  const onAlertResolvedRef = useRef(onAlertResolved);

  // Update refs when callbacks change
  useEffect(() => {
    onSessionCreatedRef.current = onSessionCreated;
    onSessionUpdatedRef.current = onSessionUpdated;
    onAlertCreatedRef.current = onAlertCreated;
    onAlertResolvedRef.current = onAlertResolved;
  }, [onSessionCreated, onSessionUpdated, onAlertCreated, onAlertResolved]);

  useEffect(() => {
    // Determine socket URL - prefer explicit env/serverUrl; in dev map vite (5173/5174) to backend (5000)
    const envUrl = (import.meta as any)?.env?.VITE_SOCKET_URL as string | undefined;
    let socketUrl = serverUrl || envUrl || window.location.origin;
    const port = window.location.port;
    if (!serverUrl && !envUrl && (port === '5173' || port === '5174')) {
      socketUrl = `${window.location.protocol}//${window.location.hostname}:5000`;
    }

    // Don't recreate socket if one already exists and connected
    if (socketRef.current?.connected) {
      console.log('🔌 Socket already connected, skipping recreation');
      return;
    }

    console.log('🔌 Connecting to Socket.IO server:', socketUrl);

    // Initialize socket connection with improved stability
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500, // Faster reconnection
      reconnectionDelayMax: 3000, // Max 3 seconds between attempts
      timeout: 20000,
      path: '/socket.io',
      // Improve connection stability
      forceNew: false, // Reuse existing connection if possible
      upgrade: true, // Allow transport upgrades
      rememberUpgrade: true, // Remember successful transport
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Socket.IO connected:', socket.id);
      setConnectionStatus('connected');
      
      // Always join monitoring_all room for global events (when examId is null, this is the only room)
      // The server automatically adds all connections to monitoring_all, but we'll explicitly join too
      socket.emit('join_monitoring');
      
      // Also subscribe to specific exam room if provided
      if (examId) {
        console.log('📡 Subscribing to exam room:', examId);
        socket.emit('subscribe_exam', examId);
      } else {
        console.log('📡 Listening to all exams (monitoring_all room)');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error);
      setConnectionStatus('disconnected');
    });

    socket.on('disconnect', (reason) => {
      // Only log if it's not a manual cleanup
      if (reason !== 'io client disconnect') {
        console.warn('⚠️ Socket.IO disconnected:', reason);
        // If it's a transport error, don't mark as disconnected - it will reconnect
        if (reason === 'transport close' || reason === 'transport error') {
          setConnectionStatus('reconnecting');
          return; // Don't set to disconnected - let reconnection handle it
        }
      }
      setConnectionStatus('disconnected');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 Socket.IO reconnecting... attempt:', attemptNumber);
      setConnectionStatus('reconnecting');
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('✅ Socket.IO reconnected after', attemptNumber, 'attempts');
      setConnectionStatus('connected');
      // Re-subscribe after reconnect to ensure we receive all events
      socket.emit('join_monitoring');
      if (examId) {
        socket.emit('subscribe_exam', examId);
      }
      // Note: Sessions should persist in state during reconnection
      // The dashboard state is maintained, so sessions won't disappear
    });
    
    // Handle reconnection errors gracefully
    socket.on('reconnect_error', (error) => {
      console.warn('⚠️ Socket.IO reconnection error:', error);
      // Keep status as reconnecting - don't give up
      setConnectionStatus('reconnecting');
    });
    
    // Handle reconnection failures - but we have infinite attempts, so this shouldn't fire
    socket.on('reconnect_failed', () => {
      console.error('❌ Socket.IO reconnection failed after all attempts');
      setConnectionStatus('disconnected');
    });

    // Listen for session create/update events - use refs to avoid dependency issues
    socket.on('live_session_created', (payload: SessionEventPayload) => {
      console.log('📥 Received live_session_created:', payload);
      onSessionCreatedRef.current?.(payload);
    });

    socket.on('live_session_updated', (payload: SessionEventPayload) => {
      console.log('📥 Received live_session_updated:', payload);
      onSessionUpdatedRef.current?.(payload);
    });

    // Listen for alert events
    socket.on('alert_created', (payload: any) => {
      console.log('📥 Received alert_created:', payload);
      onAlertCreatedRef.current?.(payload);
    });

    socket.on('alert_resolved', (payload: any) => {
      console.log('📥 Received alert_resolved:', payload);
      onAlertResolvedRef.current?.(payload);
    });

    return () => {
      try {
        console.log('🧹 Cleaning up socket connection');
        socket.off('live_session_created');
        socket.off('live_session_updated');
        socket.off('alert_created');
        socket.off('alert_resolved');
        socket.disconnect();
      } catch (error) {
        console.error('Error cleaning up socket:', error);
      }
      socketRef.current = null;
    };
  }, [examId, serverUrl]); // Removed callbacks from dependencies

  return { connectionStatus };
}