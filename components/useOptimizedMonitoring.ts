import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAuthHeaders } from '../services/authService';

interface LiveSession {
  id: string;
  studentName: string;
  examTitle: string;
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
  userName: string;
  userId: string;
  message: string;
  examTitle: string;
  examId: string;
  type: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high';
}

interface MonitoringStats {
  totalSessions: number;
  activeSessions: number;
  totalViolations: number;
  recentViolations: number;
  totalAlerts: number;
  recentAlerts: number;
}

interface MonitoringData {
  sessions: LiveSession[];
  alerts: LiveAlert[];
  stats: MonitoringStats;
  timestamp: Date;
  cached?: boolean;
}

interface UseOptimizedMonitoringOptions {
  initialPollInterval?: number;
  maxPollInterval?: number;
  enableAdaptivePolling?: boolean;
  enableCaching?: boolean;
  onError?: (error: Error) => void;
  onDataUpdate?: (data: MonitoringData) => void;
}

interface ConnectionStatus {
  status: 'connected' | 'reconnecting' | 'disconnected';
  lastUpdate: Date | null;
  errorCount: number;
}

// Simple client-side cache
class ClientCache {
  private cache = new Map<string, { data: any; expiry: number }>();
  private defaultTTL = 30000; // 30 seconds

  set(key: string, data: any, ttl = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl
    });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const clientCache = new ClientCache();

