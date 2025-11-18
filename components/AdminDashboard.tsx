import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from './Icon';
import { Role, User, Course, Log, LogType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { AddUserModal } from './AddUserModal';
import { EnhancedUserModal } from './EnhancedUserModal';
import { CreateCourseModal } from './CreateCourseModal';
import { Pagination } from './Pagination';
import AdminFeedbackView from './AdminFeedbackView';
import SystemLogsView from './SystemLogsView';
import { AdminIncidentsDashboard } from './AdminIncidentsDashboard';
import { useToast } from './Toast';


const ITEMS_PER_PAGE = 5;

const StatCard: React.FC<{ icon: string; title: string; value: string | number; color: string; iconBgColor: string }> = ({ icon, title, value, color, iconBgColor }) => (
    <div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-200 flex items-center space-x-6 h-32">
        <div className={`p-4 rounded-2xl ${iconBgColor} flex-shrink-0`}>
           <Icon path={icon} className={`w-8 h-8 ${color}`}/>
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-slate-500 text-sm font-medium mb-2">{title}</p>
            <p className="text-4xl font-bold text-slate-800">{value}</p>
        </div>
    </div>
);

const RoleChart: React.FC<{ data: { role: string; count: number; color: string }[] }> = ({ data }) => {
    const total = data.reduce((sum, item) => sum + item.count, 0);
    const roleIcons = {
        student: 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z',
        lecturer: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
        admin: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
    };
    
    return (
        <div className="bg-white rounded-2xl shadow-lg p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800">Users by Role</h3>
                <div className="text-xs text-slate-500">
                    Total: {total}
                </div>
            </div>
            
            <div className="flex-1 flex items-center justify-center">
                <div className="grid grid-cols-1 gap-3 w-full">
                    {data.map(item => (
                        <div key={item.role} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                            <div className="flex items-center space-x-3">
                                <div className={`p-3 rounded-lg ${item.color.replace('bg-', 'bg-').replace('-500', '-100')}`}>
                                    <Icon 
                                        path={roleIcons[item.role as keyof typeof roleIcons] || 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z'} 
                                        className={`w-5 h-5 ${item.color.replace('bg-', 'text-')}`} 
                                    />
                                </div>
                                <div>
                                    <span className="text-sm font-medium text-slate-700 capitalize">{item.role}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-bold text-slate-800">{item.count}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const RoleBadge: React.FC<{role: Role}> = ({role}) => {
    const roleConfig: {[key in Role]: {colors: string, icon: string, label: string}} = {
        student: {
            colors: 'bg-blue-100 text-blue-800',
            icon: 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z',
            label: 'Student'
        },
        lecturer: {
            colors: 'bg-purple-100 text-purple-800',
            icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
            label: 'Lecturer'
        },
        admin: {
            colors: 'bg-yellow-100 text-yellow-800',
            icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
            label: 'Admin'
        },
    };
    
    const config = roleConfig[role];
    
    return (
        <span className={`px-2 py-0.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full capitalize ${config.colors}`}>
            <Icon path={config.icon} className="w-3 h-3 mr-1" />
            {config.label}
        </span>
    );
}

// Helper function to format log details
const formatLogDetails = (log: Log) => {
  if (typeof log.details === 'string') {
    return log.details;
  }
  
  // Handle SystemLogs format - create user-friendly messages
  if (log.details && typeof log.details === 'object') {
    const details = log.details as any;
    
    // Handle HTTP requests
    if (details.httpMethod && details.httpUrl) {
      const status = details.httpStatusCode ? ` (${details.httpStatusCode})` : '';
      const responseTime = details.responseTime ? ` - ${details.responseTime}ms` : '';
      return `${details.httpMethod} ${details.httpUrl}${status}${responseTime}`;
    }
    
    // Handle errors
    if (details.error) {
      return `Error: ${details.error.message || details.error.name || 'Unknown error'}`;
    }
    
    // Handle file operations
    if (details.fileOperation) {
      const op = details.fileOperation;
      return `File ${op.operation}: ${op.filename} (${op.fileSize ? (op.fileSize / 1024).toFixed(1) + 'KB' : 'unknown size'})`;
    }
    
    // Handle database operations
    if (details.dbOperation) {
      const op = details.dbOperation;
      return `Database ${op.operation} on ${op.collection} (${op.executionTime}ms, ${op.documentsAffected} docs)`;
    }
    
    // Handle external service calls
    if (details.externalService) {
      const svc = details.externalService;
      return `External service: ${svc.name} - ${svc.endpoint} (${svc.responseTime}ms)`;
    }
    
    // Handle performance metrics
    if (details.metrics) {
      const metrics = details.metrics;
      const parts = [];
      if (metrics.cpuUsage) parts.push(`CPU: ${metrics.cpuUsage.toFixed(1)}%`);
      if (metrics.memoryUsage) parts.push(`Memory: ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB`);
      if (metrics.activeConnections) parts.push(`Connections: ${metrics.activeConnections}`);
      return parts.length > 0 ? parts.join(', ') : 'Performance metrics recorded';
    }
    
    // Fallback for other object types - show key information
    const keys = Object.keys(details);
    if (keys.length > 0) {
      const importantKeys = keys.filter(key => 
        !['_id', '__v', 'createdAt', 'updatedAt', 'timestamp'].includes(key)
      ).slice(0, 3);
      
      if (importantKeys.length > 0) {
        return importantKeys.map(key => {
          const value = details[key];
          if (typeof value === 'object') {
            return `${key}: [object]`;
          }
          return `${key}: ${String(value).substring(0, 50)}`;
        }).join(', ');
      }
    }
  }
  
  return JSON.stringify(log.details, null, 2);
};

const logDisplayConfig: Record<LogType, { icon: string; color: string; label?: string; message: (log: Log) => React.ReactElement }> = {
    violation: {
        icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z",
        color: 'text-yellow-500',
        message: (log: Log) => {
            // Use the message field directly (it contains the clean violation message)
            // Format: "Tab Switch: Window focus lost" or "Text Selection: Excessive text selection detected"
            const violationMessage = (log as any).message || 'Violation detected';
            
            // Try to extract exam title from details if available
            let examTitle = log.examTitle || '';
            if (!examTitle && typeof log.details === 'string') {
                try {
                    const parsed = JSON.parse(log.details);
                    if (parsed.examTitle) {
                        examTitle = parsed.examTitle;
                    } else if (parsed.examId && !examTitle) {
                        // If we have examId but no title, show examId as fallback
                        examTitle = `Exam ID: ${parsed.examId}`;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
            
            return (
                <>
                    <p className="text-sm font-semibold text-slate-700">
                        <span className="font-semibold">{log.userName}</span> - <span className="font-bold text-red-600">{violationMessage}</span>
                    </p>
                    {examTitle && (
                        <p className="text-xs text-slate-500 mt-1">Exam: {examTitle}</p>
                    )}
                </>
            );
        },
    },
    login: {
        icon: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m-3 0l3-3m0 0l-3-3m3 3H9",
        color: 'text-green-500',
        message: (log: Log) => (
            <p className="text-sm text-slate-700"><span className="font-semibold">{log.userName}</span> logged in successfully.</p>
        ),
    },
    logout: {
        icon: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75",
        color: 'text-slate-500',
        message: (log: Log) => (
            <p className="text-sm text-slate-700"><span className="font-semibold">{log.userName}</span> logged out.</p>
        ),
    },
    submission: {
        icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-1.125 0-2.062.938-2.062 2.063v10.125c0 1.125.937 2.063 2.063 2.063h10.125c1.125 0 2.063-.938 2.063-2.063V10.312c0-1.125-.938-2.063-2.063-2.063H8.25m-1.5 6H12m0 0v-1.5m0 1.5l-1.5-1.5m1.5 1.5l1.5-1.5",
        color: 'text-blue-500',
        message: (log: Log) => (
             <>
                <p className="text-sm font-semibold text-slate-700">{log.userName} submitted <span className="font-bold text-indigo-600">{log.examTitle}</span></p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
            </>
        ),
    },
    submission_updated: {
        icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
        color: 'text-purple-500',
        label: 'Retake Management',
        message: (log: Log) => {
            // Use the message field if available (it contains the clear message like "Retake exam granted to Ahmad Abdullah")
            // Otherwise, try to parse details or use a fallback
            let displayMessage = (log as any).message;
            
            if (!displayMessage && typeof log.details === 'string') {
                try {
                    const parsed = JSON.parse(log.details);
                    if (parsed.studentName) {
                        displayMessage = `Retake exam ${parsed.action === 'retake_revoked' ? 'revoked for' : 'granted to'} ${parsed.studentName}`;
                    } else {
                        displayMessage = log.details;
                    }
                } catch (e) {
                    displayMessage = log.details;
                }
            }
            
            // Fallback if nothing is available
            if (!displayMessage) {
                displayMessage = `${log.userName} updated submission`;
            }
            
            return (
                <>
                    <p className="text-sm font-semibold text-slate-700">{displayMessage}</p>
                    {typeof log.details === 'string' && log.details.startsWith('{') && (
                        <p className="text-xs text-slate-500 mt-1">
                            {(() => {
                                try {
                                    const parsed = JSON.parse(log.details);
                                    if (parsed.examTitle) {
                                        return `Exam: ${parsed.examTitle}`;
                                    }
                                } catch (e) {
                                    return null;
                                }
                                return null;
                            })()}
                        </p>
                    )}
                </>
            );
        },
    },
    exam_start: {
        icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
        color: 'text-green-600',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">{log.userName} started <span className="font-bold text-green-600">{log.examTitle}</span></p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
            </>
        ),
    },
    exam_access: {
        icon: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z",
        color: 'text-indigo-600',
        message: (log: Log) => {
            // Check if this is an admin invalidation action
            const message = (log as any).message || '';
            if (message.includes('invalidated exam session')) {
                // This is an admin invalidation - display it clearly
                return (
                    <>
                        <p className="text-sm font-semibold text-slate-700">{message}</p>
                        {typeof log.details === 'string' && log.details.startsWith('{') && (
                            <p className="text-xs text-slate-500 mt-1">
                                {(() => {
                                    try {
                                        const parsed = JSON.parse(log.details);
                                        if (parsed.examTitle) {
                                            return `Exam: ${parsed.examTitle}`;
                                        }
                                    } catch (e) {
                                        return null;
                                    }
                                    return null;
                                })()}
                            </p>
                        )}
                    </>
                );
            }
            // Regular exam access
            return (
                <>
                    <p className="text-sm font-semibold text-slate-700">{log.userName} accessed <span className="font-bold text-indigo-600">{log.examTitle}</span></p>
                    <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
                </>
            );
        },
    },
    admin_access: {
        icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
        color: 'text-red-600',
        message: (log: Log) => {
            // Use the message field if available (it contains the clear message like "Admin invalidated exam session for Student")
            const message = (log as any).message || '';
            
            // If message contains invalidation, display it directly
            if (message.includes('invalidated exam session')) {
                return (
                    <>
                        <p className="text-sm font-semibold text-slate-700">{message}</p>
                        {typeof log.details === 'string' && log.details.startsWith('{') && (
                            <p className="text-xs text-slate-500 mt-1">
                                {(() => {
                                    try {
                                        const parsed = JSON.parse(log.details);
                                        if (parsed.examTitle) {
                                            return `Exam: ${parsed.examTitle}`;
                                        }
                                    } catch (e) {
                                        return null;
                                    }
                                    return null;
                                })()}
                            </p>
                        )}
                    </>
                );
            }
            
            // Fallback for other admin access
            return (
                <>
                    <p className="text-sm font-semibold text-slate-700">{log.userName} - <span className="font-bold text-red-600">Admin Action</span></p>
                    <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
                </>
            );
        },
    },
    camera_start: {
        icon: "M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z",
        color: 'text-purple-600',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">{log.userName} started camera monitoring for <span className="font-bold text-purple-600">{log.examTitle}</span></p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
            </>
        ),
    },
    ai_proctoring_violation: {
        icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z",
        color: 'text-purple-600',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">{log.userName} triggered <span className="font-bold text-purple-600">AI Proctoring Violation</span></p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)} in {log.examTitle}</p>
            </>
        ),
    },
    session_flagged: {
        icon: "M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5",
        color: 'text-red-600',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">{log.userName}'s session was <span className="font-bold text-red-600">flagged</span></p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)} in {log.examTitle}</p>
            </>
        ),
    },
    // Add support for SystemLogs types
    api_request: {
        icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3s-4.5 4.03-4.5 9 2.015 9 4.5 9z",
        color: 'text-blue-500',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">API Request</p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
            </>
        ),
    },
    application_error: {
        icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z",
        color: 'text-red-500',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">Application Error</p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
            </>
        ),
    },
    performance_issue: {
        icon: "M3 13h8V3H9v6H3v4zm0 8h6v-6H3v6zm10 0h8v-6h-2v4h-6v2zm2-8V3h-2v6h2v4z",
        color: 'text-yellow-500',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">Performance Issue</p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
            </>
        ),
    },
    database_error: {
        icon: "M20 14.66V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34a2 2 0 0 1 1.41.59l2.66 2.66a2 2 0 0 1 .59 1.41z",
        color: 'text-red-500',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">Database Error</p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
            </>
        ),
    },
    lecturer_access: {
        icon: "M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443a55.381 55.381 0 015.25 2.882V15",
        color: 'text-blue-600',
        message: (log: Log) => (
            <>
                <p className="text-sm font-semibold text-slate-700">{log.userName} - <span className="font-bold text-blue-600">Lecturer Action</span></p>
                <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
            </>
        ),
    }
};



const AdminDashboard: React.FC = () => {
  const { user: currentUser, users, courses, addCourse, updateCourse, deleteCourse, addUser, updateUser, deleteUser, logs, submissions, clearLogs, refreshData } = useAuth();
  const { showToast } = useToast();
  
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'courses' | 'logs' | 'system-logs' | 'feedback' | 'incidents'>(() => {
    // Preserve the active tab from sessionStorage to prevent reset on refresh
    const savedTab = sessionStorage.getItem('adminDashboardActiveTab');
    return (savedTab as typeof activeTab) || 'overview';
  });
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<Role | 'all'>('all');

  // Save active tab to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('adminDashboardActiveTab', activeTab);
  }, [activeTab]);

  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [usersPage, setUsersPage] = useState(1);
  const [coursesPage, setCoursesPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [logsSearchTerm, setLogsSearchTerm] = useState('');
  
  // --- Analytics Calculations ---
  const roleCounts = useMemo(() => {
    return users.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
    }, {} as Record<Role, number>);
  }, [users]);
  
  const chartData = [
      { role: 'student', count: roleCounts.student || 0, color: 'bg-blue-500' },
      { role: 'lecturer', count: roleCounts.lecturer || 0, color: 'bg-purple-500' },
      { role: 'admin', count: roleCounts.admin || 0, color: 'bg-yellow-500' },
  ];
  // Calculate online users based on recent activity (any activity, not just login)
  // This reflects users who have active sessions and are currently using the system
  const [activeExamSessionUsers, setActiveExamSessionUsers] = useState<Set<string>>(new Set());
  
  // Fetch active exam sessions as additional source for online users
  useEffect(() => {
    const fetchActiveSessions = async () => {
      try {
        const token = sessionStorage.getItem('iqbaes-token');
        if (!token) return;
        
        const response = await fetch('/api/submissions/active-sessions', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const sessions = data.activeSessions || data.sessions || [];
          const userIds = new Set(
            sessions
              .map((s: any) => s.userId || s.studentId)
              .filter(Boolean)
              .map((id: any) => String(id))
          );
          setActiveExamSessionUsers(userIds);
        }
      } catch (error: any) {
        // Silently fail - this is just supplementary data
        // Don't log connection errors to reduce noise when backend is not running
        // Only log if it's not a connection error
        if (error?.message && !error.message.includes('ECONNREFUSED') && !error.message.includes('fetch')) {
          console.warn('Error fetching active sessions:', error);
        }
      }
    };
    
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Real-time online users state (updated via WebSocket)
  const [onlineUsersSet, setOnlineUsersSet] = useState<Set<string>>(new Set());
  
  // Set up WebSocket connection for real-time login/logout events
  useEffect(() => {
    let socket: any = null;
    let mounted = true;
    
    const initializeSocket = async () => {
      try {
        // Dynamically import socket.io-client
        const { io } = await import('socket.io-client');
        
        // Determine socket URL - prefer explicit env; in dev map vite (5173/5174) to backend (5000)
        const envUrl = (window as any).VITE_SOCKET_URL;
        let socketUrl = envUrl || window.location.origin;
        const port = window.location.port;
        if (!envUrl && (port === '5173' || port === '5174')) {
          socketUrl = `${window.location.protocol}//${window.location.hostname}:5000`;
        }
        
        socket = io(socketUrl, {
          path: '/socket.io',
          transports: ['websocket', 'polling']
        });
        
        if (!mounted) {
          socket.disconnect();
          return;
        }
        
        socket.on('connect', () => {
          console.log('✅ Admin Dashboard connected to Socket.IO');
          // Join admin dashboard room to receive login/logout events
          socket.emit('join_admin_dashboard');
          
          // Add current user to online set if they're logged in
          // (they're viewing the dashboard, so they're definitely online)
          if (mounted && currentUser?.id) {
            setOnlineUsersSet(prev => {
              const newSet = new Set(prev);
              newSet.add(String(currentUser.id));
              return newSet;
            });
          }
        });
        
        socket.on('user_login', (data: { userId: string; userName: string; timestamp: string }) => {
          console.log('🔵 User logged in:', data);
          if (mounted) {
            setOnlineUsersSet(prev => {
              const newSet = new Set(prev);
              newSet.add(data.userId);
              return newSet;
            });
            // Refresh logs to update the count (triggers useMemo recalculation)
            refreshData();
          }
        });
        
        socket.on('user_logout', (data: { userId: string; userName: string; timestamp: string }) => {
          console.log('🔴 User logged out:', data);
          if (mounted) {
            setOnlineUsersSet(prev => {
              const newSet = new Set(prev);
              newSet.delete(data.userId);
              return newSet;
            });
            // Refresh logs to update the count (triggers useMemo recalculation)
            refreshData();
          }
        });
        
        socket.on('disconnect', () => {
          console.log('⚠️ Admin Dashboard disconnected from Socket.IO');
        });
        
        socket.on('connect_error', (error: any) => {
          console.error('❌ Socket.IO connection error:', error);
        });
      } catch (error) {
        console.error('Failed to initialize Socket.IO:', error);
      }
    };
    
    initializeSocket();
    
    // Also add current user immediately when component mounts (if socket connects later)
    if (currentUser?.id) {
      setOnlineUsersSet(prev => {
        const newSet = new Set(prev);
        newSet.add(String(currentUser.id));
        return newSet;
      });
    }
    
    return () => {
      mounted = false;
      if (socket) {
        socket.disconnect();
      }
    };
  }, [refreshData, currentUser]);
  
  const onlineUsersCount = useMemo(() => {
    const onlineThresholdMs = 15 * 60 * 1000; // 15 minutes - shorter threshold for more accuracy
    const now = Date.now();
    
    // Build a map of userId -> latest login timestamp
    const userLogins = new Map<string, number>();
    const userLogouts = new Map<string, number>();
    
    // Process logs to find login and logout events
    logs.forEach(log => {
      const userId = log.userId ? String(log.userId) : (log.userName || null);
      if (!userId) return;
      
      const logTime = new Date(log.timestamp).getTime();
      
      if (log.type === 'login') {
        const existingLogin = userLogins.get(userId);
        if (!existingLogin || logTime > existingLogin) {
          userLogins.set(userId, logTime);
        }
      } else if (log.type === 'logout') {
        const existingLogout = userLogouts.get(userId);
        if (!existingLogout || logTime > existingLogout) {
          userLogouts.set(userId, logTime);
        }
      }
    });
    
    // Determine online users: must have a login, no logout after login, and within threshold
    const onlineUsers = new Set<string>();
    
    userLogins.forEach((loginTime, userId) => {
      const logoutTime = userLogouts.get(userId);
      const isWithinThreshold = (now - loginTime) <= onlineThresholdMs;
      
      // User is online if:
      // 1. Login is within threshold
      // 2. Either no logout, or logout happened before login (data inconsistency), or logout is more than 15 min ago
      // 3. If logout exists and is after login, check if it's recent (within threshold) - if so, user is offline
      const hasRecentLogout = logoutTime && logoutTime > loginTime && (now - logoutTime) <= onlineThresholdMs;
      
      if (isWithinThreshold && !hasRecentLogout) {
        // User logged in recently and either didn't log out, or logged out too long ago to matter
        onlineUsers.add(userId);
      }
    });
    
    // Add users with active exam sessions (they're definitely online)
    activeExamSessionUsers.forEach(userId => {
      onlineUsers.add(userId);
    });
    
    // Merge with real-time WebSocket tracked users
    onlineUsersSet.forEach(userId => {
      onlineUsers.add(userId);
    });
    
    // Always include the current logged-in user (viewing the dashboard means they're online)
    if (currentUser?.id) {
      onlineUsers.add(String(currentUser.id));
    }
    
    return onlineUsers.size;
  }, [logs, activeExamSessionUsers, onlineUsersSet, currentUser]);

  const recentLogs = useMemo(() => {
    // Filter out repetitive mouse movement violations
    const filtered = logs.filter(log => {
      if (log.type === 'violation' && typeof log.details === 'string' && 
          log.details.includes('Mouse Movement Outside Exam Area')) {
        return false; // Skip repetitive mouse movements
      }
      return true;
    });
    
    // Sort STRICTLY by timestamp (most recent first) - CHRONOLOGICAL ORDER
    const sortedByTime = [...filtered].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA; // Most recent first
    });
    
    // Return the 6 most recent activities
    return sortedByTime.slice(0, 6);
  }, [logs]);

  // --- User Filtering ---
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                           user.username.toLowerCase().includes(userSearchTerm.toLowerCase());
      const matchesRole = userRoleFilter === 'all' || user.role === userRoleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, userSearchTerm, userRoleFilter]);

  // --- Pagination Logic ---
  const paginatedUsers = useMemo(() => filteredUsers.slice((usersPage - 1) * ITEMS_PER_PAGE, usersPage * ITEMS_PER_PAGE), [filteredUsers, usersPage]);
  const paginatedCourses = useMemo(() => courses.slice((coursesPage - 1) * ITEMS_PER_PAGE, coursesPage * ITEMS_PER_PAGE), [courses, coursesPage]);
  const filteredLogs = useMemo(() => {
    // First, filter out AI service requests
    const logsWithoutAI = logs.filter(log => {
      // Check if log details or message contains AI service request
      const details = (log.details || '').toString().toLowerCase();
      const message = (log.message || '').toString().toLowerCase();
      const action = (log as any).action || '';
      const actionStr = action.toString().toLowerCase();
      const url = (log as any).url || '';
      const urlStr = url.toString().toLowerCase();
      
      // Format details to check formatted output as well
      const formattedDetails = formatLogDetails(log);
      const formattedDetailsStr = formattedDetails ? formattedDetails.toString().toLowerCase() : '';
      
      // Exclude AI service requests - check all possible fields
      if (details.includes('/api/ai/') || 
          details.includes('ai/generate-question') ||
          message.includes('/api/ai/') ||
          message.includes('ai/generate-question') ||
          actionStr.includes('/api/ai/') ||
          actionStr.includes('ai/generate-question') ||
          actionStr.includes('ai_service_request') ||
          urlStr.includes('/api/ai/') ||
          urlStr.includes('ai/generate-question') ||
          formattedDetailsStr.includes('/api/ai/') ||
          formattedDetailsStr.includes('ai/generate-question')) {
        return false;
      }
      return true;
    });
    
    // Then apply search filter if there's a search term
    const term = logsSearchTerm.trim().toLowerCase();
    if (!term) return logsWithoutAI;
    return logsWithoutAI.filter(log => {
      const userMatch = (log.userName || '').toLowerCase().includes(term);
      const typeMatch = (log.type || '').toLowerCase().includes(term);
      const detailsText = (formatLogDetails(log) || '').toString().toLowerCase();
      const detailsMatch = detailsText.includes(term);
      return userMatch || typeMatch || detailsMatch;
    });
  }, [logs, logsSearchTerm]);
  const paginatedLogs = useMemo(() => filteredLogs.slice((logsPage - 1) * ITEMS_PER_PAGE, logsPage * ITEMS_PER_PAGE), [filteredLogs, logsPage]);

  // --- Handlers ---
  const handleEditCourse = (course: Course) => {
    setEditingCourse(course);
    setIsCourseModalOpen(true);
  }

  const handleDeleteCourse = async (courseId: string) => {
    if (!window.confirm('Are you sure you want to delete this course? This action will also delete all associated exams, submissions, and logs. This cannot be undone.')) {
      return;
    }
    try {
      await deleteCourse(courseId);
      alert('Course deleted successfully');
    } catch (err: any) {
      alert(`Failed to delete course: ${err?.message || err}`);
    }
  };

  const handleSaveCourse = async (courseData: Omit<Course, 'id'> | Course) => {
    try {
      if ('id' in courseData) {
        await updateCourse(courseData);
        showToast({
          message: '✅ Course Updated Successfully!',
          subtitle: `Course ${courseData.name || courseData.code} has been updated`,
          type: 'success'
        });
      } else {
        await addCourse(courseData);
        showToast({
          message: '✅ Course Created Successfully!',
          subtitle: `Course ${courseData.name || courseData.code} has been added`,
          type: 'success'
        });
      }
      setIsCourseModalOpen(false);
      setEditingCourse(null);
    } catch (err: any) {
      showToast({
        message: '❌ Failed to Save Course',
        subtitle: err?.message || 'An error occurred',
        type: 'error'
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      alert('You cannot delete your own account.');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this user? This will also remove all their submissions and logs. This action cannot be undone.')) {
      return;
    }
    try {
      await deleteUser(userId);
      alert('User deleted successfully');
    } catch (err: any) {
      alert(`Failed to delete user: ${err?.message || err}`);
    }
  };

  const handleResetPassword = async (user: User) => {
    const newPassword = prompt(`Enter new password for ${user.name}:`);
    if (newPassword && newPassword.length >= 6) {
      try {
        const updatedUser = { ...user, password: newPassword };
        await updateUser(updatedUser);
        alert(`Password updated successfully for ${user.name}`);
      } catch (err: any) {
        alert(`Failed to update password: ${err?.message || err}`);
      }
    } else if (newPassword !== null) {
      alert('Password must be at least 6 characters long.');
    }
  };

  const handleUnlockAccount = async (user: User) => {
    if (!window.confirm(`Unlock account for ${user.name} (${user.username})?`)) {
      return;
    }
    
    try {
      const token = sessionStorage.getItem('iqbaes-token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`/api/users/${user.id}/unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to unlock account');
      }

      const result = await response.json();
      
      showToast({
        message: '✅ Account Unlocked Successfully!',
        subtitle: result.message || `Account for ${user.name} has been unlocked`,
        type: 'success'
      });

      // Refresh user list to get updated data
      refreshData();
    } catch (err: any) {
      showToast({
        message: '❌ Failed to Unlock Account',
        subtitle: err?.message || 'An error occurred while unlocking the account',
        type: 'error'
      });
    }
  };

  const handleSaveUser = async (userData: Omit<User, 'id'> | User) => {
    try {
      if ('id' in userData) {
        await updateUser(userData);
        showToast({
          message: '✅ User Updated Successfully!',
          subtitle: `User ${userData.name || 'profile'} has been updated`,
          type: 'success'
        });
      } else {
        await addUser(userData);
        showToast({
          message: '✅ User Created Successfully!',
          subtitle: `User ${userData.name || 'account'} has been added`,
          type: 'success'
        });
      }
      setIsUserModalOpen(false);
      setEditingUser(null);
    } catch (err: any) {
      showToast({
        message: '❌ Failed to Save User',
        subtitle: err?.message || 'An error occurred',
        type: 'error'
      });
    }
  };

  const openAddUserModal = () => {
    setEditingUser(null);
    setIsUserModalOpen(true);
  }

  const openAddCourseModal = () => {
    setEditingCourse(null);
    setIsCourseModalOpen(true);
  }

  return (
    <>
    <div className="p-8 bg-slate-50 min-h-screen">
      <header className="mb-8">
        <div className="flex items-center space-x-4 mb-4">
          <img src="/fcom.png" alt="FCOM Logo" className="w-12 h-12" />
          <h1 className="text-3xl font-bold text-slate-800">Admin Dashboard</h1>
        </div>
        
        <nav className="flex space-x-1 bg-white rounded-lg p-1 shadow-sm max-w-fit mx-auto">
          {[
            { id: 'overview', label: 'Overview', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z' },
            { id: 'users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z' },
            { id: 'courses', label: 'Courses', icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25' },
            { id: 'incidents', label: 'Incidents', icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z' },
            { id: 'logs', label: 'Activity Logs', icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-1.125 0-2.062.938-2.062 2.063v10.125c0 1.125.937 2.063 2.063 2.063h10.125c1.125 0 2.063-.938 2.063-2.063V10.312c0-1.125-.938-2.063-2.063-2.063H8.25m-1.5 6H12m0 0v-1.5m0 1.5l-1.5-1.5m1.5 1.5l1.5-1.5' },
            { id: 'system-logs', label: 'System Logs', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
            { id: 'feedback', label: 'Feedback', icon: 'M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.691 1.35 3.061 3.041 3.061h.25c.69 0 1.25.56 1.25 1.25v.102c0 .497-.402.899-.899.899H6.25c-1.38 0-2.5-1.12-2.5-2.5V8.25c0-1.38 1.12-2.5 2.5-2.5h11.5c1.38 0 2.5 1.12 2.5 2.5v7.5c0 1.38-1.12 2.5-2.5 2.5H9.75c-.69 0-1.25-.56-1.25-1.25v-.102c0-.497.402-.899.899-.899h.25c1.691 0 3.041-1.37 3.041-3.061V8.25z' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === tab.id 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon path={tab.icon} className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* Modals */}
      {isUserModalOpen && (
        <EnhancedUserModal
          isOpen={isUserModalOpen}
          onClose={() => {
            setIsUserModalOpen(false);
            setEditingUser(null);
          }}
          onSave={handleSaveUser}
          userToEdit={editingUser}
          allCourses={courses}
        />
      )}

      {isCourseModalOpen && (
        <CreateCourseModal
          isOpen={isCourseModalOpen}
          onClose={() => {
            setIsCourseModalOpen(false);
            setEditingCourse(null);
          }}
          onSave={handleSaveCourse}
          course={editingCourse}
        />
      )}

      {/* Overview Section */}
      {activeTab === 'overview' && (
        <section id="overview" className="mb-12">
          {/* Key Metrics Cards - Simple */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
              <StatCard 
                  icon="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" 
                  title="Total Users" 
                  value={users.length} 
                  color="text-blue-600" 
                  iconBgColor="bg-blue-100" 
              />
              <StatCard 
                  icon="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" 
                  title="Total Courses" 
                  value={courses.length} 
                  color="text-purple-600" 
                  iconBgColor="bg-purple-100" 
              />
              <StatCard 
                  icon="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-1.125 0-2.062.938-2.062 2.063v10.125c0 1.125.937 2.063 2.063 2.063h10.125c1.125 0 2.063-.938 2.063-2.063V10.312c0-1.125-.938-2.063-2.063-2.063H8.25m-1.5 6H12m0 0v-1.5m0 1.5l-1.5-1.5m1.5 1.5l1.5-1.5"
                  title="Total Submissions" 
                  value={submissions.length} 
                  color="text-green-600" 
                  iconBgColor="bg-green-100" 
              />
              <StatCard 
                  icon="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" 
                  title="Security Alerts" 
                  value={logs.filter(log => log.type === 'violation').length} 
                  color="text-red-600" 
                  iconBgColor="bg-red-100" 
              />
              <StatCard 
                  icon="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" 
                  title="Online Users" 
                  value={onlineUsersCount} 
                  color="text-emerald-600" 
                  iconBgColor="bg-emerald-100" 
              />
          </div>

          {/* Charts and Activity Section */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* User Distribution Chart - Compact */}
              <div className="lg:col-span-1">
                  <RoleChart data={chartData} />
              </div>
              
              {/* Recent Activity - Takes More Space */}
              <div className="lg:col-span-3 bg-white rounded-2xl shadow-lg p-6 h-fit">
                  <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-slate-800">Recent Activity</h3>
                      <button 
                          onClick={() => setActiveTab('logs')}
                          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1 transition-colors"
                      >
                          <span>View All</span>
                          <Icon path="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" className="w-4 h-4" />
                      </button>
                  </div>
                  
                  <div className="space-y-2">
                      {recentLogs.length === 0 ? (
                          <div className="text-center py-6">
                              <div className="text-slate-300 text-3xl mb-2">📊</div>
                              <p className="text-slate-500 text-sm">No recent activity</p>
                          </div>
                      ) : (
                          recentLogs.map((log, index) => {
                              // Simple message formatting
                              const getSimpleMessage = (log: Log) => {
                                  const userName = log.userName || 'Unknown User';
                                  
                                  switch(log.type) {
                                      case 'submission':
                                          return `${userName} submitted an exam`;
                                      case 'exam_start':
                                          return `${userName} started an exam`;
                                      case 'login':
                                          return `${userName} logged in`;
                                      case 'logout':
                                          return `${userName} logged out`;
                                      case 'violation':
                                          return `${userName} triggered a violation`;
                                      case 'exam_access':
                                          return `${userName} accessed an exam`;
                                      case 'session_flagged':
                                          return `${userName}'s session was flagged`;
                                      default:
                                          return `${userName} - ${log.type}`;
                                  }
                              };
                              
                              return (
                                  <div key={log.id} className="flex items-center space-x-3 p-2 bg-slate-50 rounded-lg">
                                      <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0"></div>
                                      <div className="flex-1 min-w-0">
                                          <p className="text-sm text-slate-700 truncate">
                                              {getSimpleMessage(log)}
                                          </p>
                                          <p className="text-xs text-slate-400">
                                              {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                          </p>
                                      </div>
                                  </div>
                              );
                          })
                      )}
                  </div>
              </div>
          </div>
        </section>
      )}

      {activeTab === 'feedback' && <AdminFeedbackView />}

      {activeTab === 'incidents' && (
        <section id="incidents" className="mb-10">
          <AdminIncidentsDashboard user={currentUser!} />
        </section>
      )}

      {activeTab === 'system-logs' && (
        <section id="system-logs" className="mb-10">
          <SystemLogsView />
        </section>
      )}

      {/* Enhanced User Management Section */}
      {activeTab === 'users' && (
        <section id="users" className="mb-10">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">User Management</h2>
              <button onClick={openAddUserModal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2">
                  <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5" />
                  <span>Add User</span>
              </button>
          </div>

          {/* Search and Filter Controls */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                      <input
                          type="text"
                          placeholder="Search users by name or username..."
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                  </div>
                  <div>
                      <select
                          value={userRoleFilter}
                          onChange={(e) => setUserRoleFilter(e.target.value as Role | 'all')}
                          className="px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                          <option value="all">All Roles</option>
                          <option value="student">Students</option>
                          <option value="lecturer">Lecturers</option>
                          <option value="admin">Admins</option>
                      </select>
                  </div>
              </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                  <table className="w-full">
                      <thead className="bg-slate-50">
                          <tr>
                              <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Enrolled Courses</th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                          {paginatedUsers.map(user => (
                              <tr key={user.id} className="hover:bg-slate-50">
                                  <td className="px-6 py-4">
                                      <div>
                                          <div className="text-sm font-medium text-slate-900">{user.name}</div>
                                          <div className="text-sm text-slate-500">{user.username}</div>
                                      </div>
                                  </td>
                                  <td className="px-6 py-4">
                                      <RoleBadge role={user.role} />
                                  </td>
                                  <td className="px-6 py-4 text-sm text-slate-900">
                                      {user.enrolledCourseIds?.length || 0} course{(user.enrolledCourseIds?.length || 0) !== 1 ? 's' : ''}
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="flex space-x-2">
                                          <button 
                                              onClick={() => { setEditingUser(user); setIsUserModalOpen(true); }}
                                               className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                                           >
                                               Edit
                                           </button>
                                           <button 
                                              onClick={() => handleDeleteUser(user.id)}
                                               className="text-red-600 hover:text-red-900 text-sm font-medium"
                                               disabled={user.id === currentUser?.id}
                                           >
                                               Delete
                                           </button>
                                          <button 
                                              onClick={() => handleResetPassword(user)}
                                              className="text-green-600 hover:text-green-900 text-sm font-medium"
                                          >
                                              Reset Password
                                          </button>
                                          <button 
                                              onClick={() => handleUnlockAccount(user)}
                                              className="text-orange-600 hover:text-orange-900 text-sm font-medium"
                                              title="Unlock user account if it's locked due to failed login attempts"
                                          >
                                              🔓 Unlock
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
              <Pagination 
                  currentPage={usersPage} 
                  totalPages={Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)} 
                  onPageChange={setUsersPage} 
              />
          </div>
        </section>
      )}

      {activeTab === 'courses' && (
        <section id="courses" className="mb-10">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Course Management</h2>
              <button onClick={openAddCourseModal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2">
                  <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5" />
                  <span>Add Course</span>
              </button>
          </div>
          
          <div className="bg-white rounded-2xl shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                  <table className="w-full">
                      <thead className="bg-slate-50">
                          <tr>
                              <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Course</th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Enrolled Students</th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                          {paginatedCourses.map(course => {
                              const enrolledCount = users.filter(user => user.enrolledCourseIds?.includes(course.id) || false).length;
                              return (
                                  <tr key={course.id} className="hover:bg-slate-50">
                                      <td className="px-6 py-4">
                                          <div>
                                              <div className="text-sm font-medium text-slate-900">{course.name}</div>
                                              <div className="text-sm text-slate-500">{course.code}</div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-4 text-sm text-slate-900">{enrolledCount}</td>
                                      <td className="px-6 py-4 text-sm font-medium space-x-2">
                                          <button onClick={() => handleEditCourse(course)} className="text-indigo-600 hover:text-indigo-900">Edit</button>
                                          <button onClick={() => handleDeleteCourse(course.id)} className="text-red-600 hover:text-red-900">Delete</button>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
              <Pagination 
                  currentPage={coursesPage} 
                  totalPages={Math.ceil(courses.length / ITEMS_PER_PAGE)} 
                  onPageChange={setCoursesPage} 
              />
          </div>
        </section>
      )}

      {activeTab === 'logs' && (
        <section id="logs" className="mb-10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Activity Logs</h2>
            <div className="flex space-x-3">
              <button 
                onClick={() => refreshData()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4" />
                <span>Refresh</span>
              </button>
              <button 
                onClick={() => clearLogs()}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
              >
                <span>🗑️</span>
                <span>Clear All Logs</span>
              </button>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
            <input
              type="text"
              placeholder="Search activity logs (user, type, message)"
              value={logsSearchTerm}
              onChange={(e) => {
                setLogsSearchTerm(e.target.value);
                setLogsPage(1);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="bg-white rounded-2xl shadow-md p-6">
              <div className="space-y-4">
                  {paginatedLogs.length === 0 ? (
                      <p className="text-slate-500 text-center py-8">No activity logs found.</p>
                  ) : (
                      paginatedLogs.map(log => {
                          const config = logDisplayConfig[log.type] || {
                              icon: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z",
                              color: 'text-gray-500',
                              message: (log: Log) => (
                                  <>
                                      <p className="text-sm font-semibold text-slate-700">{log.userName} - <span className="font-bold text-gray-600">{log.type}</span></p>
                                      <p className="text-xs text-slate-500">{formatLogDetails(log)}</p>
                                  </>
                              )
                          };
                          return (
                              <div key={log.id} className="flex items-start space-x-4 p-4 bg-slate-50 rounded-lg">
                                  <Icon path={config.icon} className={`w-6 h-6 mt-1 ${config.color}`} />
                                  <div className="flex-1">
                                      {config.message(log)}
                                      <p className="text-xs text-slate-400 mt-2">{new Date(log.timestamp).toLocaleString()}</p>
                                  </div>
                              </div>
                          );
                      })
                  )}
              </div>
              <Pagination 
                  currentPage={logsPage} 
                  totalPages={Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)} 
                  onPageChange={setLogsPage} 
              />
          </div>
        </section>
      )}
    </div>
    </>
  );
};
export { AdminDashboard };



1