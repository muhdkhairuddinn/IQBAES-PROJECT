import SystemLogs from '../models/SystemLogs.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Get activity logs
// @route   GET /api/logs
// @access  Private
const getLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    // Get activity logs - filter for user activity types, not system/API logs
    // Note: login_failed is excluded from activity logs - it's a routine authentication event
    // that doesn't need to be in the user-facing activity feed (still logged to system logs for security)
    // Admin actions like unlock_account are security events, not simple activity - exclude from activity logs
    const activityTypes = [
      'login', 'logout', 'registration', 'password_reset_request',
      'exam_access', 'exam_start', 'admin_access', 'lecturer_access',
      'exam_created', 'exam_deleted', 'exam_updated',
      'submission', 'submission_created', 'submission_updated',
      // Include violations in activity logs - important to see when students cheat
      'violation', 'ai_proctoring_violation', 'session_flagged'
      // Note: camera_start and heartbeat are too noisy for activity logs
      // Note: admin_unlock_account is a security event, not simple activity
    ];
    
    const logs = await SystemLogs.find({
      type: { $in: activityTypes }
    })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('userId', 'name username')
    .lean();
    
    const totalLogs = await SystemLogs.countDocuments({
      type: { $in: activityTypes }
    });
    
    // Transform logs to match expected format
    const transformedLogs = logs.map(log => {
      // For exam_start logs, extract exam title from details
      let examTitle = null;
      if (log.type === 'exam_start' && log.details) {
        try {
          const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
          examTitle = details.examTitle || null;
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      // For violation logs, extract exam title from details
      if (log.type === 'violation' && log.details) {
        try {
          const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
          examTitle = details.examTitle || log.examId || null;
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      return {
        id: log._id,
        userId: log.userId?._id || log.userId,
        userName: log.userName || log.userId?.name || 'Unknown User',
        type: log.type,
        details: log.details || log.message,
        message: log.message, // Include message field for display
        examId: log.examId || null,
        examTitle: examTitle || log.examId || null, // Include exam title if available
        timestamp: log.timestamp
      };
    });
    
    res.json(transformedLogs);
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ message: 'Error fetching activity logs', details: error.message });
  }
};

// @desc    Create a new log entry
// @route   POST /api/logs
// @access  Private
const createLog = async (req, res) => {
  try {
    const logData = req.body;
    console.log('Received log data:', JSON.stringify(logData, null, 2));
    
    // Validate required fields
    if (!logData.type) {
      return res.status(400).json({ 
        message: 'Invalid log data', 
        details: 'Type field is required',
        receivedData: req.body
      });
    }
    
    // Ensure message field is properly set - prioritize details field from frontend
    const message = logData.details || logData.message || 'No message provided';
    console.log('Setting message field to:', message);
    
    const logObject = {
        type: logData.type,
        message: message,
        details: logData.details || message,
        userId: req.user.id || req.user._id,
        userName: logData.userName || req.user.name,
        timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
        level: logData.level || 'info'
    };
    
    console.log('Creating log with object:', JSON.stringify(logObject, null, 2));
    const log = new SystemLogs(logObject);
    
    console.log('Prepared log object:', JSON.stringify(log.toObject(), null, 2));
    const createdLog = await log.save();
    res.status(201).json(createdLog.toJSON());
  } catch (error) {
    console.error('Log creation error:', error.message);
    console.error('Validation errors:', error.errors);
    // Return detailed validation errors for debugging
    const validationDetails = error.errors ? Object.keys(error.errors).map(key => ({
      field: key,
      message: error.errors[key].message,
      value: error.errors[key].value
    })) : [];
    res.status(400).json({ 
      message: 'Invalid log data', 
      details: error.message,
      validationErrors: validationDetails,
      receivedData: req.body
    });
  }
};

// @desc    Get system log files
// @route   GET /api/logs/system
// @access  Private/Admin
const getSystemLogs = async (req, res) => {
  try {
    const logsDir = path.join(__dirname, '..', 'logs');
    
    // Check if logs directory exists
    if (!fs.existsSync(logsDir)) {
      return res.status(404).json({ message: 'Logs directory not found' });
    }

    // Get all log files
    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .sort((a, b) => b.localeCompare(a)); // Sort by date (newest first)

    res.json({ files });
  } catch (error) {
    console.error('Error reading logs directory:', error);
    res.status(500).json({ message: 'Error reading system logs', details: error.message });
  }
};

