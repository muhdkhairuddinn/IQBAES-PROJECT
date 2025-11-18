import { Feedback, FeedbackType, FeedbackPriority, FeedbackStatus } from '../types';

const API_BASE_URL = 'http://localhost:5000/api';

interface CreateFeedbackData {
  type: FeedbackType;
  priority?: FeedbackPriority;
  title: string;
  description: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  browserInfo?: string;
  screenResolution?: string;
}

interface UpdateFeedbackData {
  status?: FeedbackStatus;
  adminResponse?: string;
  assignedTo?: string;
  priority?: FeedbackPriority;
}

interface FeedbackResponse {
  feedback: Feedback[];
  pagination: {
    current: number;
    pages: number;
    total: number;
  };
}

interface FeedbackStats {
  overview: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    critical: number;
    high: number;
    bugs: number;
    features: number;
  };
  byType: Array<{
    _id: FeedbackType;
    count: number;
  }>;
}

class FeedbackService {
  private getAuthHeaders() {
    const token = sessionStorage.getItem('iqbaes-token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  private async handleResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');
    
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response received:', text);
      throw new Error(`Server returned non-JSON response. Status: ${response.status}. This usually means the backend server is not running or there's a connection issue.`);
    }

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.message || `Request failed with status ${response.status}`);
      } catch (parseError) {
        throw new Error(`Request failed with status ${response.status}`);
      }
    }

    return response.json();
  }

  private async apiFetch(url: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
    // Get fresh token each time to avoid stale token issues
    let token = sessionStorage.getItem('iqbaes-token');
    const headers = new Headers(options.headers || {});
    headers.append('Content-Type', 'application/json');
    if (token) {
      headers.append('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });

    // Handle token expiration with automatic refresh
    if (response.status === 401 && retryCount === 0) {
      try {
        const sessionRefreshToken = sessionStorage.getItem('iqbaes-refresh-token');
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: sessionRefreshToken }),
          credentials: 'omit'
        });

        if (refreshResponse.ok) {
          const { accessToken, user, refreshToken: newRefreshToken } = await refreshResponse.json();
          
          // Update stored token and user silently
          sessionStorage.setItem('iqbaes-token', accessToken);
          sessionStorage.setItem('iqbaes-user', JSON.stringify(user));
          if (newRefreshToken) sessionStorage.setItem('iqbaes-refresh-token', newRefreshToken);
          
          // Retry the original request with new token
          return await this.apiFetch(url, options, 1);
        } else {
          // Refresh failed, redirect to login
          sessionStorage.removeItem('iqbaes-token');
          sessionStorage.removeItem('iqbaes-user');
          sessionStorage.removeItem('iqbaes-refresh-token');
          window.location.href = '/login';
        }
      } catch (err) {
        sessionStorage.removeItem('iqbaes-token');
        sessionStorage.removeItem('iqbaes-user');
        sessionStorage.removeItem('iqbaes-refresh-token');
        window.location.href = '/login';
      }
    }

    return this.handleResponse(response);
  }

  async createFeedback(data: CreateFeedbackData): Promise<{ message: string; feedback: Feedback }> {
    try {
      return await this.apiFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          browserInfo: this.getBrowserInfo(),
          screenResolution: this.getScreenResolution()
        })
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }

  async getMyFeedback(page: number = 1, limit: number = 10): Promise<FeedbackResponse> {
    try {
      return await this.apiFetch(`/feedback/my?page=${page}&limit=${limit}`);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }

  async getAllFeedback(
    page: number = 1, 
    limit: number = 20, 
    filters?: {
      status?: FeedbackStatus;
      type?: FeedbackType;
      priority?: FeedbackPriority;
    }
  ): Promise<FeedbackResponse> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });

      if (filters?.status) params.append('status', filters.status);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.priority) params.append('priority', filters.priority);

      return await this.apiFetch(`/feedback?${params}`);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }

  async updateFeedback(id: string, data: UpdateFeedbackData): Promise<{ message: string; feedback: Feedback }> {
    try {
      return await this.apiFetch(`/feedback/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }

  async getFeedbackStats(): Promise<FeedbackStats> {
    try {
      return await this.apiFetch('/feedback/stats');
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }

  // Helper method to get browser info
  getBrowserInfo(): string {
    const userAgent = navigator.userAgent;
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';

    if (userAgent.indexOf('Chrome') > -1) {
      browserName = 'Chrome';
      browserVersion = userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Firefox') > -1) {
      browserName = 'Firefox';
      browserVersion = userAgent.match(/Firefox\/([0-9.]+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Safari') > -1) {
      browserName = 'Safari';
      browserVersion = userAgent.match(/Version\/([0-9.]+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Edge') > -1) {
      browserName = 'Edge';
      browserVersion = userAgent.match(/Edge\/([0-9.]+)/)?.[1] || 'Unknown';
    }

    return `${browserName} ${browserVersion}`;
  }

  // Helper method to get screen resolution
  getScreenResolution(): string {
    return `${screen.width}x${screen.height}`;
  }

  async markAsRead(id: string): Promise<void> {
    try {
      await this.apiFetch(`/feedback/${id}/mark-read`, {
        method: 'PUT'
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }

  async getUnreadCount(): Promise<{ unreadCount: number }> {
    try {
      return await this.apiFetch('/feedback/unread-count');
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }

  async addComment(feedbackId: string, message: string, type: 'progress_update' | 'status_change' | 'admin_response'): Promise<{ message: string; feedback: Feedback }> {
    try {
      return await this.apiFetch(`/feedback/${feedbackId}/comment`, {
        method: 'POST',
        body: JSON.stringify({ message, type })
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }

  async deleteFeedback(id: string): Promise<{ message: string }> {
    try {
      return await this.apiFetch(`/feedback/${id}`, {
        method: 'DELETE'
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 5000.');
      }
      throw error;
    }
  }
}

export default new FeedbackService();