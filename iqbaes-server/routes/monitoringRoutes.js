import express from 'express';
import { 
  getLiveSessions, 
  resolveAlert, 
  flagSession, 
  getViolations, 
  healthCheck,
  recordHeartbeat,
  adminInvalidateSession,
  adminRequireRetake,
  adminImposePenalty,
  forceInvalidateSubmission
} from '../controllers/monitoringController.js';
import { recordViolation } from '../controllers/submissionController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Health check endpoint (no auth required)
router.get('/health', healthCheck);

// Lecturer/Admin protected routes
router.use('/live-sessions', protect, authorize('lecturer', 'admin'));
router.use('/resolve-alert', protect, authorize('lecturer', 'admin'));
router.use('/flag-session', protect, authorize('lecturer', 'admin'));
router.get('/violations', protect, authorize('lecturer', 'admin'), getViolations);

// @route   GET /api/monitoring/live-sessions
// @desc    Get live exam sessions and alerts
// @access  Private/Lecturer
router.get('/live-sessions', getLiveSessions);

// @route   POST /api/monitoring/resolve-alert
// @desc    Resolve an alert
// @access  Private/Lecturer
router.post('/resolve-alert', resolveAlert);

// @route   POST /api/monitoring/flag-session
// @desc    Flag a session for review
// @access  Private/Lecturer
router.post('/flag-session', flagSession);

// Admin impact actions
// @route   POST /api/monitoring/admin/invalidate
// @access  Private/Admin
router.post('/admin/invalidate', protect, authorize('admin'), adminInvalidateSession);

// @route   POST /api/monitoring/admin/retake
// @access  Private/Admin
router.post('/admin/retake', protect, authorize('admin'), adminRequireRetake);

// @route   POST /api/monitoring/admin/penalty
// @access  Private/Admin
router.post('/admin/penalty', protect, authorize('admin'), adminImposePenalty);

// @route   POST /api/monitoring/admin/force-invalidate-submission
// @desc    Force invalidate a specific submission (replace all answers with cheating message)
// @access  Private/Admin
router.post('/admin/force-invalidate-submission', protect, authorize('admin'), forceInvalidateSubmission);

// @route   POST /api/monitoring/violations
// @desc    Record a new violation (for students during exams)
// @access  Private/Student
router.post('/violations', protect, recordViolation);

// @route   DELETE /api/monitoring/violations/:id
// @desc    Delete a violation/incident
// @access  Private/Admin
router.delete('/violations/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Delete incident request:', id);
    
    // Import SystemLogs here to avoid circular dependency
    const { default: SystemLogs } = await import('../models/SystemLogs.js');
    
    // Try to find and delete the document
    const result = await SystemLogs.findByIdAndDelete(id);
    
    if (!result) {
      console.log('Incident not found with ID:', id);
      return res.status(404).json({ 
        success: false,
        message: 'Incident not found',
        id: id
      });
    }
    
    console.log('Incident deleted successfully:', id);
    res.json({ 
      success: true,
      message: 'Incident deleted successfully',
      id: id
    });
  } catch (error) {
    console.error('Delete incident error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete incident',
      error: error.message
    });
  }
});

// @route   POST /api/monitoring/heartbeat
// @desc    Record student heartbeat signal during exam
// @access  Private/Student
router.post('/heartbeat', protect, recordHeartbeat);

export default router;