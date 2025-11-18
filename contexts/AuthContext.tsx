import React, { createContext, useState, useContext, useEffect, useMemo, useCallback, useRef } from 'react';
import { User, Role, Course, Exam, ExamSubmission, Log, BankQuestion, UserAnswer, Result } from '../types';

// --- ENHANCED API HELPER WITH SMART TOKEN MANAGEMENT ---
const apiFetch = async (url: string, options: RequestInit = {}, retryCount = 0, refreshPromiseRef?: React.MutableRefObject<Promise<any> | null>): Promise<any> => {
  // Get fresh token each time to avoid stale token issues
  let token = sessionStorage.getItem('iqbaes-token');
  const headers = new Headers(options.headers || {});
  headers.append('Content-Type', 'application/json');
  if (token) {
    headers.append('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api${url}`, { ...options, headers });

  // Handle token expiration with SILENT automatic refresh
  if (response.status === 401 && retryCount === 0) {
    try {
      // Check if there's already a refresh in progress
      if (refreshPromiseRef?.current) {
        // Wait for the existing refresh to complete
        await refreshPromiseRef.current;
        // Retry with the new token
        return await apiFetch(url, options, 1, refreshPromiseRef);
      }

      // Start a new refresh with per-tab stored refresh token (avoid shared cookies)
      const sessionRefreshToken = sessionStorage.getItem('iqbaes-refresh-token');
      const refreshPromise = fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionRefreshToken ? { 'x-refresh-token': sessionRefreshToken } : {})
        },
        body: sessionRefreshToken ? undefined : JSON.stringify({ refreshToken: sessionRefreshToken })
      });

      if (refreshPromiseRef) {
        refreshPromiseRef.current = refreshPromise;
      }

      const refreshResponse = await refreshPromise;

      if (refreshResponse.ok) {
        const { accessToken, user, refreshToken: newRefreshToken } = await refreshResponse.json();
        
        // Update stored token and user silently
        sessionStorage.setItem('iqbaes-token', accessToken);
        sessionStorage.setItem('iqbaes-user', JSON.stringify(user));
        if (newRefreshToken) {
          sessionStorage.setItem('iqbaes-refresh-token', newRefreshToken);
        }
        
        // Clear the refresh promise
        if (refreshPromiseRef) {
          refreshPromiseRef.current = null;
        }
        
        // Wait a brief moment to ensure sessionStorage is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Retry the original request with new token
        return await apiFetch(url, options, 1, refreshPromiseRef);
      } else {
        // Clear the refresh promise
        if (refreshPromiseRef) {
          refreshPromiseRef.current = null;
        }
        // Only redirect to login if refresh completely fails
        sessionStorage.clear();
        window.location.hash = '#/login';
        throw new Error('Session expired. Please log in again.');
      }
    } catch (refreshError) {
      // Clear the refresh promise
      if (refreshPromiseRef) {
        refreshPromiseRef.current = null;
      }
      // Silent failure - only redirect if absolutely necessary
      sessionStorage.clear();
      window.location.hash = '#/login';
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'An unknown error occurred.' }));
    const detailed = Array.isArray((errorData as any).errors)
      ? (errorData as any).errors.map((e: any) => e.msg || e.message).filter(Boolean).join(', ')
      : '';
    const msg = detailed
      ? `${errorData.message || 'Request failed'}: ${detailed}`
      : (errorData.message || `Request failed with status ${response.status}`);
    throw new Error(msg);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