// @desc    Get specific log file content
// @route   GET /api/logs/system/:filename
// @access  Private/Admin
const getLogFileContent = async (req, res) => {
  try {
    const { filename } = req.params;
    const { page = 1, limit = 50, priority, search } = req.query;
    
    // Validate filename to prevent directory traversal
    if (!filename.match(/^app-\d{4}-\d{2}-\d{2}\.log$/)) {
      return res.status(400).json({ message: 'Invalid log filename' });
    }

    const logsDir = path.join(__dirname, '..', 'logs');
    const filePath = path.join(logsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Log file not found' });
    }

    // Read file content
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.trim().split('\n').filter(line => line.trim());

    // Parse JSON logs
    let allLogs = [];
    for (const line of lines) {
      try {
        const logEntry = JSON.parse(line);
        allLogs.push(logEntry);
      } catch (parseError) {
        // Skip invalid JSON lines
        console.warn('Invalid JSON in log file:', line);
      }
    }

    // Calculate stats from ALL logs before filtering
    const stats = {
      total: allLogs.length,
      high: allLogs.filter(log => log.priority === 'HIGH').length,
      medium: allLogs.filter(log => log.priority === 'MEDIUM').length,
      low: allLogs.filter(log => log.priority === 'LOW').length,
      info: allLogs.filter(log => log.priority === 'INFO').length,
      suspicious: allLogs.filter(log => log.isSuspicious).length,
      failed_auth: allLogs.filter(log => log.isAuth && !log.success).length,
      successful_auth: allLogs.filter(log => log.isAuth && log.success).length
    };

    // Now apply filters for display
    let filteredLogs = [...allLogs];

    // Filter by priority if specified
    if (priority && priority !== 'all') {
      filteredLogs = filteredLogs.filter(log => log.priority?.toLowerCase() === priority.toLowerCase());
    }

    // Filter by search term if specified
    if (search) {
      const searchLower = search.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        JSON.stringify(log).toLowerCase().includes(searchLower)
      );
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

    res.json({
      logs: paginatedLogs,
      totalLogs: filteredLogs.length, // Total after filtering
      currentPage: parseInt(page),
      totalPages: Math.ceil(filteredLogs.length / limit),
      hasNextPage: endIndex < filteredLogs.length,
      hasPrevPage: page > 1,
      stats: stats // Include overall stats regardless of filters
    });

  } catch (error) {
    console.error('Error reading log file:', error);
    res.status(500).json({ message: 'Error reading log file', details: error.message });
  }
};

// @desc    Clear all activity logs
// @route   DELETE /api/logs
// @access  Private/Admin
const clearSystemLogs = async (req, res) => {
  try {
    await SystemLogs.deleteMany({});
    res.json({ message: 'All system logs cleared successfully' });
  } catch (error) {
    console.error('Error clearing system logs:', error);
    res.status(500).json({ message: 'Error clearing system logs', details: error.message });
  }
};

// @desc    Clear system log file
// @route   DELETE /api/logs/system/:filename
// @access  Private/Admin
const clearSystemLogFile = async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!filename.match(/^app-\d{4}-\d{2}-\d{2}\.log$/)) {
      return res.status(400).json({ message: 'Invalid log filename' });
    }

    const logsDir = path.join(__dirname, '..', 'logs');
    const filePath = path.join(logsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Log file not found' });
    }

    // CRITICAL: For files that are actively being written to (like today's log file),
    // we need to handle potential file locks on Windows. Use truncateSync which is safer
    // than writeFileSync when the file might be open by another process.
    // Retry logic to handle temporary file locks
    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
      try {
        // Use truncateSync to clear the file - safer for files that might be open
        // This truncates the file to 0 bytes without needing to open it for writing
        fs.truncateSync(filePath, 0);
        
        // Verify the file was cleared
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          res.json({ message: `System log file ${filename} cleared successfully` });
          return;
        } else {
          throw new Error('File was not cleared completely');
        }
      } catch (error) {
        lastError = error;
        retries--;
        
        // If it's a file lock error (EBUSY on Windows, EACCES on Unix), wait and retry
        if (error.code === 'EBUSY' || error.code === 'EACCES' || error.code === 'EPERM') {
          console.log(`⚠️ File ${filename} is locked, retrying... (${retries} attempts left)`);
          // Wait 100ms before retrying
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        } else {
          // For other errors, throw immediately
          throw error;
        }
      }
    }
    
    // If all retries failed, throw the last error
    throw lastError || new Error('Failed to clear log file after retries');
    
  } catch (error) {
    console.error('Error clearing system log file:', error);
    res.status(500).json({ 
      message: 'Error clearing system log file', 
      details: error.message,
      code: error.code || 'UNKNOWN'
    });
  }
};

