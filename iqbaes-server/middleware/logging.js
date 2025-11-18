import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { getClientIp } from '../utils/getClientIp.js';
import SystemLogs from '../models/SystemLogs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Helper function to extract user from token
const extractUserFromRequest = (req) => {
  try {
    // Try to get user from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return { id: decoded.id, source: 'bearer_token' };
    }
    
    // Try to get user from refresh token cookie
    if (req.cookies?.refreshToken) {
      const decoded = jwt.verify(req.cookies.refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
      return { id: decoded.id, source: 'refresh_token' };
    }
    
    // If req.user is set by middleware
    if (req.user?.id) {
      return { id: req.user.id, source: 'middleware' };
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

// Helper function to map URL paths to SystemLogs types
const getLogTypeFromUrl = (urlPath, statusCode) => {
  // Violations are activity logs, not system logs
  if (urlPath.includes('/api/monitoring/violations')) {
    return 'violation'; // This will appear in Activity Logs (not SystemLogs)
  }
  
  if (urlPath.includes('/auth/login')) {
    // Login failures are logged as 'api_request' to prevent them from appearing in activity logs
    // They'll still be logged to system logs for security monitoring, but not in the user-facing feed
    return statusCode === 200 ? 'login' : 'api_request';
  }
  if (urlPath.includes('/auth/logout')) return 'logout';
  if (urlPath.includes('/auth/register')) return 'registration';
  if (urlPath.includes('/auth/')) return 'api_request';
  // Skip admin invalidate endpoint - it's logged directly by the controller with proper user info
  if (urlPath.includes('/monitoring/admin/invalidate')) return 'api_request'; // Filter from activity logs
  if (urlPath.includes('/admin/')) return 'admin_access';
  if (urlPath.includes('/lecturer/')) return 'lecturer_access';
  if (urlPath.includes('/exams/')) {
    if (urlPath.includes('/submit')) return 'submission_created';
    if (urlPath.includes('/create')) return 'exam_created';
    return 'exam_access';
  }
  // Note: Retake operations are logged directly by controllers, not by middleware
  // Controllers use type 'submission_updated' which is in activityTypes array
  // Skip active-sessions endpoint - it's routine monitoring, not a user action
  if (urlPath.includes('/submissions/active-sessions')) return 'api_request'; // Filter from activity logs
  if (urlPath.includes('/submissions/')) return 'submission';
  if (urlPath.includes('/ai/')) return 'ai_service_request';
  if (urlPath.includes('/courses/')) return 'page_view';
  return 'api_request';
};

// Helper function to map priority to log level
const getLogLevelFromPriority = (priority) => {
  switch (priority) {
    case 'HIGH': return 'error';
    case 'MEDIUM': return 'warn';
    case 'LOW': return 'info';
    case 'INFO': return 'info';
    default: return 'info';
  }
};

// Determine priority level for easy filtering
const getPriorityLevel = (method, url, statusCode, securityFlags) => {
  const urlPath = url.split('?')[0];
  
  // HIGH PRIORITY - Security issues that need immediate attention
  if (statusCode === 423 || statusCode === 429) return 'HIGH';
  if (securityFlags.includes('ACCOUNT_LOCKED') || securityFlags.includes('RATE_LIMITED')) return 'HIGH';
  if (securityFlags.includes('BRUTE_FORCE_PROTECTION') || securityFlags.includes('POTENTIAL_ATTACK')) return 'HIGH';
  
  // MEDIUM PRIORITY - Failed authentication attempts
  if (urlPath.includes('/auth/') && (statusCode === 401 || statusCode === 403)) return 'MEDIUM';
  if (securityFlags.includes('FAILED_LOGIN') || securityFlags.includes('UNAUTHORIZED_ACCESS')) return 'MEDIUM';
  
  // LOW PRIORITY - Normal operations and successful actions
  if (statusCode < 400) return 'LOW';
  
  // INFO - Everything else
  return 'INFO';
};

// Get human-readable action description
const getActionDescription = (method, url, statusCode, body, user) => {
  const urlPath = url.split('?')[0];
  
  // Authentication actions
  // NOTE: Login/logout events are logged directly by authController.js with user names
  // We skip middleware logging to avoid duplicate entries (email vs name)
  // This ensures only name-based logs appear in activity logs (e.g., "Dr. Ahmad Zulkifli logged in successfully")
  if (urlPath === '/api/auth/login') {
    // Skip successful logins - authController.js logs them with user names
    if (statusCode === 200) return null;
    // Skip login failures (401) from activity logs - they're routine authentication events
    // that don't need to be in the user-facing activity feed (still logged to system logs for security)
    if (statusCode === 401) return null; // Skip failed login attempts from activity logs
    // Skip account locked (423) and rate limiting (429) from activity logs
    // These are security events, not simple user activity - they belong in System Logs only
    if (statusCode === 403 || statusCode === 423 || statusCode === 429) {
      return null; // Skip security events from activity logs
    }
    return null; // Skip other login attempts
  }
  
  if (urlPath === '/api/auth/register') {
    const username = user?.username || body?.username || 'unknown';
    if (statusCode === 201) return `✅ NEW USER: ${username} (${body?.role || 'student'})`;
    if (statusCode === 400) return `❌ REGISTRATION FAILED: ${username} (Validation error)`;
    return `📝 Registration attempt: ${username}`;
  }
  
  // Skip token refresh calls (routine authentication maintenance, not user actions)
  // Return null for ALL token refresh calls (both successful and failed) to prevent them from appearing in activity logs
  // Token refresh failures (401) are routine authentication events and don't need to be in activity logs
  // They will still be logged to system logs if needed for debugging, but not in the user-facing activity feed
  if (urlPath.includes('/auth/refresh')) {
    return null; // Skip all token refresh calls (successful and failed) from activity logs
  }
  
  // Skip logout events - authController.js logs them with user names
  // This ensures only name-based logs appear in activity logs (e.g., "Dr. Ahmad Zulkifli logged out")
  if (urlPath === '/api/auth/logout') return null;
  
  // User management
  if (urlPath === '/api/users/profile') {
    if (method === 'GET') return statusCode < 400 ? '👤 Profile viewed' : '❌ Profile access denied';
    if (method === 'PUT') return statusCode < 400 ? '➏️ Profile updated' : '❌ Profile update failed';
  }
  
  // Exam actions
  if (urlPath.startsWith('/api/exams/')) {
    if (method === 'POST' && urlPath.endsWith('/submit')) return statusCode < 400 ? '📝 Exam submitted' : '❌ Exam submission failed';
    if (method === 'GET') return statusCode < 400 ? '📖 Exam accessed' : '❌ Exam access denied';
    if (method === 'POST') return statusCode < 400 ? '➕ Exam created' : '❌ Exam creation failed';
  }
  
  // Submissions
  if (urlPath.startsWith('/api/submissions/')) {
    // Skip active-sessions logging entirely (routine monitoring, not user actions)
    // 401 errors are routine authentication failures and don't need to be in activity logs
    // They're still logged to system logs for security monitoring, but not in the user-facing feed
    if (urlPath.includes('active-sessions')) {
      // Skip all active-sessions logs from activity feed (including 401 errors)
      // These are routine monitoring checks and authentication failures that don't need to be shown
      return null;
    }
    
    // Skip start-session calls (routine session initialization, not user actions)
    // Also skip 400 errors from start-session (expected validation errors when exam is expired/invalidated)
    if (urlPath.includes('start-session')) {
      if (statusCode < 400) return null; // Successful calls
      if (statusCode === 400) return null; // Validation errors (exam expired, not available, etc.)
    }
    
    // Skip retake operations - they're logged directly by the controllers
    // Controllers create logs with detailed student/exam info and type 'submission_updated'
    // which appears in activity logs. We skip middleware logging to avoid duplicates.
    if (urlPath.includes('allow-retake') || urlPath.includes('revoke-retake')) {
      if (statusCode >= 500) return '❌ Retake operation failed (Server error)';
      // Skip successful retake operations (logged by controller) and routine 400 validation errors
      return null;
    }
    
    // Skip GET requests for submissions (routine data fetching, not user actions)
    if (method === 'GET' && statusCode < 400) return null;
    
    // Log actual exam submission (student submitting exam answers) - this is a user action
    // Only log POST requests that are actual submissions, not session management
    if (method === 'POST' && !urlPath.includes('allow-retake') && !urlPath.includes('revoke-retake') && !urlPath.includes('start-session')) {
      // Only log successful submissions or serious errors (500+), not routine 400 validation errors
      if (statusCode < 400) return '📤 Exam submitted';
      if (statusCode >= 500) return '❌ Submission failed (Server error)';
      // Skip routine 400 validation errors (exam expired, validation failed, etc.)
      return null;
    }
  }
  
  // Skip bootstrap calls (routine data fetching, not user actions)
  if (urlPath === '/api/bootstrap' && statusCode < 400) return null;
  
  // Skip heartbeat calls (monitoring, not user actions)
  // Heartbeats are activity logs, not system events - skip ALL (including errors)
  if (urlPath.includes('/heartbeat')) return null;
  
  // Violations are activity logs, not system events
  // They should appear in Activity Logs (via consolidatedLogger), but NOT in SystemLogs
  // The consolidatedLogger will handle logging violations to Activity Logs
  // We return a description here so they appear in Activity Logs, but they won't be saved to SystemLogs
  // (because isRoutineActivity check in consolidatedLogger prevents SystemLogs save)
  if (urlPath.includes('/api/monitoring/violations')) {
    if (statusCode >= 500) {
      return '❌ Violation recording failed (Server error)';
    }
    // Return description for Activity Logs (violation type will be determined by getLogTypeFromUrl)
    return '🚫 Violation recorded';
  }
  
  // Skip admin invalidate endpoint - it's logged directly by the controller with proper user info
  // The controller creates a SystemLogs entry with type 'admin_invalidate_session' which is in system logs
  // We skip middleware logging to avoid duplicate "anonymous - admin_access" entries
  if (urlPath.includes('/monitoring/admin/invalidate')) {
    if (statusCode >= 500) return '❌ Admin invalidate failed (Server error)';
    // Skip successful invalidations (logged by controller) and routine 400 validation errors
    return null;
  }
  
  // Skip API request logs (routine API calls, not user actions)
  // These are logged to system logs but not to activity logs
  // Check if this would be classified as an api_request (but not auth/logout/register which are user actions)
  // Note: /auth/refresh is already filtered above, so we don't need to check it here
  const wouldBeApiRequest = !urlPath.includes('/auth/logout') && 
                             !urlPath.includes('/auth/register') && 
                             !urlPath.includes('/admin/') && 
                             !urlPath.includes('/lecturer/') && 
                             !urlPath.includes('/exams/') && 
                             !urlPath.includes('/submissions/') && 
                             !urlPath.includes('/ai/') && 
                             !urlPath.includes('/courses/');
  if (wouldBeApiRequest && statusCode < 400) return null;
  
  // AI actions
  if (urlPath.startsWith('/api/ai/')) {
    if (urlPath.includes('generate-questions')) return statusCode < 400 ? '🤖 AI questions generated' : '❌ AI generation failed';
    if (urlPath.includes('grade')) return statusCode < 400 ? '🤖 AI grading completed' : '❌ AI grading failed';
  }
  
  // Default descriptions
  if (statusCode >= 400) {
    // Only log serious errors (500+)
    // Security errors (401, 403) are automatically filtered from activity logs because:
    // - They're saved as 'api_request' type (from getLogTypeFromUrl)
    // - 'api_request' is NOT in the activityTypes array in logController.js
    // - So they only appear in system logs, not activity logs (which is correct)
    // Skip routine 400 validation errors (exam expired, validation failed, etc.)
    // These are expected errors and don't need to be logged at all
    if (statusCode >= 500) {
      return `❌ ${method} ${urlPath} (Error ${statusCode})`;
    }
    // Skip routine 400 validation errors - they're expected and don't need logging
    return null;
  }
  return `✅ ${method} ${urlPath}`;
};

// CONSOLIDATED LOGGER - Single file with all important information
export const consolidatedLogger = (req, res, next) => {
  const start = Date.now();
  const originalBody = req.body;
  
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - start;
    const urlPath = req.originalUrl.split('?')[0];
    
    // Extract user information - prioritize logged in user from auth controller
    let user = req.loggedInUser || extractUserFromRequest(req);
    
    // CRITICAL: For violations, try to get user from req.user (set by protect middleware)
    // This ensures we have the actual user name, not "anonymous"
    if (urlPath.includes('/api/monitoring/violations') && req.user && !user) {
      user = {
        id: req.user.id || req.user._id,
        username: req.user.username,
        name: req.user.name,
        role: req.user.role
      };
    }
    
    // Determine security flags
    const securityFlags = [];
    const ipAddress = getClientIp(req);
    
    // Authentication failures
    if (res.statusCode === 401) securityFlags.push('UNAUTHORIZED_ACCESS');
    
    // 403 on auth endpoints can be account locked (check response message)
    if (res.statusCode === 403) {
      securityFlags.push('FORBIDDEN_ACCESS');
      // Check if response indicates account is locked
      const responseBody = res._responseBody || (res.statusMessage?.includes('locked') ? 'locked' : '');
      if (urlPath.includes('/auth/login') && (
        responseBody?.toLowerCase().includes('locked') || 
        responseBody?.toLowerCase().includes('lock') ||
        originalBody?.message?.toLowerCase().includes('locked')
      )) {
        securityFlags.push('ACCOUNT_LOCKED');
      }
    }
    
    // HTTP 423 is the standard "Locked" status code
    if (res.statusCode === 423) {
      securityFlags.push('ACCOUNT_LOCKED');
      securityFlags.push('BRUTE_FORCE_PROTECTION');
    }
    
    // Check if response was marked as account locked (from auth controller)
    if (res.accountLocked || res.accountJustLocked) {
      securityFlags.push('ACCOUNT_LOCKED');
      securityFlags.push('BRUTE_FORCE_PROTECTION');
      // Override status code to show it's locked
      res.statusCode = 423;
    }
    
    // Rate limiting (429) indicates potential attack
    if (res.statusCode === 429) {
      securityFlags.push('RATE_LIMITED');
      // Rate limiting on auth endpoints is likely brute force
      if (urlPath.includes('/auth/')) {
        securityFlags.push('BRUTE_FORCE_PROTECTION');
        securityFlags.push('POTENTIAL_ATTACK');
      }
    }
    
    // Failed login attempts
    if (urlPath.includes('/auth/') && res.statusCode === 401) {
      securityFlags.push('FAILED_LOGIN');
      // Multiple failed logins could indicate brute force
      // This will be enhanced with pattern detection
    }
    
    // Admin endpoint access without proper auth
    if (urlPath.includes('/admin/') && (res.statusCode === 401 || res.statusCode === 403)) {
      securityFlags.push('UNAUTHORIZED_ADMIN_ACCESS');
      securityFlags.push('POTENTIAL_ATTACK');
    }
    
    // Suspicious patterns: Rapid failed authentication attempts
    if (urlPath === '/api/auth/login' && res.statusCode === 401) {
      securityFlags.push('FAILED_LOGIN');
      // Pattern detection could be added here (tracking by IP)
    }
    
    const priority = getPriorityLevel(req.method, req.originalUrl, res.statusCode, securityFlags);
    const action = getActionDescription(req.method, req.originalUrl, res.statusCode, originalBody, user);
    
    // Skip logging if action is null (for routine operations like active-sessions checks)
    if (action === null) {
      originalEnd.apply(this, args);
      return;
    }
    
    // Single consolidated log entry with all important information
    const logEntry = {
      timestamp: new Date().toISOString(),
      priority: priority,
      action: action,
      
      // Request details
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: duration,
      
      // User information (now captured correctly for auth events)
      userId: user?.id || 'anonymous',
      userSource: user?.source || 'none',
      
      // Security information
      ip: ipAddress,
      userAgent: req.get('User-Agent'),
      securityFlags: securityFlags,
      
      // Quick status indicators
      success: res.statusCode < 400,
      isAuth: urlPath.includes('/auth/'),
      isSuspicious: securityFlags.length > 0 || res.statusCode >= 400
    };
    
    // Log to single consolidated file (skipped if action is null)
    // Note: This code only runs if action is not null (checked above)
    const logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    // CRITICAL: Only save TRUE system/security events to SystemLogs database
    // Activity events (student behavior, routine API calls, violations) should NOT go to SystemLogs
    // SystemLogs are for: server errors, security events, admin actions, system integrity issues
    
    // Determine if this is a TRUE system/security event (not routine activity)
    const isSystemEvent = 
      // Server errors (500+) - system integrity issues
      res.statusCode >= 500 ||
      // Security events (authentication failures, account lockouts, rate limiting)
      securityFlags.length > 0 ||
      // Admin actions
      urlPath.includes('/admin/') ||
      // System-level events (not user activity)
      urlPath.includes('/system/') ||
      // Critical authentication events (login/logout are logged by authController, but failed auth is system event)
      (urlPath.includes('/auth/') && (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 423 || res.statusCode === 429));
    
    // EXCLUDE routine activity from SystemLogs:
    // - Heartbeats (routine monitoring)
    // - Active sessions checks (routine monitoring)
    // - Exam submissions (user activity)
    // - Routine API requests (user activity)
    // NOTE: Violations ARE saved to SystemLogs (with type 'violation') so they appear in Activity Logs
    // They are filtered out of Security Events view, but appear in Activity Logs
    const isRoutineActivity = 
      urlPath.includes('/api/monitoring/heartbeat') || // Heartbeats are activity
      urlPath.includes('/api/submissions/active-sessions') || // Active sessions checks are activity
      urlPath.includes('/api/submissions/start-session') || // Session start is activity
      (urlPath.includes('/api/exams/') && req.method === 'GET') || // Exam access is activity
      (urlPath.includes('/api/submissions/') && req.method === 'POST' && res.statusCode < 500); // Submissions are activity (unless server error)
    
    // CRITICAL: Violations need to be saved to SystemLogs so they appear in Activity Logs
    // They are NOT system events, but they ARE user activity that should be logged
    const isViolation = urlPath.includes('/api/monitoring/violations');
    
    // Save to SystemLogs if:
    // 1. It's a TRUE system/security event AND not routine activity, OR
    // 2. It's a violation (so it appears in Activity Logs)
    if ((isSystemEvent && !isRoutineActivity) || (isViolation && res.statusCode < 500)) {
      const saveLog = async () => {
        try {
          // CRITICAL: For violations, extract violation details from request body
          let violationDetails = {};
          let violationMessage = action; // Start with generic action, will be overridden if violation data found
          let violationLevel = getLogLevelFromPriority(priority);
          let examIdForLog = null;
          let violationSeverity = 'medium'; // Default severity
          
          if (isViolation) {
            // Try to get violation from originalBody first, then from req.body (in case body was consumed)
            const bodyData = originalBody || req.body;
            
            if (bodyData && bodyData.violation) {
              const violation = bodyData.violation;
              const violationType = violation.type || 'unknown';
              violationSeverity = violation.severity || 'medium';
              const violationDetailsText = violation.details || violation.message || 'Violation detected';
              
              // Create user-friendly violation message
              // Format: "Tab switch detected" or "Window focus lost" etc.
              const violationTypeFormatted = violationType
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              
              violationMessage = `${violationTypeFormatted}: ${violationDetailsText}`;
              
              examIdForLog = bodyData.examId || null;
              
              // CRITICAL: Fetch exam title synchronously before saving log
              // This ensures exam title is available immediately in Activity Logs
              let examTitle = null;
              if (examIdForLog) {
                try {
                  const { default: Exam } = await import('../models/Exam.js');
                  const exam = await Exam.findById(examIdForLog).select('title').lean();
                  if (exam && exam.title) {
                    examTitle = exam.title;
                  }
                } catch (examError) {
                  console.warn('⚠️ Could not fetch exam title for violation:', examError.message);
                }
              }
              
              violationDetails = {
                violationType: violationType,
                severity: violationSeverity,
                message: violationDetailsText,
                sessionId: bodyData.sessionId || null,
                examId: examIdForLog,
                examTitle: examTitle, // Include exam title in violation details
                totalViolations: bodyData.totalViolations || 1
              };
              
              console.log('✅ Violation message formatted:', {
                violationType,
                violationTypeFormatted,
                violationDetailsText,
                violationMessage,
                userName: user?.name || user?.username,
                examTitle: examTitle
              });
            } else {
              // Fallback: if violation data not found, at least format the generic message better
              console.warn('⚠️ Violation data not found in request body:', {
                hasOriginalBody: !!originalBody,
                hasReqBody: !!req.body,
                originalBodyKeys: originalBody ? Object.keys(originalBody) : [],
                reqBodyKeys: req.body ? Object.keys(req.body) : [],
                url: req.originalUrl
              });
              // Keep the generic message but make it slightly better
              violationMessage = 'Violation detected';
            }
            
            // Set log level based on violation severity
            if (violationSeverity === 'critical') {
              violationLevel = 'error';
            } else if (violationSeverity === 'high') {
              violationLevel = 'warn';
            } else {
              violationLevel = 'info';
            }
          }
          
          // For violations, store minimal details (not the entire logEntry)
          // This keeps Activity Logs clean and readable
          const violationDetailsForStorage = isViolation && violationDetails.violationType ? {
            violationType: violationDetails.violationType,
            severity: violationDetails.severity,
            message: violationDetails.message,
            examId: violationDetails.examId,
            examTitle: violationDetails.examTitle, // Include exam title (fetched synchronously)
            totalViolations: violationDetails.totalViolations
          } : null;
          
          // CRITICAL: For violations, if we don't have user name, try to fetch it from database
          // Also validate that this is NOT an admin/lecturer user (violations should only be for students)
          let finalUserName = user?.name || user?.username;
          let userRole = user?.role;
          
          if (isViolation && (user?.id || user?._id)) {
            try {
              const { default: User } = await import('../models/User.js');
              const dbUser = await User.findById(user.id || user._id).select('name username role').lean();
              if (dbUser) {
                finalUserName = dbUser.name || dbUser.username;
                userRole = dbUser.role;
                
                // CRITICAL: Skip saving violation if user is admin/lecturer
                // Violations should only be for students during exams
                if (userRole === 'admin' || userRole === 'lecturer') {
                  console.warn('⚠️ Skipping violation log for non-student user:', { userId: user.id, userRole, userName: finalUserName });
                  return; // Don't save this violation to database
                }
              }
            } catch (userError) {
              console.warn('⚠️ Could not fetch user name for violation:', userError.message);
            }
          }
          
          // Additional safety check: if we still don't have a valid user, skip logging
          if (isViolation && (!user?.id && !user?._id)) {
            console.warn('⚠️ Skipping violation log - no valid user ID');
            return; // Don't save anonymous violations
          }
          
          const dbLog = new SystemLogs({
            type: getLogTypeFromUrl(urlPath, res.statusCode), // Will be 'violation' for violations
            level: violationLevel,
            message: violationMessage,
            details: isViolation && violationDetailsForStorage 
              ? JSON.stringify(violationDetailsForStorage) 
              : JSON.stringify(logEntry),
            userId: user?.id || user?._id || null,
            userName: finalUserName || (user?.id || user?._id ? 'User' : 'anonymous'),
            examId: examIdForLog,
            timestamp: new Date(logEntry.timestamp),
            userContext: user?.id ? {
              userId: user.id,
              userName: user.name || user.username,
              role: user.role || 'unknown'
            } : null,
            requestContext: {
              method: logEntry.method,
              url: logEntry.url,
              statusCode: logEntry.statusCode,
              responseTime: logEntry.duration
            },
            securityFlags: securityFlags,
            ipAddress: logEntry.ip,
            userAgent: logEntry.userAgent
          });
          
          await dbLog.save();
          
          if (isViolation) {
            console.log('✅ Violation saved to Activity Logs:', {
              type: violationDetails.violationType,
              severity: violationDetails.severity,
              userId: user?.id,
              examId: examIdForLog,
              examTitle: violationDetails.examTitle
            });
          }
        } catch (dbError) {
          console.error('Failed to save log to database:', dbError.message);
          // Continue execution even if database logging fails
        }
      };
      
      saveLog();
    } else {
      // Routine activity - log to file only, NOT to SystemLogs database
      // This includes: violations, heartbeats, exam submissions, routine API calls
      // These are activity logs, not system logs
    }
    
      // Console output for development with color coding - skip routine operations
    if (process.env.NODE_ENV !== 'production' && !urlPath.includes('active-sessions')) {
      const priorityColor = {
        'HIGH': '\x1b[31m',    // Red
        'MEDIUM': '\x1b[33m',  // Yellow
        'LOW': '\x1b[32m',     // Green
        'INFO': '\x1b[36m'     // Cyan
      };
      const reset = '\x1b[0m';
      
      console.log(`${priorityColor[priority]}[${priority}]${reset} ${action} (${duration}ms) - ${user?.id || 'anonymous'}`);
      
      if (securityFlags.length > 0) {
        console.log(`  🔒 Security: ${securityFlags.join(', ')}`);
      }
    }
    
    originalEnd.apply(this, args);
  };

  next();
};

// Simple security event logger for specific events
export const securityLogger = (event, details, req) => {
  const user = extractUserFromRequest(req);
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    priority: 'HIGH',
    action: `🚨 SECURITY EVENT: ${event}`,
    
    // Event details
    event: event,
    details: details,
    
    // Request context
    method: req.method,
    url: req.originalUrl,
    
    // User information
    userId: user?.id || 'anonymous',
    userSource: user?.source || 'none',
    
    // Security information
    ip: getClientIp(req),
    userAgent: req.get('User-Agent'),
    securityFlags: [event],
    
    // Quick indicators
    success: false,
    isAuth: true,
    isSuspicious: true
  };

  // Log to same consolidated file
  const logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  
  // Also save to database (async, don't wait)
  const saveSecurityLog = async () => {
    try {
      const dbLog = new SystemLogs({
        type: 'violation', // Security events are violations
        level: 'error',
        message: logEntry.action,
        details: JSON.stringify(logEntry),
        userId: user?.id || null,
        userName: user?.username || 'anonymous',
        timestamp: new Date(logEntry.timestamp),
        userContext: user?.id ? {
          userId: user.id,
          userName: user.username,
          role: user.role || 'unknown'
        } : null,
        requestContext: {
          method: logEntry.method,
          url: logEntry.url,
          statusCode: 0, // Security events don't have status codes
          responseTime: 0
        },
        securityFlags: [event],
        ipAddress: logEntry.ip,
        userAgent: logEntry.userAgent
      });
      
      await dbLog.save();
    } catch (dbError) {
      console.error('Failed to save security log to database:', dbError.message);
      // Continue execution even if database logging fails
    }
  };
  
  saveSecurityLog();
  
  // Console output
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\x1b[31m[HIGH]\x1b[0m 🚨 ${event}: ${JSON.stringify(details)}`);
  }
};

// Keep the enhanced logger for backward compatibility but make it use consolidated logging
export const enhancedLogger = consolidatedLogger;
export const requestLogger = consolidatedLogger;

// Legacy functions for compatibility - now disabled to prevent duplicate logging
export const logFailedLogin = (req, username, reason) => {
// Disabled - handled by consolidated logger
// securityLogger('FAILED_LOGIN', { username, reason }, req);
};

export const logSuccessfulLogin = (req, userId, username) => {
// Disabled - handled by consolidated logger
// securityLogger('SUCCESSFUL_LOGIN', { userId, username }, req);
};

export const logAccountLocked = (req, userId, username) => {
// Still active for account locking as it's a critical security event
securityLogger('ACCOUNT_LOCKED', { userId, username }, req);
};