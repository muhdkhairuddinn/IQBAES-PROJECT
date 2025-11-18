import React, { useState, useEffect, useCallback } from 'react';
import { antiCheatService, AntiCheatLog } from '../services/antiCheatService';
import { Icon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';

interface AntiCheatDashboardProps {
  examId?: string;
}

export const AntiCheatDashboard: React.FC<AntiCheatDashboardProps> = ({ examId }) => {
  const [violations, setViolations] = useState<AntiCheatLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<string>(examId || 'all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Load violations
  const loadViolations = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await antiCheatService.getViolationsForAdmin(
        selectedExam === 'all' ? undefined : selectedExam
      );
      setViolations(data);
    } catch (error) {
      console.error('Failed to load anti-cheat violations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedExam]);

  useEffect(() => {
    loadViolations();
  }, [loadViolations]);

  // Filter violations
  const filteredViolations = violations.filter(log => {
    const severityMatch = filterSeverity === 'all' || log.violation.severity === filterSeverity;
    const typeMatch = filterType === 'all' || log.violation.type === filterType;
    return severityMatch && typeMatch;
  });

  // Get statistics
  const stats = {
    total: filteredViolations.length,
    high: filteredViolations.filter(v => v.violation.severity === 'high').length,
    medium: filteredViolations.filter(v => v.violation.severity === 'medium').length,
    low: filteredViolations.filter(v => v.violation.severity === 'low').length,
    byType: filteredViolations.reduce((acc, log) => {
      acc[log.violation.type] = (acc[log.violation.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z';
      case 'medium': return 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z';
      case 'low': return 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l3.5-1.75a.75.75 0 000-1.342l-3.5-1.75a.75.75 0 00-1.063.853l.708 2.836z';
      default: return 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l3.5-1.75a.75.75 0 000-1.342l-3.5-1.75a.75.75 0 00-1.063.853l.708 2.836z';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'tab_switch': return 'M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z';
      case 'copy_attempt': return 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75';
      case 'paste_attempt': return 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z';
      case 'right_click': return 'M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59';
      case 'key_combination': return 'M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z';
      case 'window_blur': return 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z';
      default: return 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z';
    }
  };

  const formatType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
        <span className="ml-2">Loading anti-cheat data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Anti-Cheat Dashboard</h2>
          <p className="text-gray-600">Monitor and review exam security violations</p>
        </div>
        <button
          onClick={loadViolations}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
        >
          <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center">
            <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-8 h-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Violations</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center">
            <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-8 h-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">High Severity</p>
              <p className="text-2xl font-bold text-red-600">{stats.high}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center">
            <Icon path="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" className="w-8 h-8 text-yellow-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Medium Severity</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.medium}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center">
            <Icon path="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l3.5-1.75a.75.75 0 000-1.342l-3.5-1.75a.75.75 0 00-1.063.853l.708 2.836z" className="w-8 h-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Low Severity</p>
              <p className="text-2xl font-bold text-blue-600">{stats.low}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All Severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="all">All Types</option>
              <option value="tab_switch">Tab Switch</option>
              <option value="copy_attempt">Copy Attempt</option>
              <option value="paste_attempt">Paste Attempt</option>
              <option value="right_click">Right Click</option>
              <option value="key_combination">Key Combination</option>
              <option value="window_blur">Window Blur</option>
            </select>
          </div>
        </div>
      </div>

      {/* Violations List */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Violations</h3>
        </div>
        
        {filteredViolations.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <p>No violations found with current filters</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredViolations.map((log, index) => (
              <div key={`${log.examId}-${log.studentId}-${index}`} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className={`p-2 rounded-lg border ${getSeverityColor(log.violation.severity)}`}>
                      <Icon path={getTypeIcon(log.violation.type)} className="w-5 h-5" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{formatType(log.violation.type)}</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(log.violation.severity)}`}>
                          {log.violation.severity.toUpperCase()}
                        </span>
                      </div>
                      
                      <p className="text-gray-700 mb-2">{log.violation.message}</p>
                      
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>Student: {log.studentId}</span>
                        <span>Exam: {log.examId}</span>
                        <span>{new Date(log.violation.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <Icon path={getSeverityIcon(log.violation.severity)} className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AntiCheatDashboard;