// @desc    Clear all system log files
// @route   DELETE /api/logs/system
// @access  Private/Admin
const clearAllSystemLogs = async (req, res) => {
  try {
    const logsDir = path.join(__dirname, '..', 'logs');
    
    // Check if logs directory exists
    if (!fs.existsSync(logsDir)) {
      return res.status(404).json({ message: 'Logs directory not found' });
    }

    // Get all log files and clear them
    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'));
    
    let clearedCount = 0;
    const failedFiles = [];
    
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      
      // Use truncateSync with retry logic (same as clearSystemLogFile)
      let retries = 3;
      let success = false;
      
      while (retries > 0 && !success) {
        try {
          fs.truncateSync(filePath, 0);
          const stats = fs.statSync(filePath);
          if (stats.size === 0) {
            clearedCount++;
            success = true;
          } else {
            throw new Error('File was not cleared completely');
          }
        } catch (error) {
          retries--;
          if (error.code === 'EBUSY' || error.code === 'EACCES' || error.code === 'EPERM') {
            // Wait and retry for file lock errors
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            // For other errors, mark as failed and continue
            failedFiles.push({ file, error: error.message });
            break;
          }
        }
      }
      
      if (!success && retries === 0) {
        failedFiles.push({ file, error: 'Failed after retries' });
      }
    }

    if (failedFiles.length > 0) {
      console.warn(`⚠️ Failed to clear ${failedFiles.length} file(s):`, failedFiles);
    }

    res.json({ 
      message: `Cleared ${clearedCount} of ${files.length} log files`, 
      clearedFiles: clearedCount,
      totalFiles: files.length,
      failedFiles: failedFiles.length > 0 ? failedFiles : undefined
    });
  } catch (error) {
    console.error('Error clearing all system logs:', error);
    res.status(500).json({ message: 'Error clearing all system logs', details: error.message });
  }
};

