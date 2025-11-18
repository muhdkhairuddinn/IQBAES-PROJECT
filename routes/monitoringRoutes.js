const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { protect } = require('../middleware/authMiddleware');

// Apply authentication middleware to all monitoring routes
router.use(protect);

// Live monitoring endpoints
router.get('/live-sessions', monitoringController.getLiveSessions);
router.get('/live-sessions-optimized', monitoringController.getLiveSessionsOptimized);
router.get('/stats', monitoringController.getOptimizedStats);
router.post('/resolve-alert', monitoringController.resolveAlert);
router.post('/flag-session', monitoringController.flagSession);
router.get('/violations', monitoringController.getViolations);
router.get('/health', monitoringController.healthCheck);
router.post('/clear-cache', monitoringController.clearCache);

module.exports = router;