export const useOptimizedMonitoring = (options: UseOptimizedMonitoringOptions = {}) => {
  const {
    initialPollInterval = 5000,
    maxPollInterval = 30000,
    enableAdaptivePolling = true,
    enableCaching = true,
    onError,
    onDataUpdate
  } = options;

  // State management
  const [data, setData] = useState<MonitoringData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'disconnected',
    lastUpdate: null,
    errorCount: 0
  });

  // Adaptive polling state
  const [pollInterval, setPollInterval] = useState(initialPollInterval);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Performance tracking
  const [performanceMetrics, setPerformanceMetrics] = useState({
    averageResponseTime: 0,
    cacheHitRate: 0,
    totalRequests: 0,
    cachedRequests: 0
  });

  // Optimized API fetch with caching and error handling
  const apiFetch = useCallback(async (endpoint: string): Promise<any> => {
    const startTime = Date.now();
    
    // Check cache first if enabled
    if (enableCaching) {
      const cached = clientCache.get(endpoint);
      if (cached) {
        setPerformanceMetrics(prev => ({
          ...prev,
          cachedRequests: prev.cachedRequests + 1,
          totalRequests: prev.totalRequests + 1,
          cacheHitRate: ((prev.cachedRequests + 1) / (prev.totalRequests + 1)) * 100
        }));
        return { ...cached, cached: true };
      }
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/monitoring${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const responseTime = Date.now() - startTime;

      // Update performance metrics
      setPerformanceMetrics(prev => {
        const newTotal = prev.totalRequests + 1;
        const newAverage = ((prev.averageResponseTime * prev.totalRequests) + responseTime) / newTotal;
        
        return {
          ...prev,
          averageResponseTime: Math.round(newAverage),
          totalRequests: newTotal,
          cacheHitRate: (prev.cachedRequests / newTotal) * 100
        };
      });

      // Cache the result if enabled and not already cached
      if (enableCaching && !result.cached) {
        clientCache.set(endpoint, result, 30000);
      }

      return result;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Request cancelled');
      }
      throw error;
    }
  }, [enableCaching]);

  // Adaptive polling logic
  const updatePollInterval = useCallback(() => {
    if (!enableAdaptivePolling) return;

    const timeSinceActivity = Date.now() - lastActivity;
    const hasRecentActivity = data?.alerts && data.alerts.length > 0;
    const hasActiveSessions = data?.stats && data.stats.activeSessions > 0;

    let newInterval = initialPollInterval;

    if (hasRecentActivity || hasActiveSessions) {
      // Fast polling during active periods
      newInterval = initialPollInterval;
      setLastActivity(Date.now());
    } else if (timeSinceActivity > 300000) { // 5 minutes
      // Very slow polling after long inactivity
      newInterval = maxPollInterval;
    } else if (timeSinceActivity > 60000) { // 1 minute
      // Medium polling after short inactivity
      newInterval = Math.min(maxPollInterval, initialPollInterval * 2);
    }

    if (newInterval !== pollInterval) {
      setPollInterval(newInterval);
    }
  }, [data, lastActivity, pollInterval, initialPollInterval, maxPollInterval, enableAdaptivePolling]);

  // Main data fetching function
  const fetchMonitoringData = useCallback(async () => {
    try {
      setError(null);
      setConnectionStatus(prev => ({ ...prev, status: 'reconnecting' }));

      const result = await apiFetch('/live-sessions');
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch monitoring data');
      }

      // Normalize payload to support both flat and nested shapes
      const payload = (result as any).data || result;

      // Process and validate data
      const processedData: MonitoringData = {
        sessions: (payload.sessions || []).map((session: any) => ({
          id: session.sessionId || `${session.userId}-${session.examId}`,
          studentName: session.userName || session.studentName || 'Unknown Student',
          examTitle: session.examTitle || 'Unknown Exam',
          startTime: new Date(session.startTime),
          timeRemaining: Math.max(0, session.timeRemaining || 0),
          status: session.violationCount >= 5 ? 'flagged' : 
                  session.timeRemaining <= 0 ? 'completed' : 'active',
          violationCount: session.violationCount || 0,
          ipAddress: session.ipAddress || 'Unknown',
          progress: {
            current: session.currentQuestion || 1,
            total: session.totalQuestions || 1
          }
        })),
        alerts: (payload.alerts || []).map((alert: any) => ({
          id: alert.id || `alert-${Date.now()}-${Math.random()}`,
          sessionId: alert.sessionId || '',
          userName: alert.userName || 'Unknown Student',
          userId: alert.userId || 'unknown',
          message: alert.message || 'Alert detected',
          examTitle: alert.examTitle || 'Unknown Exam',
          examId: alert.examId || 'unknown',
          type: alert.type || 'unknown',
          timestamp: new Date(alert.timestamp),
          severity: alert.severity || 'medium'
        })),
        stats: payload.stats || {
          totalSessions: 0,
          activeSessions: 0,
          totalViolations: 0,
          recentViolations: 0,
          totalAlerts: 0,
          recentAlerts: 0
        },
        timestamp: new Date(payload.timestamp || Date.now()),
        cached: payload.cached
      };

      setData(processedData);
      setConnectionStatus({
        status: 'connected',
        lastUpdate: new Date(),
        errorCount: 0
      });
      
      // Trigger callback if provided
      if (onDataUpdate) {
        onDataUpdate(processedData);
      }

    } catch (error: any) {
      console.error('Monitoring fetch error:', error);
      
      const errorMessage = error.message || 'Failed to fetch monitoring data';
      setError(errorMessage);
      
      setConnectionStatus(prev => ({
        status: 'disconnected',
        lastUpdate: prev.lastUpdate,
        errorCount: prev.errorCount + 1
      }));

      if (onError) {
        onError(error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, onError, onDataUpdate]);

  // Memoized filtered and sorted data
  const processedSessions = useMemo(() => {
    if (!data?.sessions) return [];
    
    return data.sessions
      .filter(session => session.timeRemaining > 0)
      .sort((a, b) => {
        // Sort by status priority, then by violation count
        const statusPriority = { flagged: 3, active: 2, completed: 1 };
        const aPriority = statusPriority[a.status] || 0;
        const bPriority = statusPriority[b.status] || 0;
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        return b.violationCount - a.violationCount;
      });
  }, [data?.sessions]);

  const recentAlerts = useMemo(() => {
    if (!data?.alerts) return [];
    
    return data.alerts
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10); // Show only recent 10 alerts
  }, [data?.alerts]);

  // Setup polling
  useEffect(() => {
    // Initial fetch
    fetchMonitoringData();

    // Setup interval
    const setupInterval = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      intervalRef.current = setInterval(fetchMonitoringData, pollInterval);
    };

    setupInterval();

    // Update interval when pollInterval changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchMonitoringData, pollInterval]);

  // Update polling interval based on activity
  useEffect(() => {
    updatePollInterval();
  }, [updatePollInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Manual refresh function
  const refresh = useCallback(() => {
    if (enableCaching) {
      clientCache.clear();
    }
    setIsLoading(true);
    fetchMonitoringData();
  }, [fetchMonitoringData, enableCaching]);

  // Clear cache function
  const clearCache = useCallback(() => {
    clientCache.clear();
    setPerformanceMetrics(prev => ({
      ...prev,
      cachedRequests: 0,
      totalRequests: 0,
      cacheHitRate: 0
    }));
  }, []);

  return {
    // Data
    data,
    sessions: processedSessions,
    alerts: recentAlerts,
    stats: data?.stats || null,
    
    // State
    isLoading,
    error,
    connectionStatus,
    
    // Performance
    performanceMetrics,
    pollInterval,
    cacheSize: clientCache.size(),
    
    // Actions
    refresh,
    clearCache,
    
    // Activity tracking
    markActivity: () => setLastActivity(Date.now())
  };
};

export default useOptimizedMonitoring;