// @desc    Get security events from database (login, logout, etc.)
// @route   GET /api/logs/security/database
// @access  Private/Admin
const getDatabaseSecurityLogs = async (req, res) => {
  try {
    const { limit = 1000 } = req.query;
    
    // Get ONLY truly security-relevant events from database
    // CRITICAL: Exclude routine activity (heartbeats, progress updates, page views, exam_access)
    // These belong in Activity Logs, not Security Events
    const securityTypes = [
      // Authentication events
      'login', 'logout', 'login_failed', 
      // Account security
      'password_reset_request', 'registration',
      // CRITICAL: Violations are NOT security events - they're routine student activity
      // They appear in Activity Logs, not Security Events
      // Only session_flagged is a security event (admin action)
      'session_flagged',
      // Admin security actions
      'admin_invalidate_session', 'admin_impose_penalty', 'admin_require_retake',
      'admin_force_invalidate_submission', 'admin_unlock_account'
    ];
    
    // EXCLUDE routine activity types that should NOT appear in Security Events
    // These belong in Activity Logs:
    // - 'heartbeat' (routine progress updates)
    // - 'page_view' (routine navigation)
    // - 'exam_access' (routine exam access)
    // - 'exam_start' (routine exam start)
    // - 'submission' (routine submission - unless flagged)
    // - 'api_request' (routine API calls)
    
    const logs = await SystemLogs.find({
      type: { $in: securityTypes }
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .populate('userId', 'name username')
    .lean();
    
    // Transform database logs to match SystemLogEntry format
    const transformedLogs = logs.map(log => {
      // Determine priority based on type and level
      let priority = 'INFO';
      if (log.type === 'login_failed') {
        priority = 'HIGH';
      } else if (log.type === 'session_flagged' || log.type === 'admin_invalidate_session') {
        priority = 'MEDIUM';
      } else if (log.type === 'login' || log.type === 'logout') {
        priority = 'LOW';
      }
      
      // Determine if it's an auth event
      const isAuth = ['login', 'logout', 'login_failed', 'registration', 'password_reset_request'].includes(log.type);
      
      // Parse details if it's an object
      const details = typeof log.details === 'object' ? log.details : {};
      
      // Determine method based on log type if not in details
      let method = details.method;
      if (!method) {
        // Default methods for auth events
        if (log.type === 'login' || log.type === 'logout' || log.type === 'login_failed') {
          method = 'POST';
        } else if (log.type === 'registration') {
          method = 'POST';
        } else {
          method = 'POST'; // Default for security events
        }
      }
      
      return {
        timestamp: log.timestamp?.toISOString() || new Date().toISOString(),
        priority,
        action: log.message || `[${log.type.toUpperCase()}]`,
        method: method,
        url: details.url || `/api/auth/${log.type}`,
        statusCode: details.statusCode || (isAuth ? 200 : 200),
        duration: details.duration || 0,
        userId: log.userId?._id?.toString() || log.userId?.toString() || 'anonymous',
        userSource: 'database',
        ip: details.ipAddress || 'unknown',
        userAgent: details.userAgent || 'unknown',
        securityFlags: log.securityFlags || [],
        success: log.type !== 'login_failed',
        isAuth,
        isSuspicious: log.type === 'session_flagged', // Only session_flagged is suspicious, violations are routine activity
        // Add database-specific fields
        type: log.type,
        userName: log.userName || log.userId?.name || log.userId?.username || 'Unknown',
        message: log.message
      };
    });
    
    res.json({
      logs: transformedLogs,
      totalLogs: transformedLogs.length
    });
  } catch (error) {
    console.error('Error fetching database security logs:', error);
    res.status(500).json({ message: 'Error fetching database security logs', details: error.message });
  }
};

// @desc    Clear database security logs (login, logout, violations, etc.)
// @route   DELETE /api/logs/security/database
// @access  Private/Admin
// @query   date (optional) - Clear logs for a specific date (YYYY-MM-DD format)
const clearDatabaseSecurityLogs = async (req, res) => {
  try {
    // Get the security types that are shown in Security Events
    const securityTypes = [
      'login', 'logout', 'login_failed', 'registration', 'password_reset_request',
      // CRITICAL: Violations are NOT security events - they're routine student activity
      // They appear in Activity Logs, not Security Events
      'session_flagged', // Only session_flagged is a security event (admin action)
      'admin_invalidate_session', 'admin_impose_penalty', 'admin_require_retake',
      'admin_force_invalidate_submission', 'admin_unlock_account'
    ];
    
    // Build query - filter by date if provided
    const query = { type: { $in: securityTypes } };
    
    // If date is provided, filter logs for that specific date
    if (req.query.date) {
      const dateStr = req.query.date; // e.g., "2025-11-12"
      const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      
      if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        const month = parseInt(dateMatch[2]) - 1; // JavaScript months are 0-indexed
        const day = parseInt(dateMatch[3]);
        
        // Create date range for the entire day (00:00:00 to 23:59:59.999)
        const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        
        query.timestamp = {
          $gte: startOfDay,
          $lte: endOfDay
        };
        
        console.log(`🗑️ Clearing database security logs for date: ${dateStr} (${startOfDay.toISOString()} to ${endOfDay.toISOString()})`);
      } else {
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
      }
    }
    
    const result = await SystemLogs.deleteMany(query);
    
    res.json({ 
      message: req.query.date 
        ? `Database security logs cleared for ${req.query.date}` 
        : 'All database security logs cleared successfully',
      deletedCount: result.deletedCount,
      date: req.query.date || 'all'
    });
  } catch (error) {
    console.error('Error clearing database security logs:', error);
    res.status(500).json({ message: 'Error clearing database security logs', details: error.message });
  }
};

export { getLogs, createLog, getSystemLogs, getLogFileContent, clearSystemLogs, clearSystemLogFile, clearAllSystemLogs, getDatabaseSecurityLogs, clearDatabaseSecurityLogs };
