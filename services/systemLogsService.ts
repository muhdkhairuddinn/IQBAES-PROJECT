import axios from 'axios';

export interface SystemLogEntry {
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

export interface SystemLogsResponse {
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

export interface LogFilesResponse {
  files: string[];
}

// Create axios instance with base configuration
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 10000,
});

// Add request interceptor to include authentication token
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('iqbaes-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isAutoRefresh = error.config?.params?.autoRefresh === 'true';
      
      if (!isAutoRefresh) {
        sessionStorage.removeItem('iqbaes-token');
        sessionStorage.removeItem('iqbaes-user');
        window.location.hash = '#/login';
      }
    }
    return Promise.reject(error);
  }
);

export const systemLogsService = {
  // Check if user has admin privileges
  checkAdminAccess(): boolean {
    const userStr = sessionStorage.getItem('iqbaes-user');
    if (!userStr) return false;
    
    try {
      const user = JSON.parse(userStr);
      return user.role === 'admin';
    } catch {
      return false;
    }
  },

  // Get list of available log files
  async getLogFiles(): Promise<LogFilesResponse> {
    if (!this.checkAdminAccess()) {
      throw new Error('Admin privileges required to access system logs');
    }

    try {
      const response = await api.get('/logs/system');
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 403) {
        throw new Error('Admin privileges required to access system logs');
      }
      throw new Error(error.response?.data?.message || 'Failed to fetch log files');
    }
  },

  // Enhanced method to handle token expiration gracefully
  async getLogFileContentWithRetry(
    filename: string,
    page: number = 1,
    limit: number = 50,
    priority?: string,
    search?: string,
    isAutoRefresh: boolean = false
  ): Promise<SystemLogsResponse> {
    if (!this.checkAdminAccess()) {
      throw new Error('Admin privileges required to access system logs');
    }

    try {
      const params: any = { page, limit };
      if (priority && priority !== 'all') params.priority = priority;
      if (search) params.search = search;
      
      if (isAutoRefresh) {
        params.autoRefresh = 'true';
      }

      const response = await api.get(`/logs/system/${filename}`, { params });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401 && isAutoRefresh) {
        throw new Error('SESSION_EXPIRED');
      }
      if (error.response?.status === 403) {
        throw new Error('Admin privileges required to access system logs');
      }
      throw new Error(error.response?.data?.message || 'Failed to fetch log content');
    }
  },

  // Keep the original method for backward compatibility
  async getLogFileContent(
    filename: string,
    page: number = 1,
    limit: number = 50,
    priority?: string,
    search?: string
  ): Promise<SystemLogsResponse> {
    return this.getLogFileContentWithRetry(filename, page, limit, priority, search, false);
  },

  // Get real-time security events
  async getSecurityEvents(limit: number = 20): Promise<SystemLogEntry[]> {
    if (!this.checkAdminAccess()) {
      throw new Error('Admin privileges required to access system logs');
    }

    try {
      const filesResponse = await this.getLogFiles();
      if (filesResponse.files.length === 0) return [];

      const latestFile = filesResponse.files[0];
      const logsResponse = await this.getLogFileContent(latestFile, 1, limit, 'HIGH');
      
      return logsResponse.logs.filter(log => 
        log.isSuspicious || 
        log.securityFlags.length > 0 || 
        (log.isAuth && !log.success)
      );
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch security events');
    }
  },

  // Clear specific system log file
  async clearSystemLogFile(filename: string): Promise<{ message: string }> {
    if (!this.checkAdminAccess()) {
      throw new Error('Admin privileges required to clear system logs');
    }

    try {
      const response = await api.delete(`/logs/system/${filename}`);
      return response.data;
    } catch (error: any) {
      console.error('Error clearing system log file:', error);
      throw new Error(error.response?.data?.message || 'Failed to clear system log file');
    }
  },

  // Clear all system log files
  async clearAllSystemLogs(): Promise<{ message: string; clearedFiles: number }> {
    if (!this.checkAdminAccess()) {
      throw new Error('Admin privileges required to clear system logs');
    }

    try {
      const response = await api.delete('/logs/system');
      return response.data;
    } catch (error: any) {
      console.error('Error clearing all system logs:', error);
      throw new Error(error.response?.data?.message || 'Failed to clear all system logs');
    }
  },

  // Clear activity logs
  async clearActivityLogs(): Promise<{ message: string }> {
    if (!this.checkAdminAccess()) {
      throw new Error('Admin privileges required to clear activity logs');
    }

    try {
      const response = await api.delete('/logs/activity');
      return response.data;
    } catch (error: any) {
      console.error('Error clearing activity logs:', error);
      throw new Error(error.response?.data?.message || 'Failed to clear activity logs');
    }
  }
};