// --- CONTEXT DEFINITION ---
interface AuthContextType {
  user: User | null;
  users: User[];
  courses: Course[];
  exams: Exam[];
  submissions: ExamSubmission[];
  logs: Log[];
  bankQuestions: BankQuestion[];
  isLoading: boolean;
  sessionStatus: 'active' | 'refreshing' | 'expired';
  login: (username: string, password?: string) => Promise<User>;
  logout: () => void;
  register: (username: string, name: string, role: Role) => Promise<User>;
  requestPasswordReset: (email: string) => Promise<string>;
  resetPasswordWithToken: (token: string, newPassword: string) => Promise<void>;
  addExam: (exam: Omit<Exam, 'id' | 'questionCount'>) => void;
  updateExam: (exam: Exam) => void;
  deleteExam: (examId: string) => void;
  addCourse: (course: Omit<Course, 'id'>) => void;
  updateCourse: (course: Course) => void;
  deleteCourse: (courseId: string) => void;
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (user: User) => void;
  deleteUser: (userId: string) => void;
  submitAndGradeExam: (exam: Exam, answers: UserAnswer[]) => Promise<ExamSubmission>;
  addLog: (log: Omit<Log, 'id'>) => Promise<void>;
  clearLogs: () => Promise<void>;
  initiateExamSession: (examId: string) => Promise<any>;
  addQuestionToBank: (question: Omit<BankQuestion, 'id'>) => Promise<void>;
  updateQuestionInBank: (updatedQuestion: BankQuestion) => Promise<void>;
  deleteQuestionFromBank: (questionId: string) => Promise<void>;
  startExamSession: (examId: string, examTitle: string) => Promise<any>;
  updateSubmissionResult: (submissionId: string, updatedResults: Result[]) => Promise<void>;
  bulkGradeSubmissions: (submissionIds: string[], grades: { [questionId: string]: number }) => Promise<any>;
  allowRetake: (submissionId: string, maxAttempts?: number) => Promise<any>;
  allowRetakeForStudent: (examId: string, userId: string, maxAttempts?: number) => Promise<any>;
  revokeRetake: (submissionId: string, userId?: string, examId?: string) => Promise<any>;
  getStudentSubmissionHistory: (examId: string, studentId: string) => Promise<any>;
  refreshData: () => Promise<void>;
  extendSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<'active' | 'refreshing' | 'expired'>('active');
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const refreshPromiseRef = useRef<Promise<any> | null>(null);

