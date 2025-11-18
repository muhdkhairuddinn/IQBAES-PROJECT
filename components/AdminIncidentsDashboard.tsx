import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from './Icon';
import { useToast } from './Toast';

interface Violation {
  _id: string;
  id?: string; // Added for compatibility
  userId: string;
  userName: string;
  message: string;
  details: {
    sessionId?: string;
    examId?: string;
    examTitle?: string;
    reason?: string;
    violationCount?: number;
    status?: string;
    penaltyPct?: number;
    maxAttempts?: number;
    flaggedBy?: string;
  };
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  type: string;
  resolved?: boolean;
}

interface StudentViolationSummary {
  userId: string;
  userName: string;
  examId: string;
  examTitle: string;
  sessionId: string;
  totalViolations: number;
  resolvedViolations: number;
  unresolvedViolations: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  lastViolationTime: string;
  firstViolationTime: string;
  violationTypes: string[];
  violations: Violation[];
  autoFlagged: boolean;
}

interface AdminIncidentsDashboardProps {
  user: { id: string; name: string; role: string };
}

export const AdminIncidentsDashboard: React.FC<AdminIncidentsDashboardProps> = ({ user }) => {
  const { showToast } = useToast();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [studentSummaries, setStudentSummaries] = useState<StudentViolationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved' | 'auto-flagged'>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'Low' | 'Medium' | 'High' | 'Critical'>('all');
  const [sortBy, setSortBy] = useState<'violations' | 'time' | 'risk'>('violations');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [clearKey, setClearKey] = useState(0);
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());

  // API fetch helper
  const apiFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem('iqbaes-token');
    if (!token) throw new Error('No authentication token');

    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API Error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }, []);

  // Calculate risk level based on violation count, types, and severity
  const calculateRiskLevel = (violations: Violation[]): 'Low' | 'Medium' | 'High' | 'Critical' => {
    const unresolvedCount = violations.filter(v => !v.resolved).length;
    
    // If all violations are resolved, risk is always Low
    if (unresolvedCount === 0) return 'Low';
    
    const hasErrorLevel = violations.some(v => v.level === 'error');
    const hasWarnLevel = violations.some(v => v.level === 'warn');
    const hasMultipleTypes = new Set(violations.map(v => v.type)).size > 2;
    
    // Get violation types to determine severity
    const violationTypes = violations.map(v => v.type || '');
    const hasHighRiskTypes = violationTypes.some(type => 
      ['multiple_tabs', 'copy_paste', 'window_focus', 'ai_detection', 'screenshot', 'camera_off', 
       'dev_tools', 'drag_attempt', 'drop_attempt', 'window_blur'].includes(type)
    );
    const hasMediumRiskTypes = violationTypes.some(type =>
      ['keyboard_shortcut', 'text_selection', 'window_resize', 'inactivity', 'mouse_outside'].includes(type)
    );
    // Tab switches alone are low-risk, but many of them still indicate suspicious behavior
    const onlyTabSwitches = violationTypes.every(type => type === 'tab_switch' || type.includes('tab_switch'));
    
    // Critical: Error-level violations or very high unresolved count
    if (hasErrorLevel || unresolvedCount >= 15) return 'Critical';
    
    // High: High unresolved count, high-risk violation types, or mix of multiple types
    // Note: Even tab switches escalate to High if there are many unresolved
    if (unresolvedCount >= 10 || (hasHighRiskTypes && unresolvedCount >= 5) || (unresolvedCount >= 5 && hasMultipleTypes)) return 'High';
    
    // Medium: Moderate unresolved count, medium-risk types, or some suspicious behavior
    // For tab switches: 5+ unresolved is Medium (pattern), for others: 3+ is Medium
    if ((onlyTabSwitches && unresolvedCount >= 5) || (!onlyTabSwitches && unresolvedCount >= 3) || 
        unresolvedCount >= 2 && hasMultipleTypes || hasMediumRiskTypes) return 'Medium';
    
    // Low: Few violations (1-2 unresolved tab switches, or 1-2 of other types)
    return 'Low';
  };

  // Group violations by student
  const groupViolationsByStudent = (violations: Violation[]): StudentViolationSummary[] => {
    const grouped = new Map<string, Violation[]>();
    
    violations.forEach(violation => {
      const key = `${violation.userId}-${violation.details?.examId || 'unknown'}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(violation);
    });

    return Array.from(grouped.entries()).map(([key, studentViolations]) => {
      const firstViolation = studentViolations[0];
      const resolvedCount = studentViolations.filter(v => v.resolved).length;
      const unresolvedCount = studentViolations.length - resolvedCount;
      const riskLevel = calculateRiskLevel(studentViolations);
      
      return {
        userId: firstViolation.userId,
        userName: firstViolation.userName,
        examId: firstViolation.details?.examId || 'unknown',
        examTitle: firstViolation.details?.examTitle || 'Unknown Exam',
        sessionId: firstViolation.details?.sessionId || 'unknown',
        totalViolations: studentViolations.length,
        resolvedViolations: resolvedCount,
        unresolvedViolations: unresolvedCount,
        riskLevel,
        lastViolationTime: new Date(Math.max(...studentViolations.map(v => new Date(v.timestamp).getTime()))).toISOString(),
        firstViolationTime: new Date(Math.min(...studentViolations.map(v => new Date(v.timestamp).getTime()))).toISOString(),
        violationTypes: [...new Set(studentViolations.map(v => v.type))],
        violations: studentViolations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
        autoFlagged: unresolvedCount >= 5 || riskLevel === 'Critical'
      };
    });
  };

  // Fetch violations and group by student
  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/monitoring/violations?limit=1000'); // Increased limit for grouping
      console.log('Fetched violations:', response.data?.violations);

      const violations = response.data?.violations || [];
      setViolations(violations);
      
      const summaries = groupViolationsByStudent(violations);
      setStudentSummaries(summaries);
      
      console.log('Grouped summaries:', summaries);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  // Admin actions for student summaries
  const handleInvalidateStudent = async (summary: StudentViolationSummary, reason: string) => {
    if (!confirm(`Invalidate this student's session? This will disqualify their attempt.\n\nStudent: ${summary.userName}\nViolations: ${summary.unresolvedViolations}\nReason: ${reason}`)) return;
    
    setActionLoading(summary.userId);
    try {
      await apiFetch('/monitoring/admin/invalidate', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: summary.sessionId,
          reason: reason
        })
      });
      
      // Note: Backend now automatically resolves violations when invalidating
      
      await fetchViolations();
      
      showToast({
        message: '✅ Session Invalidated Successfully',
        subtitle: `${summary.userName}'s exam session has been disqualified. All violations have been automatically resolved.`,
        type: 'success'
      });
    } catch (err: any) {
      setError(err.message);
      showToast({
        message: '❌ Failed to Invalidate Session',
        subtitle: err?.message || 'An error occurred',
        type: 'error'
      });
    } finally {
      setActionLoading(null);
    }
  };


  const handleImposePenalty = async (summary: StudentViolationSummary) => {
    const penaltyPct = prompt(`Penalty percentage for ${summary.userName} (e.g., 20):`, '20');
    if (!penaltyPct || isNaN(Number(penaltyPct))) return;
    
    const penaltyValue = Number(penaltyPct);
    if (penaltyValue < 0 || penaltyValue > 100) {
      showToast({
        message: '⚠️ Invalid Penalty Percentage',
        subtitle: 'Penalty must be between 0 and 100',
        type: 'warning'
      });
      return;
    }
    
    setActionLoading(summary.userId);
    try {
      await apiFetch('/monitoring/admin/penalty', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: summary.sessionId,
          penaltyPct: penaltyValue
        })
      });
      await fetchViolations();
      
      showToast({
        message: `📉 Penalty Applied Successfully`,
        subtitle: `${summary.userName} has been deducted ${penaltyValue}% as specified.`,
        type: 'success'
      });
    } catch (err: any) {
      setError(err.message);
      showToast({
        message: '❌ Failed to Apply Penalty',
        subtitle: err?.message || 'An error occurred',
        type: 'error'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveAllViolations = async (summary: StudentViolationSummary) => {
    if (!confirm(`Resolve all ${summary.unresolvedViolations} violations for ${summary.userName}?\n\nThis will mark violations as resolved but will NOT invalidate the exam or apply any penalty. Use this for minor violations that don't require disciplinary action.`)) return;
    
    setActionLoading(summary.userId);
    try {
      // Resolve all unresolved violations for this student
      const unresolvedViolations = summary.violations.filter(v => !v.resolved);
      for (const violation of unresolvedViolations) {
        const violationId = violation.id || violation._id || `${violation.userId}-${violation.timestamp}`;
        await apiFetch('/monitoring/resolve-alert', {
          method: 'POST',
          body: JSON.stringify({ alertId: violationId })
        });
      }
      await fetchViolations();
      
      showToast({
        message: '✅ Violations Resolved',
        subtitle: `${summary.unresolvedViolations} violations for ${summary.userName} have been resolved. The exam session remains active.`,
        type: 'success'
      });
    } catch (err: any) {
      setError(err.message);
      showToast({
        message: '❌ Failed to Resolve Violations',
        subtitle: err?.message || 'An error occurred',
        type: 'error'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAllViolations = async (summary: StudentViolationSummary) => {
    if (!confirm(`DELETE all ${summary.totalViolations} violations for ${summary.userName}? This action cannot be undone!`)) return;
    
    setActionLoading(summary.userId);
    try {
      // Delete all violations for this student
      for (const violation of summary.violations) {
        const violationId = violation.id || violation._id || `${violation.userId}-${violation.timestamp}`;
        await apiFetch(`/monitoring/violations/${violationId}`, {
          method: 'DELETE'
        });
      }
      await fetchViolations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkAction = async (action: 'resolve' | 'invalidate' | 'penalty' | 'delete') => {
    if (selectedStudents.length === 0) return;
    
    const confirmMessage = {
      resolve: `Resolve all violations for ${selectedStudents.length} students?`,
      invalidate: `Invalidate ${selectedStudents.length} student sessions? This will disqualify students.`,
      penalty: `Apply penalty to ${selectedStudents.length} students?`,
      delete: `DELETE all violations for ${selectedStudents.length} students? This action cannot be undone!`
    };
    
    if (!confirm(confirmMessage[action])) return;
    
    setActionLoading('bulk');
    try {
      for (const userId of selectedStudents) {
        const summary = studentSummaries.find(s => s.userId === userId);
        if (!summary) continue;

        switch (action) {
          case 'resolve':
            await handleResolveAllViolations(summary);
            break;
          case 'invalidate':
            await handleInvalidateStudent(summary, 'Bulk admin action');
            break;
          case 'penalty':
            await handleImposePenalty(summary);
            break;
          case 'delete':
            await handleDeleteAllViolations(summary);
            break;
        }
      }
      setSelectedStudents([]);
      await fetchViolations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  // Filter and sort student summaries
  const filteredStudentSummaries = studentSummaries
    .filter(summary => {
      const matchesFilter = filter === 'all' || 
        (filter === 'unresolved' && summary.unresolvedViolations > 0) ||
        (filter === 'resolved' && summary.unresolvedViolations === 0) ||
        (filter === 'auto-flagged' && summary.autoFlagged);
      
      const matchesRisk = riskFilter === 'all' || summary.riskLevel === riskFilter;
      
      return matchesFilter && matchesRisk;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'violations':
          return b.unresolvedViolations - a.unresolvedViolations;
        case 'time':
          return new Date(b.lastViolationTime).getTime() - new Date(a.lastViolationTime).getTime();
        case 'risk':
          const riskOrder = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
          return riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
        default:
          return 0;
      }
    });

  // Handle select all functionality
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedStudents(filteredStudentSummaries.map(summary => summary.userId));
    } else {
      setSelectedStudents([]);
    }
  };

  // Handle individual checkbox change with Shift+Click support
  const handleIndividualSelect = (userId: string, checked: boolean, event: React.MouseEvent, currentIndex: number) => {
    console.log('Shift+Click debug:', {
      shiftKey: event.shiftKey,
      lastSelectedIndex,
      currentIndex,
      userId,
      checked
    });

    if (event.shiftKey && lastSelectedIndex !== null) {
      // Shift+Click: Select range from last selected to current
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      console.log('Range selection:', { start, end });
      
      const rangeIds = filteredStudentSummaries.slice(start, end + 1).map(summary => summary.userId);
      
      console.log('Range IDs:', rangeIds);
      
      if (checked) {
        // Add all items in range
        setSelectedStudents(prev => {
          const newSelection = [...prev];
          rangeIds.forEach(id => {
            if (!newSelection.includes(id)) {
              newSelection.push(id);
            }
          });
          console.log('New selection after range add:', newSelection);
          return newSelection;
        });
      } else {
        // Remove all items in range
        setSelectedStudents(prev => {
          const newSelection = prev.filter(id => !rangeIds.includes(id));
          console.log('New selection after range remove:', newSelection);
          return newSelection;
        });
      }
    } else {
      // Normal click: Toggle single item
      console.log('Normal click - toggling single item');
      if (checked) {
        setSelectedStudents(prev => [...prev, userId]);
      } else {
        setSelectedStudents(prev => prev.filter(id => id !== userId));
      }
    }
    
    // Update last selected index
    setLastSelectedIndex(currentIndex);
  };

  // Update select all state when individual selections change
  useEffect(() => {
    if (filteredStudentSummaries.length === 0) {
      setSelectAll(false);
      return;
    }
    
    const allSelected = filteredStudentSummaries.every(summary => 
      selectedStudents.includes(summary.userId)
    );
    setSelectAll(allSelected);
  }, [selectedStudents, filteredStudentSummaries]);

  // Check if some (but not all) students are selected
  const someSelected = selectedStudents.length > 0 && selectedStudents.length < filteredStudentSummaries.length;

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'Critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'Low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityColor = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-50 border-red-200 text-red-800';
      case 'warn': return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'info': return 'bg-blue-50 border-blue-200 text-blue-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const formatTimestamp = (timestamp: string | undefined) => {
    if (!timestamp) return 'Unknown time';
    try {
      // Handle numeric timestamp strings
      const date = isNaN(Number(timestamp)) 
        ? new Date(timestamp) 
        : new Date(Number(timestamp));
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      
      return date.toLocaleString();
    } catch {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading student violations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Violation Management</h1>
          <p className="text-gray-600">Monitor and manage student violations grouped by risk level</p>
        </div>
        <button
          onClick={fetchViolations}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center"
        >
          <Icon path="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          <div className="flex">
            <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-5 h-5 text-red-400 mr-2" />
            <p className="text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Filters and Controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="all">All Students</option>
              <option value="unresolved">Unresolved Only</option>
              <option value="resolved">Resolved Only</option>
              <option value="auto-flagged">Auto-Flagged</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as any)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="all">All Risk Levels</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="violations">Most Violations</option>
              <option value="time">Most Recent</option>
              <option value="risk">Highest Risk</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSelectedStudents([]);
                setSelectAll(false);
                setLastSelectedIndex(null);
                setClearKey(prev => prev + 1);
              }}
              className="w-full bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
            >
              Clear Selection
            </button>
          </div>
        </div>
        
        {/* Bulk Actions */}
        {selectedStudents.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleBulkAction('resolve');
                }}
                disabled={actionLoading === 'bulk'}
                className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
              >
                Resolve All ({selectedStudents.length})
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleBulkAction('invalidate');
                }}
                disabled={actionLoading === 'bulk'}
                className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50"
              >
                Invalidate All
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleBulkAction('penalty');
                }}
                disabled={actionLoading === 'bulk'}
                className="bg-yellow-600 text-white px-3 py-2 rounded text-sm hover:bg-yellow-700 disabled:opacity-50"
              >
                Apply Penalty All
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleBulkAction('delete');
                }}
                disabled={actionLoading === 'bulk'}
                className="bg-red-800 text-white px-3 py-2 rounded text-sm hover:bg-red-900 disabled:opacity-50"
              >
                🗑️ Delete All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Student Violations List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Student Violations ({filteredStudentSummaries.length})
            </h2>
            {filteredStudentSummaries.length > 0 && (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    ref={(input) => {
                      if (input) input.indeterminate = someSelected;
                    }}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectAll(e.target.checked);
                    }}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Select All
                  </label>
                </div>
                <div className="text-xs text-gray-500">
                  💡 Tip: Hold Shift and click to select multiple students
                </div>
              </div>
            )}
          </div>
        </div>
        
        {filteredStudentSummaries.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 text-4xl mb-2">✅</div>
            <p className="text-gray-500">No student violations found</p>
            <p className="text-sm text-gray-400 mt-1">All violations are resolved or no violations detected</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredStudentSummaries.map((summary, index) => {
              const isSelected = selectedStudents.includes(summary.userId);
              const isExpanded = expandedStudents.has(summary.userId);
              
              return (
                <div key={summary.userId} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div 
                        className="flex items-center space-x-3 mb-2 cursor-pointer"
                        onClick={(e) => {
                          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName !== 'INPUT') {
                            e.stopPropagation();
                            const newChecked = !isSelected;
                            handleIndividualSelect(summary.userId, newChecked, e, index);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          key={`checkbox-${summary.userId}-${clearKey}`}
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleIndividualSelect(summary.userId, e.target.checked, e, index);
                          }}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getRiskLevelColor(summary.riskLevel)}`}>
                          {summary.riskLevel}
                        </span>
                        {summary.autoFlagged && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
                            🚨 AUTO-FLAGGED
                          </span>
                        )}
                        <span className="text-sm text-gray-500">
                          {formatTimestamp(summary.lastViolationTime)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="font-medium text-gray-900 text-lg">{summary.userName}</h3>
                          <p className="text-sm text-gray-600">{summary.examTitle}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">{summary.unresolvedViolations}</div>
                          <div className="text-xs text-gray-500">unresolved</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                        <span>Total: {summary.totalViolations}</span>
                        <span>Resolved: {summary.resolvedViolations}</span>
                        <span>Types: {summary.violationTypes.join(', ')}</span>
                      </div>
                      
                      {/* Expandable violation details */}
                      <button
                        onClick={() => {
                          setExpandedStudents(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(summary.userId)) {
                              newSet.delete(summary.userId);
                            } else {
                              newSet.add(summary.userId);
                            }
                            return newSet;
                          });
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        {isExpanded ? '▼ Hide Details' : '▶ Show Details'} ({summary.violations.length} violations)
                      </button>
                      
                      {isExpanded && (
                        <div className="mt-3 pl-4 border-l-2 border-gray-200 space-y-2">
                          {summary.violations.map((violation, vIndex) => {
                            const violationId = violation.id || violation._id || `${violation.userId}-${violation.timestamp}`;
                            return (
                              <div key={violationId} className="bg-gray-50 p-2 rounded text-xs">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className={`px-1 py-0.5 rounded text-xs ${getSeverityColor(violation.level || 'info')}`}>
                                      {violation.level?.toUpperCase()}
                                    </span>
                                    <span className="ml-2 text-gray-600">{violation.message}</span>
                                    {violation.resolved && (
                                      <span className="ml-2 px-1 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                                        Resolved
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-gray-400">{formatTimestamp(violation.timestamp)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col space-y-2 ml-4">
                      <div className="flex space-x-1">
                        {/* Resolve All: Only show if there are unresolved violations and sessionId is valid
                            Use this when you want to clear violations WITHOUT invalidating or penalizing */}
                        {summary.sessionId !== 'unknown' && summary.unresolvedViolations > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleResolveAllViolations(summary);
                            }}
                            disabled={actionLoading === summary.userId}
                            className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                            title="Resolve violations without invalidating or penalizing (for minor violations)"
                          >
                            Resolve All
                          </button>
                        )}
                        {/* Invalidate: Automatically resolves all violations AND disqualifies the exam */}
                        {summary.sessionId !== 'unknown' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleInvalidateStudent(summary, 'Admin action');
                            }}
                            disabled={actionLoading === summary.userId}
                            className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                            title="Invalidate session (automatically resolves all violations and disqualifies the exam)"
                          >
                            Invalidate
                          </button>
                        )}
                        {summary.sessionId === 'unknown' && (
                          <span className="px-2 py-1 bg-gray-400 text-white rounded text-xs">
                            No Active Session
                          </span>
                        )}
                      </div>
                      <div className="flex space-x-1">
                        {/* Only show Penalty if sessionId is valid */}
                        {summary.sessionId !== 'unknown' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleImposePenalty(summary);
                            }}
                            disabled={actionLoading === summary.userId}
                            className="px-2 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700 disabled:opacity-50"
                          >
                            Penalty
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteAllViolations(summary);
                          }}
                          disabled={actionLoading === summary.userId}
                          className="px-2 py-1 bg-red-800 text-white rounded text-xs hover:bg-red-900 disabled:opacity-50"
                        >
                          🗑️ Delete All
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
