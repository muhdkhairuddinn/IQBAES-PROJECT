import express from 'express';
import { getLogs, createLog, getSystemLogs, getLogFileContent, clearSystemLogs, clearSystemLogFile, clearAllSystemLogs, getDatabaseSecurityLogs, clearDatabaseSecurityLogs } from '../controllers/logController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Activity logs routes
router.route('/')
  .get(protect, getLogs)
  .post(protect, createLog)
  .delete(protect, admin, clearSystemLogs);

// System logs routes
router.route('/system')
  .get(protect, admin, getSystemLogs)
  .delete(protect, admin, clearAllSystemLogs);

router.route('/system/:filename')
  .get(protect, admin, getLogFileContent)
  .delete(protect, admin, clearSystemLogFile);

// Database security logs route (login, logout, etc.)
router.route('/security/database')
  .get(protect, admin, getDatabaseSecurityLogs)
  .delete(protect, admin, clearDatabaseSecurityLogs);

export default router;
