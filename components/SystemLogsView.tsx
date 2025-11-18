import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { systemLogsService } from '../services/systemLogsService';
import { LoadingSpinner } from './LoadingSpinner';
import { Pagination } from './Pagination';
import { useAuth } from '../contexts/AuthContext';

interface SystemLogEntry {
  timestamp: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  action: string;
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  userId: string;
  userSource: string;
  ip: string;
  userAgent: string;
  securityFlags: string[];
  success: boolean;
  isAuth: boolean;
  isSuspicious: boolean;
}

// Update the interface to include stats
interface SystemLogsResponse {
  logs: SystemLogEntry[];
  totalLogs: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  stats?: {
    total: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    suspicious: number;
    failed_auth: number;
    successful_auth: number;
  };
}

const SystemLogsView: React.FC = () => {
  const { users } = useAuth(); // Get users list to map userId to userName
  const [allLogs, setAllLogs] = useState<SystemLogEntry[]>([]); // Store all logs (no need for separate logs state - use paginatedLogs directly)
  const [logFiles, setLogFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [apiStats, setApiStats] = useState<any>(null); // Add this
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Map userId to userName
  const getUserName = useCallback((userId: string): string => {
    if (userId === 'anonymous' || !userId) {
      return 'Anonymous';
    }
    // Find user by ID
    const user = users.find(u => u.id === userId || String(u.id) === String(userId));
    if (user) {
      return `${user.name} (${user.username})`;
    }
    // If not found, return userId as fallback
    return userId;
  }, [users]);

  // Handle file selection - ADD THIS FUNCTION INSIDE THE COMPONENT
  const handleFileSelection = (fileName: string) => {
    setSelectedFile(fileName);
    setCurrentPage(1); // Reset to first page when changing files
    // Save user's preference
    localStorage.setItem('iqbaes-selected-log-file', fileName);
    console.log('📁 User selected file:', fileName);
  };

  // Load available log files
  const loadLogFiles = useCallback(async () => {
    try {
      setError(null);
      console.log('🔍 Attempting to load log files...');
      
      const response = await systemLogsService.getLogFiles();
      console.log('✅ Log files loaded:', response.files);
      
      setLogFiles(response.files);
      
      // Enhanced auto-selection logic
      if (response.files.length > 0) {
        // Check if there's a saved preference in localStorage
        const savedFile = localStorage.getItem('iqbaes-selected-log-file');
        
        // Use saved file if it exists in the current files list, otherwise use the most recent
        const fileToSelect = (savedFile && response.files.includes(savedFile)) 
          ? savedFile 
          : response.files[0]; // First file is the most recent
        
        if (!selectedFile || selectedFile !== fileToSelect) {
          setSelectedFile(fileToSelect);
          console.log('📁 Auto-selected file:', fileToSelect);
        }
      }
    } catch (err: any) {
      console.error('❌ Failed to load log files:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Unknown error';
      setError(`Failed to load log files: ${errorMessage}`);
      
      // Check for specific error types
      if (err.response?.status === 401) {
        setError('Authentication required. Please ensure you have admin privileges.');
      } else if (err.response?.status === 403) {
        setError('Access denied. Admin privileges required to view system logs.');
      } else if (err.code === 'ECONNREFUSED' || err.message.includes('Network Error')) {
        setError('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
    }
  }, []); // Remove selectedFile from dependencies to fix circular dependency

  // Load logs from selected file (fetch with search server-side)
  const loadLogs = useCallback(async (isAutoRefresh: boolean = false) => {
    if (!selectedFile || !systemLogsService.checkAdminAccess()) return;
    
    try {
      setLogsLoading(true);
      setError(null);
      console.log(`📖 Loading logs from file: ${selectedFile}${isAutoRefresh ? ' (auto-refresh)' : ''}`);
      
      // Load ALL logs to properly filter and paginate security events client-side
      // Since we're filtering client-side for security events, we need all the data
      // Use a very large limit to get all logs (backend reads entire file anyway)
      const batchSize = 10000; // Load enough logs to cover typical log files
      const [fileResponse, dbResponse] = await Promise.all([
        systemLogsService.getLogFileContentWithRetry(
          selectedFile,
          1, // Always load from page 1 - pagination is now client-side
          batchSize,
          undefined,
          undefined, // Don't apply search on server-side - we'll do it client-side after merging
          isAutoRefresh
        ),
        // Also fetch database security logs (login, logout, etc.)
        fetch('/api/logs/security/database?limit=1000', {
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('iqbaes-token')}`
          }
        }).then(res => res.ok ? res.json() : { logs: [], totalLogs: 0 }).catch(() => ({ logs: [], totalLogs: 0 }))
      ]);
      
      console.log(`📊 Received ${fileResponse.logs.length} logs from file (total in file: ${fileResponse.totalLogs})`);
      console.log(`📊 Received ${dbResponse.logs?.length || 0} logs from database (before date filtering)`);
      
      // CRITICAL: Filter database logs to only include logs from the same date as the selected file
      // Extract date from filename (e.g., "app-2025-11-12.log" -> "2025-11-12")
      let fileDate: string | null = null;
      if (selectedFile) {
        const dateMatch = selectedFile.match(/app-(\d{4}-\d{2}-\d{2})\.log/);
        if (dateMatch) {
          fileDate = dateMatch[1]; // e.g., "2025-11-12"
        }
      }
      
      // Filter database logs by date if file date is available
      let filteredDbLogs = dbResponse.logs || [];
      if (fileDate) {
        filteredDbLogs = filteredDbLogs.filter(log => {
          const logDate = new Date(log.timestamp);
          const logDateStr = logDate.toISOString().split('T')[0]; // e.g., "2025-11-12"
          return logDateStr === fileDate;
        });
        console.log(`📅 Filtered database logs to date ${fileDate}: ${filteredDbLogs.length} logs (from ${dbResponse.logs?.length || 0} total)`);
      }
      
      // Merge file logs and database logs (filtered by date), removing duplicates by timestamp and action
      let mergedLogs = [...(fileResponse.logs || []), ...filteredDbLogs];
      
      // Apply search filter to merged logs if search term exists (client-side search)
      if (searchTerm && searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        mergedLogs = mergedLogs.filter(log => {
          const searchableText = JSON.stringify(log).toLowerCase();
          return searchableText.includes(searchLower);
        });
      }
      
      // Remove duplicates (same timestamp and similar action/message)
      const uniqueLogs = mergedLogs.filter((log, index, self) => 
        index === self.findIndex(l => 
          l.timestamp === log.timestamp && 
          (l.action === log.action || (l as any).message === (log as any).message)
        )
      );
      
      // Sort by timestamp (newest first)
      uniqueLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      console.log(`✅ Loaded ${uniqueLogs.length} unique logs (${fileResponse.logs.length} from file, ${filteredDbLogs.length} from database for date ${fileDate || 'all'})`);
      
      setAllLogs(uniqueLogs); // Store merged logs
      setTotalLogs(uniqueLogs.length);
      // Don't set totalPages here - it will be calculated from filtered security logs
      setApiStats(fileResponse.stats);
      setLastRefresh(new Date());
      
      // Reset to page 1 when loading new data (unless it's auto-refresh)
      if (!isAutoRefresh) {
        setCurrentPage(1);
      }
    } catch (err: any) {
      console.error('❌ Failed to load logs:', err);
      
      if (err.message === 'SESSION_EXPIRED' && isAutoRefresh) {
        // Handle session expiration gracefully for auto-refresh
        console.log('🔄 Session expired during auto-refresh, pausing auto-refresh');
        setAutoRefresh(false);
        setError('Session expired. Please refresh the page to continue monitoring.');
      } else {
        const errorMessage = err.message || 'Unknown error';
        setError(`Failed to load logs: ${errorMessage}`);
      }
    } finally {
      setLogsLoading(false);
    }
  }, [selectedFile, searchTerm]); // Removed currentPage - pagination is now client-side

  // Check if a log entry is security-relevant
  // CRITICAL: Only truly security-relevant events should appear here
  // Routine user activity (clicks, mouse movement, question selection, progress updates) belongs in Activity Logs
  const isSecurityEvent = useCallback((log: SystemLogEntry): boolean => {
    const logType = (log as any).type || '';
    const logAction = log.action || '';
    const logMessage = (log as any).message || '';
    const logUrl = log.url || '';
    
    // EXCLUDE routine activity - these belong in Activity Logs, not Security Events
    // Heartbeats, progress updates, routine monitoring
    if (logUrl.includes('/api/monitoring/heartbeat') || 
        logUrl.includes('/api/submissions/active-sessions') ||
        logType === 'heartbeat' ||
        logType === 'page_view' ||
        logType === 'exam_access' ||
        logType === 'api_request' ||
        logAction.includes('heartbeat') ||
        logAction.includes('progress') ||
        logAction.includes('active-sessions')) {
      return false;
    }
    
    // EXCLUDE routine token refresh - it's not a security event
    if (logUrl.includes('/api/auth/refresh')) {
      return false;
    }
    
    // 1. Authentication events (login, logout, login_failed) - security-relevant
    if (logType === 'login' || logType === 'logout' || logType === 'login_failed') {
      return true;
    }
    
    // 2. Failed authentication attempts (401, 403) - security-relevant
    if (log.statusCode === 401 || log.statusCode === 403) {
      // But exclude routine token refresh failures
      if (!logUrl.includes('/api/auth/refresh')) {
        return true;
      }
    }
    
    // 3. Account lockouts and rate limiting (429 = attack detected, 423 = account locked) - security-relevant
    if (log.statusCode === 423 || log.statusCode === 429) {
      return true;
    }
    
    // 4. Any request with security flags (RATE_LIMITED, BRUTE_FORCE_PROTECTION, POTENTIAL_ATTACK) - security-relevant
    if (log.securityFlags && log.securityFlags.length > 0) {
      return true;
    }
    
    // 5. Suspicious activity flag - security-relevant
    if (log.isSuspicious) {
      return true;
    }
    
    // 6. CRITICAL: Violations are NOT security events - they're routine student activity
    // They appear in Activity Logs, not Security Events
    // Only session_flagged is a security event (admin action to flag a session)
    if (logType === 'session_flagged') {
      return true;
    }
    
    // EXCLUDE violations from Security Events - they belong in Activity Logs
    if (logType === 'violation' || 
        logType === 'ai_proctoring_violation' || 
        logUrl.includes('/api/monitoring/violations')) {
      return false;
    }
    
    // 7. Admin security actions - security-relevant
    if (logType === 'admin_invalidate_session' ||
        logType === 'admin_impose_penalty' ||
        logType === 'admin_require_retake' ||
        logType === 'admin_force_invalidate_submission' ||
        logType === 'admin_unlock_account' ||
        logUrl.includes('/api/monitoring/admin/invalidate') ||
        logUrl.includes('/api/monitoring/flag') ||
        logUrl.includes('/api/monitoring/resolve')) {
      return true;
    }
    
    // 8. Password reset requests - security-relevant (potential account compromise)
    if (logType === 'password_reset_request' || logUrl.includes('/reset-password')) {
      return true;
    }
    
    // 9. Registration - security-relevant (new account creation)
    if (logType === 'registration') {
      return true;
    }
    
    // 10. Login/logout from action/message fields (for file logs)
    if (logAction && (
      logAction.includes('LOGIN') || 
      logAction.includes('LOGOUT') ||
      logAction.includes('ACCOUNT LOCKED') ||
      logAction.includes('ATTACK DETECTED') ||
      logAction.includes('RATE LIMITED') ||
      logAction.includes('BLOCKED')
    )) {
      return true;
    }
    
    if (logMessage && (
      logMessage.includes('logged in successfully') || 
      logMessage.includes('logged out') ||
      logMessage.includes('login failed') ||
      logMessage.includes('account locked')
    )) {
      return true;
    }
    
    // 11. HIGH priority events that are security-related (but exclude routine HIGH priority)
    // Only include if they have security flags or are auth-related
    if (log.priority === 'HIGH' && (log.securityFlags?.length > 0 || log.isAuth)) {
      return true;
    }
    
    // All other events are NOT security-relevant - they belong in Activity Logs
    return false;
  }, []);

  // Filter to show only security-relevant events
  const securityLogs = React.useMemo(() => {
    return allLogs.filter(log => isSecurityEvent(log));
  }, [allLogs, isSecurityEvent]);

  // Client-side priority filter applies to security logs only
  const filteredLogs = React.useMemo(() => {
    const logsToFilter = securityLogs;
    if (priorityFilter === 'all') {
      return logsToFilter;
    }
    return logsToFilter.filter(log => log.priority === priorityFilter);
  }, [securityLogs, priorityFilter]);

  // Calculate pagination based on filtered security logs, not all logs
  const logsPerPage = 50;
  const filteredTotalLogs = filteredLogs.length;
  const filteredTotalPages = Math.max(1, Math.ceil(filteredTotalLogs / logsPerPage));
  const startIndex = (currentPage - 1) * logsPerPage;
  const endIndex = startIndex + logsPerPage;
  const paginatedLogs = useMemo(() => filteredLogs.slice(startIndex, endIndex), [filteredLogs, startIndex, endIndex]);

  // Update total pages when filtered logs change
  useEffect(() => {
    setTotalPages(filteredTotalPages);
  }, [filteredTotalPages]);

  // Load logs when file or search term changes (pagination is now client-side)
  useEffect(() => {
    if (selectedFile) {
      loadLogs();
    }
  }, [selectedFile, loadLogs]); // Removed currentPage - pagination is client-side now

  // Debounced search: reset to first page and reload
  useEffect(() => {
    const t = setTimeout(() => {
      setCurrentPage(1);
      if (selectedFile) {
        loadLogs();
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, selectedFile, loadLogs]);

  // Calculate stats from security-relevant logs only
  const calculateLogStats = () => {
    // Calculate stats from security logs only (not all logs)
    return {
      total: securityLogs.length,
      high: securityLogs.filter(log => log.priority === 'HIGH').length,
      medium: securityLogs.filter(log => log.priority === 'MEDIUM').length,
      suspicious: securityLogs.filter(log => log.isSuspicious || (log.securityFlags && log.securityFlags.length > 0)).length,
      failed_auth: securityLogs.filter(log => 
        log.action && (log.action.includes('LOGIN FAILED') || log.action.includes('FAILED'))
      ).length
    };
  };

  // Handle clearing current log file
  const handleClearCurrentFile = useCallback(async () => {
    if (!selectedFile) {
      alert('No file selected');
      return;
    }
    
    // Extract date from filename (e.g., "app-2025-11-12.log" -> "2025-11-12")
    const dateMatch = selectedFile.match(/app-(\d{4}-\d{2}-\d{2})\.log/);
    const fileDate = dateMatch ? dateMatch[1] : null;
    
    const confirmed = window.confirm(
      `Are you sure you want to clear "${selectedFile}"?\n\n` +
      `This will clear:\n` +
      `- The log file (${selectedFile})\n` +
      `- Database security logs for ${fileDate || 'this date'}\n\n` +
      `This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      setLogsLoading(true);
      setError(null);
      
      // Clear both the file AND database logs for that date
      const [fileResult, dbResult] = await Promise.all([
        systemLogsService.clearSystemLogFile(selectedFile),
        // Clear database logs for the same date
        fileDate 
          ? fetch(`/api/logs/security/database?date=${fileDate}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('iqbaes-token')}`
              }
            }).then(res => res.ok ? res.json() : { deletedCount: 0 }).catch(() => ({ deletedCount: 0 }))
          : Promise.resolve({ deletedCount: 0 })
      ]);
      
      // Reload logs after clearing to get fresh data
      await loadLogFiles();
      await loadLogs(false); // Reload logs after clearing (not auto-refresh)
      
      console.log(`✅ Cleared log file: ${selectedFile}`, {
        fileCleared: true,
        databaseLogsDeleted: dbResult.deletedCount || 0,
        date: fileDate
      });
    } catch (err: any) {
      console.error('❌ Failed to clear log file:', err);
      setError(`Failed to clear log file: ${err.message}`);
    } finally {
      setLogsLoading(false);
    }
  }, [selectedFile, loadLogFiles, loadLogs]);

  // Handle clearing all logs (both file and database)
  const handleClearAllLogs = useCallback(async () => {
    if (!window.confirm('Are you sure you want to clear ALL logs (both file logs and database security logs)? This action cannot be undone.')) {
      return;
    }
    
    try {
      setLogsLoading(true);
      setError(null);
      
      // Clear both file logs and database logs
      const [fileResult, dbResult] = await Promise.all([
        systemLogsService.clearAllSystemLogs().catch(err => ({ error: err.message })),
        fetch('/api/logs/security/database', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('iqbaes-token')}`
          }
        }).then(res => res.ok ? res.json() : { error: 'Failed' }).catch(() => ({ error: 'Failed' }))
      ]);
      
      // Clear the current logs display immediately
      setAllLogs([]);
      setTotalLogs(0);
      
      // Refresh the file list and logs
      await loadLogFiles();
      if (selectedFile) {
        await loadLogs();
      }
      
      const fileCount = (fileResult && 'clearedFiles' in fileResult) ? fileResult.clearedFiles : 0;
      const dbCount = (dbResult && 'deletedCount' in dbResult) ? dbResult.deletedCount : 0;
      console.log(`✅ Cleared all logs: ${fileCount} files and ${dbCount} database logs`);
    } catch (err: any) {
      console.error('❌ Failed to clear all logs:', err);
      setError(`Failed to clear all logs: ${err.message}`);
    } finally {
      setLogsLoading(false);
    }
  }, [loadLogFiles, loadLogs, selectedFile]);

  // Initial load
  useEffect(() => {
    const initializeData = async () => {
      setLoading(true);
      await loadLogFiles();
      setLoading(false);
    };
    initializeData();
  }, [loadLogFiles]);

  // ❌ REMOVE THIS DUPLICATE useEffect - it's causing the API calls!
  // useEffect(() => {
  //   if (selectedFile) {
  //     loadLogs();
  //   }
  // }, [selectedFile, currentPage, priorityFilter, loadLogs]);

  // Auto-refresh functionality - Enhanced with session expiration handling
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (autoRefresh && selectedFile) {
      // Use 30 seconds to be more rate-limit friendly
      const refreshInterval = 30000;
      
      interval = setInterval(() => {
        // Only refresh if the tab is visible and user is still authenticated
        if (!document.hidden && systemLogsService.checkAdminAccess()) {
          loadLogs(true); // Pass true to indicate this is an auto-refresh
        } else if (!systemLogsService.checkAdminAccess()) {
          // Stop auto-refresh if user is no longer authenticated
          setAutoRefresh(false);
          setError('Authentication lost. Please refresh the page to continue.');
        }
      }, refreshInterval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, selectedFile, loadLogs]);

  // Pause auto-refresh when tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('🔄 Auto-refresh paused (tab not visible)');
      } else {
        console.log('🔄 Auto-refresh resumed (tab visible)');
        // Refresh immediately when tab becomes visible
        if (autoRefresh && selectedFile && systemLogsService.checkAdminAccess()) {
          loadLogs(true); // Auto-refresh when tab becomes visible
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [autoRefresh, selectedFile, loadLogs]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'LOW':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'INFO':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300) return 'text-green-600';
    if (statusCode >= 300 && statusCode < 400) return 'text-blue-600';
    if (statusCode >= 400 && statusCode < 500) return 'text-yellow-600';
    if (statusCode >= 500) return 'text-red-600';
    return 'text-gray-600';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const logTime = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - logTime.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getSecurityIcon = (log: SystemLogEntry) => {
    if (log.securityFlags.includes('ACCOUNT_LOCKED')) return '🔒';
    if (log.securityFlags.includes('RATE_LIMITED')) return '⚡';
    if (log.securityFlags.includes('FAILED_LOGIN')) return '🚫';
    if (log.securityFlags.includes('UNAUTHORIZED_ACCESS')) return '⚠️';
    if (log.isSuspicious) return '🔍';
    if (log.isAuth && log.success) return '✅';
    if (log.isAuth && !log.success) return '❌';
    return log.success ? '✅' : '⚠️';
  };

  // Fixed stats calculation - use allLogs for accurate counts
  // Remove the flawed getLogStats function and use calculateLogStats instead
  if (loading) return <LoadingSpinner />;

  const stats = calculateLogStats(); // Use the correct function that prioritizes API stats

  return (
    <div className="space-y-6">
      {/* Header with Real-time Status */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">🛡️ Security Events</h2>
          <p className="text-gray-600 mt-1">
            Security-relevant events only (login attempts, violations, admin actions, suspicious activity)
            {lastRefresh && (
              <span className="ml-2 text-sm">
                • Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
            autoRefresh ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
          }`}>
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
            <span>{autoRefresh ? 'Live' : 'Paused'}</span>
          </div>
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Auto-refresh</span>
          </label>
          <button
            onClick={loadLogs}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Security Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-blue-500">
          <div className="flex items-center">
            <span className="text-2xl">📊</span>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Total Events</p>
              <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500">
          <div className="flex items-center">
            <span className="text-2xl">🚨</span>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">High Priority</p>
              <p className="text-2xl font-bold text-red-600">{stats.high}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-yellow-500">
          <div className="flex items-center">
            <span className="text-2xl">⚠️</span>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Medium Priority</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.medium}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-orange-500">
          <div className="flex items-center">
            <span className="text-2xl">🔍</span>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Suspicious</p>
              <p className="text-2xl font-bold text-orange-600">{stats.suspicious}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-purple-500">
          <div className="flex items-center">
            <span className="text-2xl">🚫</span>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Failed Auth</p>
              <p className="text-2xl font-bold text-purple-600">{stats.failed_auth}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Log File Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Log File 
              <span className="text-xs text-gray-500 ml-1">(auto-selects most recent)</span>
            </label>
            <select
              value={selectedFile}
              onChange={(e) => handleFileSelection(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a log file</option>
              {logFiles.map(file => (
                <option key={file} value={file}>
                  {file} {file === logFiles[0] ? '(latest)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority Filter</label>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Priorities</option>
              <option value="HIGH">🚨 High Priority</option>
              <option value="MEDIUM">⚠️ Medium Priority</option>
              <option value="LOW">✅ Low Priority</option>
              <option value="INFO">ℹ️ Info</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Logs</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by URL, method, user, IP, or text..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Clear Log Actions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Log Management</label>
            <div className="flex space-x-2">
              <button
                onClick={handleClearCurrentFile}
                disabled={!selectedFile}
                className="flex-1 bg-yellow-600 text-white px-3 py-2 rounded-md hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                title="Clear the selected log file only"
              >
                Clear Current File
              </button>
              <button
                onClick={handleClearAllLogs}
                className="flex-1 bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-700 text-sm"
                title="Clear all logs (both file logs and database security logs)"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Logs Display */}
      {selectedFile && (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900">
              Security Events from {selectedFile}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Showing {paginatedLogs.length} security event{paginatedLogs.length !== 1 ? 's' : ''} on page {currentPage} of {filteredTotalPages}
              {priorityFilter !== 'all' && ` (${priorityFilter} priority only)`}
              {searchTerm && ` • search: "${searchTerm}"`}
              <span className="text-xs text-gray-400 ml-2">
                ({filteredTotalLogs} security events filtered from {totalLogs} total logs)
              </span>
            </p>
          </div>
          
          {logsLoading ? (
            <div className="p-8 text-center">
              <LoadingSpinner />
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <span className="text-4xl mb-4 block">📭</span>
              No log entries found for the selected criteria.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {paginatedLogs.map((log, index) => (
                <div 
                  key={index} 
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    log.isSuspicious ? 'bg-red-50 border-l-4 border-red-400' : 
                    log.priority === 'HIGH' ? 'bg-orange-50 border-l-4 border-orange-400' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex-shrink-0 text-2xl">
                        {getSecurityIcon(log)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getPriorityColor(log.priority)}`}>
                            {log.priority}
                          </span>
                          <span className={`text-sm font-medium ${getStatusColor(log.statusCode)}`}>
                            {log.statusCode}
                          </span>
                          <span className="text-xs text-gray-500">
                            {log.duration}ms
                          </span>
                        </div>
                        
                        <p className="text-sm font-medium text-gray-900 mb-1">
                          {log.action}
                        </p>
                        
                        <div className="text-xs text-gray-600 space-y-1">
                          <div className="flex items-center space-x-4">
                            <span><strong>Method:</strong> {log.method}</span>
                            <span><strong>URL:</strong> {log.url}</span>
                          </div>
                          <div className="flex items-center space-x-4">
                            <span><strong>User:</strong> {getUserName(log.userId)}</span>
                            <span><strong>IP:</strong> {log.ip}</span>
                          </div>
                          {log.securityFlags.length > 0 && (
                            <div className="flex items-center space-x-2">
                              <strong className="text-red-600">Security Flags:</strong>
                              <div className="flex space-x-1">
                                {log.securityFlags.map((flag, i) => (
                                  <span key={i} className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs">
                                    {flag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right text-xs text-gray-500">
                      <div>{formatTimestamp(log.timestamp)}</div>
                      <div className="mt-1 font-medium">{getTimeAgo(log.timestamp)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SystemLogsView;