  // Application state, fetched from the backend
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);

  // Track user activity for smart session management
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Setup activity listeners
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, [updateActivity]);

  // Decode JWT to get expiration time
  const decodeTokenExpiration = useCallback((token: string): number | null => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000;
    } catch (error) {
      return null;
    }
  }, []);

  // Smart token refresh based on activity
  const setupSmartTokenRefresh = useCallback((token: string) => {
    const expiresAt = decodeTokenExpiration(token);
    if (!expiresAt) return;

    // Clear existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Refresh token 5 minutes before expiration for active users
    // Refresh 1 minute before for inactive users
    const checkRefresh = () => {
      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;
      const timeSinceActivity = now - lastActivityRef.current;
      
      // If user is active (activity within last 5 minutes), refresh early
      const isActiveUser = timeSinceActivity < 5 * 60 * 1000;
      const refreshThreshold = isActiveUser ? 5 * 60 * 1000 : 1 * 60 * 1000;
      
      if (timeUntilExpiry <= refreshThreshold && timeUntilExpiry > 0) {
        performTokenRefresh();
      } else if (timeUntilExpiry > refreshThreshold) {
        // Schedule next check
        const nextCheck = Math.min(60000, timeUntilExpiry - refreshThreshold);
        refreshTimerRef.current = setTimeout(checkRefresh, nextCheck);
      }
    };

    // Start checking
    checkRefresh();
  }, [decodeTokenExpiration, lastActivityRef]);

  // Helper function to clear auth state (used by logout and token refresh)
  const clearAuthState = useCallback(() => {
    // Clear refresh timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    
    setUser(null);
    setAuthToken(null);
    setSessionStatus('expired');
    
    // Clear both storages
    sessionStorage.clear();
    localStorage.removeItem('iqbaes-user');
    localStorage.removeItem('iqbaes-token');
    sessionStorage.removeItem('iqbaes-refresh-token');
    
    // Clear all data
    setUsers([]);
    setCourses([]);
    setExams([]);
    setSubmissions([]);
    setLogs([]);
    setBankQuestions([]);
  }, []);

  // Perform silent token refresh
  const performTokenRefresh = useCallback(async () => {
    try {
      // Check if there's already a refresh in progress
      if (refreshPromiseRef.current) {
        await refreshPromiseRef.current;
        return;
      }

      setSessionStatus('refreshing');
      
      const sessionRefreshToken = sessionStorage.getItem('iqbaes-refresh-token');
      const refreshPromise = fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionRefreshToken ? { 'x-refresh-token': sessionRefreshToken } : {})
        },
        body: sessionRefreshToken ? undefined : JSON.stringify({ refreshToken: sessionRefreshToken })
      });

      refreshPromiseRef.current = refreshPromise;
      const refreshResponse = await refreshPromise;

      if (refreshResponse.ok) {
        const { accessToken, user: refreshedUser, refreshToken: newRefreshToken } = await refreshResponse.json();
        
        setAuthToken(accessToken);
        setUser(refreshedUser);
        sessionStorage.setItem('iqbaes-token', accessToken);
        sessionStorage.setItem('iqbaes-user', JSON.stringify(refreshedUser));
        if (newRefreshToken) {
          sessionStorage.setItem('iqbaes-refresh-token', newRefreshToken);
        }
        
        setSessionStatus('active');
        
        // Setup next refresh
        setupSmartTokenRefresh(accessToken);
      } else {
        setSessionStatus('expired');
        clearAuthState();
        window.location.hash = '#/login';
      }
    } catch (error) {
      setSessionStatus('expired');
      clearAuthState();
      window.location.hash = '#/login';
    } finally {
      refreshPromiseRef.current = null;
    }
  }, [setupSmartTokenRefresh, clearAuthState]);

  // Manual session extension
  const extendSession = useCallback(async () => {
    await performTokenRefresh();
  }, [performTokenRefresh]);

  const fetchInitialData = useCallback(async (suppressLogout: boolean = false) => {
    try {
      const data = await apiFetch('/bootstrap', {}, 0, refreshPromiseRef);
      
      // Update user with enrolledCourseIds from bootstrap response
      if (data.user) {
        setUser(data.user);
        sessionStorage.setItem('iqbaes-user', JSON.stringify(data.user));
      }
      
      setUsers(data.users || []);
      setCourses(data.courses || []);
      setExams(data.exams || []);
      setSubmissions(data.submissions || []);
      setLogs(data.logs || []);
      setBankQuestions(data.bankQuestions || []);
    } catch (error) {
      console.error("Failed to fetch initial data", error);
      // Only logout if suppressLogout is false (normal behavior)
      // If suppressLogout is true, just log the error without redirecting
      if (!suppressLogout) {
        clearAuthState();
        window.location.hash = '#/login';
      } else {
        console.warn("Failed to fetch initial data (suppressing logout):", error);
      }
    }
  }, [clearAuthState]);

  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        const storedUser = sessionStorage.getItem('iqbaes-user');
        const storedToken = sessionStorage.getItem('iqbaes-token');
        
        if (storedUser && storedToken) {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setAuthToken(storedToken);
          
          // Check if token is still valid
          const expiresAt = decodeTokenExpiration(storedToken);
          if (expiresAt && expiresAt > Date.now()) {
            setupSmartTokenRefresh(storedToken);
            await fetchInitialData();
          } else {
            // Token expired, try refresh
            await performTokenRefresh();
            await fetchInitialData();
          }
          // CRITICAL: Always set loading to false after fetchInitialData completes
          setIsLoading(false);
        } else {
          // No stored user/token - just finish loading
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Failed to initialize auth", error);
        // Don't clear session on initialization error - allow app to render
        // The error might be temporary (backend not running, network issue, etc.)
        setIsLoading(false);
      }
    };
    initializeAuth();
  }, [fetchInitialData, setupSmartTokenRefresh, performTokenRefresh, decodeTokenExpiration, clearAuthState]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const addLog = useCallback(async (log: Omit<Log, 'id'>) => {
      try {
        const newLog = await apiFetch('/logs', {
            method: 'POST',
            body: JSON.stringify(log),
        }, 0, refreshPromiseRef);
        setLogs(prev => [newLog, ...prev]);
      } catch (error) {
          console.error("Failed to add log:", error);
      }
  }, []);

  const clearLogs = useCallback(async () => {
    try {
      await apiFetch('/logs', { method: 'DELETE' }, 0, refreshPromiseRef);
      setLogs([]);
      // Refresh data to ensure UI is in sync with database
      await fetchInitialData();
    } catch (error) {
      console.error("Failed to clear logs:", error);
      throw error;
    }
  }, [fetchInitialData]);

  const initiateExamSession = useCallback(async (examId: string) => {
      try {
        const response = await apiFetch('/submissions/start-session', {
            method: 'POST',
            body: JSON.stringify({ examId }),
        }, 0, refreshPromiseRef);
        return response;
      } catch (error) {
          console.error("Failed to start exam session:", error);
          throw error;
      }
  }, []);

  const login = useCallback(async (username: string, password?: string): Promise<User> => {
    const { user: authedUser, accessToken: token, refreshToken } = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    }, 0, refreshPromiseRef);
    
    setUser(authedUser);
    setAuthToken(token);
    setSessionStatus('active');
    
    sessionStorage.setItem('iqbaes-user', JSON.stringify(authedUser));
    sessionStorage.setItem('iqbaes-token', token);
    if (refreshToken) {
      sessionStorage.setItem('iqbaes-refresh-token', refreshToken);
    }
    
    // Setup smart token refresh
    setupSmartTokenRefresh(token);
    
    await fetchInitialData();
    
    // Small delay to ensure any token refresh from fetchInitialData is complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return authedUser;
  }, [fetchInitialData, addLog, setupSmartTokenRefresh]);

  const logout = useCallback(async () => {
    // CRITICAL: Clear auth state FIRST to prevent routing issues
    // This ensures user state is cleared immediately, preventing any routing logic
    // from thinking the user is still authenticated
    clearAuthState();
    
    // Then set hash to login page immediately
    window.location.hash = '#/login';
    
    // Log logout AFTER clearing state (non-blocking)
    // Rely on backend to log logout events to avoid duplicates
    // Use a separate try-catch so it doesn't affect the logout flow
    try {
      // Get token before clearing (if still available)
      const token = sessionStorage.getItem('iqbaes-token');
      if (token) {
        // Make logout API call without waiting - fire and forget
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }).catch(err => {
          console.error('Logout API call failed (non-critical):', err);
        });
      }
    } catch (error) {
      // Silently fail - logout should proceed regardless
      console.error('Logout API call error (non-critical):', error);
    }
  }, [clearAuthState]);

  const register = useCallback(async (username: string, name: string, role: Role): Promise<User> => {
    const resp = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, name, role }),
    }, 0, refreshPromiseRef);
    const newUser = resp.user;
    const token = resp.token || resp.accessToken;
    const refreshToken = resp.refreshToken;
    setUser(newUser);
    setAuthToken(token);
    setSessionStatus('active');
    sessionStorage.setItem('iqbaes-user', JSON.stringify(newUser));
    sessionStorage.setItem('iqbaes-token', token);
    if (refreshToken) {
      sessionStorage.setItem('iqbaes-refresh-token', refreshToken);
    }
    
    setupSmartTokenRefresh(token);
    
    await fetchInitialData();
    
    // Small delay to ensure any token refresh from fetchInitialData is complete
     await new Promise(resolve => setTimeout(resolve, 200));
    
    return newUser;
  }, [fetchInitialData, addLog, setupSmartTokenRefresh]);

    // Real password reset API calls
    const requestPasswordReset = async (email: string) => {
        try {
            const data = await apiFetch('/auth/request-password-reset', {
                method: 'POST',
                body: JSON.stringify({ email }),
            }, 0, refreshPromiseRef);
            
            return data.message;
        } catch (error: any) {
            console.error('Password reset request error:', error);
            throw new Error(error.message || 'Failed to request password reset');
        }
    };
    
    const resetPasswordWithToken = async (token: string, newPassword: string) => {
        try {
            const data = await apiFetch('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token, newPassword }),
            }, 0, refreshPromiseRef);
            
            return data.message;
        } catch (error: any) {
            console.error('Password reset error:', error);
            throw new Error(error.message || 'Failed to reset password');
        }
    };

    // --- CRUD Operations ---
    const addUser = useCallback(async (userData: Omit<User, 'id'>) => {
        const newUser = await apiFetch('/users', { method: 'POST', body: JSON.stringify(userData) }, 0, refreshPromiseRef);
        setUsers(prev => [...prev, newUser]);
    }, []);

    const updateUser = useCallback(async (updatedUser: User) => {
        const returnedUser = await apiFetch(`/users/${updatedUser.id}`, { method: 'PUT', body: JSON.stringify(updatedUser) }, 0, refreshPromiseRef);
        setUsers(prev => prev.map(u => (u.id === returnedUser.id ? returnedUser : u)));
    }, []);

    const deleteUser = useCallback(async (userId: string) => {
        await apiFetch(`/users/${userId}`, { method: 'DELETE' }, 0, refreshPromiseRef);
        setUsers(prev => prev.filter(u => u.id !== userId));
    }, []);

    const addCourse = useCallback(async (courseData: Omit<Course, 'id'>) => {
        const newCourse = await apiFetch('/courses', { method: 'POST', body: JSON.stringify(courseData) }, 0, refreshPromiseRef);
        setCourses(prev => [...prev, newCourse]);
    }, []);

    const updateCourse = useCallback(async (updatedCourse: Course) => {
        const returnedCourse = await apiFetch(`/courses/${updatedCourse.id}`, { method: 'PUT', body: JSON.stringify(updatedCourse) }, 0, refreshPromiseRef);
        setCourses(prev => prev.map(c => (c.id === returnedCourse.id ? returnedCourse : c)));
    }, []);

    const deleteCourse = useCallback(async (courseId: string) => {
        await apiFetch(`/courses/${courseId}`, { method: 'DELETE' }, 0, refreshPromiseRef);
        setCourses(prev => prev.filter(c => c.id !== courseId));
        setExams(prev => prev.filter(e => e.courseId !== courseId));
    }, []);

    const addExam = useCallback(async (examData: Omit<Exam, 'id' | 'questionCount'>) => {
        const newExam = await apiFetch('/exams', { method: 'POST', body: JSON.stringify(examData) }, 0, refreshPromiseRef);
        setExams(prev => [...prev, newExam]);
    }, []);

    const updateExam = useCallback(async (updatedExam: Exam) => {
        const returnedExam = await apiFetch(`/exams/${updatedExam.id}`, { method: 'PUT', body: JSON.stringify(updatedExam) }, 0, refreshPromiseRef);
        setExams(prev => prev.map(e => (e.id === returnedExam.id ? returnedExam : e)));
    }, []);

    const deleteExam = useCallback(async (examId: string) => {
        await apiFetch(`/exams/${examId}`, { method: 'DELETE' }, 0, refreshPromiseRef);
        setExams(prev => prev.filter(e => e.id !== examId));
    }, []);

    const addQuestionToBank = useCallback(async (question: Omit<BankQuestion, 'id'>) => {
        const newQuestion = await apiFetch('/bank-questions', { method: 'POST', body: JSON.stringify(question) }, 0, refreshPromiseRef);
        setBankQuestions(prev => [...prev, newQuestion]);
    }, []);

    const updateQuestionInBank = useCallback(async (updatedQuestion: BankQuestion) => {
        const returnedQuestion = await apiFetch(`/bank-questions/${updatedQuestion.id}`, { method: 'PUT', body: JSON.stringify(updatedQuestion) }, 0, refreshPromiseRef);
        setBankQuestions(prev => prev.map(q => (q.id === returnedQuestion.id ? returnedQuestion : q)));
    }, []);

    const deleteQuestionFromBank = useCallback(async (questionId: string) => {
        await apiFetch(`/bank-questions/${questionId}`, { method: 'DELETE' }, 0, refreshPromiseRef);
        setBankQuestions(prev => prev.filter(q => q.id !== questionId));
    }, []);

    const submitAndGradeExam = useCallback(async (exam: Exam, answers: UserAnswer[]): Promise<ExamSubmission> => {
        if (!user) throw new Error("User not authenticated for submission.");

        const submissionPayload = {
            examId: exam.id,
            courseId: exam.courseId,
            userId: user.id,
            answers,
        };
        
        const newSubmission = await apiFetch('/submissions', {
            method: 'POST',
            body: JSON.stringify(submissionPayload),
        }, 0, refreshPromiseRef);

        setSubmissions(prev => [...prev, newSubmission]);
        await addLog({
            userId: user.id,
            userName: user.name,
            type: 'submission',
            details: `Score: ${Math.round((newSubmission.totalPointsAwarded / newSubmission.totalPointsPossible) * 100)}%`,
            examId: exam.id,
            examTitle: exam.title,
            timestamp: new Date().toISOString(),
        });
        return newSubmission;
    }, [user, addLog]);

    const updateSubmissionResult = useCallback(async (submissionId: string, updatedResults: Result[]) => {
        const payload = { results: updatedResults };
        const updatedSubmission = await apiFetch(`/submissions/${submissionId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        }, 0, refreshPromiseRef);
        setSubmissions(prev => prev.map(s => s.id === submissionId ? updatedSubmission : s));
    }, []);

    const bulkGradeSubmissions = useCallback(async (submissionIds: string[], grades: { [questionId: string]: number }) => {
        const payload = { submissionIds, grades };
        const result = await apiFetch('/submissions/bulk-grade', {
            method: 'PUT',
            body: JSON.stringify(payload)
        }, 0, refreshPromiseRef);
        
        // Optimistically update submissions immediately
        if (result && result.updatedSubmissions) {
            setSubmissions(prev => {
                const updatedSubmissionsMap = new Map(
                    result.updatedSubmissions.map((sub: ExamSubmission) => [sub.id, sub])
                );
                
                const newSubmissions = prev.map(s => {
                    const updatedSubmission = updatedSubmissionsMap.get(s.id);
                    return updatedSubmission || s;
                });
                
                return newSubmissions;
            });
        }
        
        // Force refresh all data to ensure consistency (like allowRetake does)
        // This ensures all fields are properly loaded and submissions don't disappear
        await fetchInitialData();
        
        return result;
    }, [fetchInitialData]);

  const allowRetake = useCallback(async (submissionId: string, maxAttempts: number = 2) => {
    const updatedSubmission = await apiFetch(`/submissions/${submissionId}/allow-retake`, {
      method: 'PUT',
      body: JSON.stringify({ maxAttempts }),
    }, 0, refreshPromiseRef);
    
    console.log('🔄 allowRetake - API response:', updatedSubmission);
    console.log('🔄 allowRetake - Submission data:', updatedSubmission?.submission ? {
      id: updatedSubmission.submission.id,
      isRetakeAllowed: updatedSubmission.submission.isRetakeAllowed,
      flagged: updatedSubmission.submission.flagged,
      maxAttempts: updatedSubmission.submission.maxAttempts,
      attemptNumber: updatedSubmission.submission.attemptNumber
    } : 'No submission in response');
    
    // Update the specific submission in state immediately (optimistic update)
    if (updatedSubmission?.submission) {
      setSubmissions(prev => {
        const updated = prev.map(s => {
          if (s.id === submissionId) {
            console.log('🔄 Updating submission in state:', {
              old: { id: s.id, isRetakeAllowed: s.isRetakeAllowed, flagged: (s as any).flagged },
              new: { 
                id: updatedSubmission.submission.id, 
                isRetakeAllowed: updatedSubmission.submission.isRetakeAllowed,
                flagged: updatedSubmission.submission.flagged
              }
            });
            return updatedSubmission.submission;
          }
          return s;
        });
        return updated;
      });
    }
    
    // Force refresh all data immediately to ensure consistency
    await fetchInitialData();
    
    return updatedSubmission;
  }, [fetchInitialData]);

  const allowRetakeForStudent = useCallback(async (examId: string, userId: string, maxAttempts: number = 2) => {
    const result = await apiFetch(`/submissions/allow-retake`, {
      method: 'POST',
      body: JSON.stringify({ examId, userId, maxAttempts }),
    }, 0, refreshPromiseRef);
    
    // Force refresh all data immediately to get the new submission if it was created
    await fetchInitialData();
    
    return result;
  }, [fetchInitialData]);

  const revokeRetake = useCallback(async (submissionId: string, userId?: string, examId?: string) => {
    // Send userId and examId in request body as fallback if submission is not found by ID
    const body: any = {};
    if (userId) body.userId = userId;
    if (examId) body.examId = examId;
    
    const updatedSubmission = await apiFetch(`/submissions/${submissionId}/revoke-retake`, {
      method: 'PUT',
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
    }, 0, refreshPromiseRef);
    
    // Update the specific submission in state
    setSubmissions(prev => prev.map(s => s.id === submissionId ? updatedSubmission.submission : s));
    
    // Force refresh all data immediately
    await fetchInitialData();
    
    return updatedSubmission;
  }, [fetchInitialData]);
  
  const getStudentSubmissionHistory = useCallback(async (examId: string, studentId: string) => {
    const history = await apiFetch(`/submissions/exam/${examId}/student/${studentId}/history`, {}, 0, refreshPromiseRef);
    return history;
  }, []);

  const startExamSession = useCallback(async (examId: string, examTitle: string) => {
    if (!user) throw new Error("User not authenticated for starting exam session.");

    // Backend expects only examId in the request body
    const result = await apiFetch('/submissions/start-session', {
      method: 'POST',
      body: JSON.stringify({ examId }),
    }, 0, refreshPromiseRef);

    return result;
  }, [user]);

// Add periodic data refresh for students to pick up retake permissions
    useEffect(() => {
        if (user?.role !== 'student') return;
        
        const interval = setInterval(() => {
            // Refresh data every 30 seconds for students to pick up retake permissions
            fetchInitialData();
        }, 30000);
        
        return () => clearInterval(interval);
    }, []);
    
    const refreshData = useCallback(async () => {
      // Suppress logout on refresh to prevent navigation away from current page
      // If there's an error, we'll just log it and keep the user on the current page
      // This prevents the refresh button from causing unwanted redirects
      await fetchInitialData(true);
    }, [fetchInitialData]);

    const value = useMemo(() => ({
        user, users, courses, exams, submissions, logs, bankQuestions,
        login, logout, register, requestPasswordReset, resetPasswordWithToken,
        addExam, updateExam, deleteExam,
        addCourse, updateCourse, deleteCourse,
        addUser, updateUser, deleteUser,
        submitAndGradeExam, addLog, startExamSession,
        updateSubmissionResult, bulkGradeSubmissions,
        addQuestionToBank, updateQuestionInBank, deleteQuestionFromBank,
        allowRetake, allowRetakeForStudent, revokeRetake, getStudentSubmissionHistory,
        clearLogs, refreshData,
        isLoading, sessionStatus, extendSession,
      }), [
        user, users, courses, exams, submissions, logs, bankQuestions,
        login, logout, register, requestPasswordReset, resetPasswordWithToken,
        addExam, updateExam, deleteExam, addCourse, updateCourse, deleteCourse,
        addUser, updateUser, deleteUser, submitAndGradeExam, addLog, startExamSession,
        updateSubmissionResult, bulkGradeSubmissions, addQuestionToBank,
        updateQuestionInBank, deleteQuestionFromBank, allowRetake, allowRetakeForStudent, revokeRetake,
        getStudentSubmissionHistory, clearLogs, refreshData, isLoading, sessionStatus, extendSession
      ]);

    return (
        <AuthContext.Provider value={{
            user,
            users,
            courses,
            exams,
            submissions,
            logs,
            bankQuestions,
            sessionStatus,
            login,
            logout,
            register,
            requestPasswordReset,
            resetPasswordWithToken,
            addUser,
            updateUser,
            deleteUser,
            addCourse,
            updateCourse,
            deleteCourse,
            addExam,
            updateExam,
            deleteExam,
            addQuestionToBank,
            updateQuestionInBank,
            deleteQuestionFromBank,
            submitAndGradeExam,
            updateSubmissionResult,
            bulkGradeSubmissions,
            addLog,
            clearLogs,
            refreshData,
            startExamSession,
            allowRetake,
            allowRetakeForStudent,
            revokeRetake,
            getStudentSubmissionHistory,
            isLoading,
            extendSession,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
