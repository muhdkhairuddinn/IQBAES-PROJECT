import { Server } from 'socket.io';

let ioInstance = null;

export function initIO(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: (origin, callback) => callback(null, true), // allow all dev origins (secured by API auth)
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Improve connection stability
    pingTimeout: 60000, // 60 seconds - how long to wait for pong before considering connection dead
    pingInterval: 25000, // 25 seconds - how often to send ping
    transports: ['websocket', 'polling'], // Allow both transports
    allowEIO3: true, // Backward compatibility
  });

  ioInstance.on('connection', (socket) => {
    console.log('✅ New socket connection:', socket.id);

    // Always join a global monitoring room so dashboards with "All Exams" receive events
    try {
      socket.join('monitoring_all');
      console.log('📡 Socket', socket.id, 'joined monitoring_all room');
    } catch (error) {
      console.error('Error joining monitoring_all:', error);
    }

    // Handle explicit join_monitoring request (redundant but explicit)
    socket.on('join_monitoring', () => {
      try {
        socket.join('monitoring_all');
        console.log('📡 Socket', socket.id, 'explicitly joined monitoring_all room');
      } catch (error) {
        console.error('Error joining monitoring_all:', error);
      }
    });

    // Basic room subscription by examId if provided
    socket.on('subscribe_exam', (examId) => {
      if (examId) {
        const room = `exam_${examId}`;
        socket.join(room);
        console.log('📡 Socket', socket.id, 'joined exam room:', room);
      }
    });

    // Allow admin dashboard clients to join admin_dashboard room for real-time updates
    socket.on('join_admin_dashboard', () => {
      try {
        socket.join('admin_dashboard');
        console.log('📡 Socket', socket.id, 'joined admin_dashboard room');
      } catch (error) {
        console.error('Error joining admin_dashboard:', error);
      }
    });

    // Allow students to join their user-specific room for personal notifications
    socket.on('join_user_room', (userId) => {
      if (userId) {
        try {
          const room = `user_${userId}`;
          socket.join(room);
          console.log('📡 Socket', socket.id, 'joined user room:', room);
        } catch (error) {
          console.error('Error joining user room:', error);
        }
      }
    });

    // CRITICAL: Handle real-time progress updates directly from student clients
    // MongoDB is used ONLY for persistence, NOT for controlling live updates
    // Real-time updates are pushed instantly via WebSocket, MongoDB updates happen asynchronously
    socket.on('student_progress_update', async (data) => {
      try {
        const { sessionId, examId, currentQuestion, totalQuestions, userId, userName, timestamp } = data;
        
        if (!sessionId || !examId || typeof currentQuestion !== 'number') {
          return;
        }
        
        // CRITICAL: Broadcast FIRST with client data (instant), then fetch session data for enhancement
        // This ensures real-time updates are not delayed by database operations
        
        // Import models dynamically to avoid circular dependencies
        const { default: LiveExamSession } = await import('./models/LiveExamSession.js');
        const { default: Exam } = await import('./models/Exam.js');
        
        // Start MongoDB operations in parallel (non-blocking)
        const sessionPromise = LiveExamSession.findOne({
          _id: sessionId,
          status: { $in: ['active', 'flagged'] }
        }).populate('examId', 'durationMinutes title').populate('userId', 'name username').lean();
        
        const examPromise = Exam.findById(examId).select('durationMinutes title').lean();
        
        // CRITICAL: Broadcast IMMEDIATELY with client data (no MongoDB wait)
        // Use client-provided data for instant updates, enhance with session data if available
        const now = new Date();
        
        // Create initial payload with client data (instant)
        let payload = {
          sessionId: sessionId.toString(),
          userId: userId || 'unknown', // Use client-provided userId
          userName: userName || 'Unknown', // Use client-provided userName
          examId: examId.toString(),
          examTitle: 'Loading...', // Will be enhanced if session data available
          examDuration: 120, // Default, will be enhanced
          startTime: now, // Default, will be enhanced
          timeRemaining: 120, // Default, will be enhanced
          violationCount: 0, // Default, will be enhanced
          status: 'active', // Default, will be enhanced
          currentQuestion: currentQuestion, // CRITICAL: Use value from student client (real-time)
          totalQuestions: totalQuestions || 0,
          progressCurrent: currentQuestion, // Also include for compatibility
          progressTotal: totalQuestions || 0, // Also include for compatibility
          lastActivity: now,
        };
        
        // Broadcast FIRST (instant, no MongoDB delay)
        ioInstance.to(`exam_${examId}`).emit('live_session_updated', payload);
        ioInstance.to('monitoring_all').emit('live_session_updated', payload);
        
        
        // THEN fetch session data and enhance payload (non-blocking, for accuracy)
        Promise.all([sessionPromise, examPromise]).then(([session, exam]) => {
          if (session) {
            // Calculate time remaining with actual session data
            const examDuration = session.examId?.durationMinutes || exam?.durationMinutes || 120;
            const elapsedMs = now.getTime() - new Date(session.startTime).getTime();
            const timeRemainingMs = Math.max(0, examDuration * 60000 - elapsedMs);
            const timeRemainingMinutes = Math.round(timeRemainingMs / 60000);
            
            // Enhanced payload with accurate session data
            // CRITICAL: Always use client's currentQuestion (most up-to-date from student's device)
            const enhancedPayload = {
              sessionId: sessionId.toString(),
              userId: session.userId?._id?.toString() || session.userId?.toString() || userId || 'unknown',
              userName: session.userId?.name || session.userId?.username || userName || 'Unknown',
              examId: examId.toString(),
              examTitle: session.examId?.title || exam?.title || 'Unknown',
              examDuration: examDuration,
              startTime: session.startTime,
              timeRemaining: timeRemainingMinutes,
              violationCount: session.violationsCount || 0,
              status: session.status,
              currentQuestion: currentQuestion, // CRITICAL: Client value is always most current
              totalQuestions: totalQuestions || session.progressTotal || 0,
              progressCurrent: currentQuestion, // Also include for compatibility
              progressTotal: totalQuestions || session.progressTotal || 0, // Also include for compatibility
              lastActivity: now,
            };
            
            // Broadcast enhanced payload (it has more accurate data like exam title, violation count)
            // The initial broadcast already sent currentQuestion, so this is just for data enhancement
            ioInstance.to(`exam_${examId}`).emit('live_session_updated', enhancedPayload);
            ioInstance.to('monitoring_all').emit('live_session_updated', enhancedPayload);
          }
        }).catch((error) => {
          console.warn('⚠️ Session data fetch failed (non-critical, already broadcasted):', error.message);
        });
        
        // CRITICAL: Update MongoDB AFTER broadcasting (non-blocking, for persistence only)
        // This ensures real-time updates are not delayed by database writes
        LiveExamSession.findByIdAndUpdate(
          sessionId,
          {
            $set: {
              progressCurrent: currentQuestion,
              progressTotal: totalQuestions || 0,
              lastHeartbeat: now
            }
          },
          { new: true }
        ).catch((dbError) => {
          // Log but don't fail - MongoDB is for persistence, not real-time control
          console.warn('⚠️ MongoDB update failed (non-critical for real-time):', dbError.message);
        });
        
      } catch (error) {
        console.error('❌ Error handling student_progress_update:', error);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('⚠️ Socket disconnected:', socket.id, 'reason:', reason);
    });
  });

  return ioInstance;
}

export function getIO() {
  return ioInstance;
}

