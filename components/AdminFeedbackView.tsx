import React, { useState, useEffect } from 'react';
import { Feedback, FeedbackType, FeedbackPriority, FeedbackStatus } from '../types';
import feedbackService from '../services/feedbackService';
import { LoadingSpinner } from './LoadingSpinner';
import { Pagination } from './Pagination';

const AdminFeedbackView: React.FC = () => {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    status: '' as FeedbackStatus | '',
    type: '' as FeedbackType | '',
    priority: '' as FeedbackPriority | ''
  });
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [adminResponse, setAdminResponse] = useState('');
  const [newStatus, setNewStatus] = useState<FeedbackStatus>('open');
  const [newComment, setNewComment] = useState('');
  const [showCommentBox, setShowCommentBox] = useState<string | null>(null);
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFeedback();
  }, [currentPage, filters]);

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      const filterObj = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== '')
      );
      const response = await feedbackService.getAllFeedback(currentPage, 20, filterObj);
      setFeedback(response.feedback);
      setTotalPages(response.pagination.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feedback');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateFeedback = async (id: string) => {
    if (!id || id === 'undefined' || id === 'null' || typeof id !== 'string') {
      const errorMsg = `Invalid feedback ID. ID: ${id}, Type: ${typeof id}`;
      setError(errorMsg);
      console.error(errorMsg);
      return;
    }

    try {
      setError('');
      const result = await feedbackService.updateFeedback(id, {
        status: newStatus,
        adminResponse: adminResponse.trim() || undefined
      });
      
      setSelectedFeedback(null);
      setAdminResponse('');
      fetchFeedback();
    } catch (err) {
      console.error('Error updating feedback:', err);
      setError(err instanceof Error ? err.message : 'Failed to update feedback');
    }
  };

  const handleAddComment = async (feedbackId: string) => {
    if (!newComment.trim()) return;

    try {
      setError('');
      await feedbackService.addComment(feedbackId, newComment.trim(), 'progress_update');
      setNewComment('');
      setShowCommentBox(null);
      fetchFeedback();
    } catch (err) {
      console.error('Error adding comment:', err);
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this feedback? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingItems(prev => new Set(prev).add(id));
      await feedbackService.deleteFeedback(id);
      setFeedback(prev => prev.filter(item => item.id !== id));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete feedback');
    } finally {
      setDeletingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const openUpdateModal = (item: Feedback) => {
    const feedbackId = item.id || (item as any)._id;
    setSelectedFeedback(item);
    setNewStatus(item.status);
    setAdminResponse(item.adminResponse || '');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLatestUpdate = (item: Feedback) => {
    if (item.comments && item.comments.length > 0) {
      const latest = item.comments[item.comments.length - 1];
      return {
        message: latest.message,
        date: latest.createdAt,
        adminName: latest.adminName,
        type: latest.type
      };
    }
    return null;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Feedback Management</h2>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as FeedbackStatus | '' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value as FeedbackType | '' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="bug">Bug Report</option>
              <option value="feature_request">Feature Request</option>
              <option value="general_feedback">General Feedback</option>
              <option value="technical_issue">Technical Issue</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value as FeedbackPriority | '' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Feedback List */}
      <div className="space-y-4">
        {feedback.map((item) => {
          const itemKey = item.id || (item as any)._id;
          const isDeleting = deletingItems.has(itemKey);
          const isExpanded = expandedItems.has(itemKey);
          const latestUpdate = getLatestUpdate(item);
          const hasUpdates = item.comments && item.comments.length > 0;
          
          return (
            <div key={itemKey} className={`bg-white border border-gray-200 rounded-lg shadow-sm ${isDeleting ? 'opacity-50' : ''}`}>
              {/* Header Section */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                        {item.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(item.priority)}`}>
                        {item.priority.toUpperCase()}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {item.type.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      By: <span className="font-medium">{item.userName}</span> ({item.userRole}) • {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  
                  {/* Action Buttons - Compact */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openUpdateModal(item)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="Update Status & Response"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => setShowCommentBox(showCommentBox === item.id ? null : item.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                      title="Add Comment"
                    >
                      💬
                    </button>
                    <button
                      onClick={() => handleDeleteFeedback(itemKey)}
                      disabled={isDeleting}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                      title="Delete Feedback"
                    >
                      {isDeleting ? '⏳' : '🗑️'}
                    </button>
                  </div>
                </div>

                {/* Latest Update Summary */}
                {latestUpdate && (
                  <div className="mb-3 p-3 bg-gray-50 rounded-md border-l-4 border-blue-400">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-700">Latest Update by {latestUpdate.adminName}:</span>
                      <span className="text-xs text-gray-500">
                        {new Date(latestUpdate.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{latestUpdate.message}</p>
                  </div>
                )}

                {/* Final Response (if resolved) */}
                {item.adminResponse && item.status === 'resolved' && (
                  <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-md">
                    <span className="text-sm font-medium text-green-800">✅ Final Resolution:</span>
                    <p className="text-sm text-green-700 mt-1">{item.adminResponse}</p>
                  </div>
                )}

                {/* Expand/Collapse Button */}
                <div className="flex justify-between items-center">
                  <div className="flex gap-3 text-xs text-gray-500">
                    {hasUpdates && (
                      <span>{item.comments!.length} update{item.comments!.length > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <button
                    onClick={() => toggleExpanded(itemKey)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    {isExpanded ? 'Show Less' : 'Show Details'}
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="p-4 space-y-4">
                  {/* Description */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Description:</h4>
                    <p className="text-gray-700 text-sm">{item.description}</p>
                  </div>

                  {/* Steps to Reproduce */}
                  {item.stepsToReproduce && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Steps to Reproduce:</h4>
                      <p className="text-gray-700 text-sm whitespace-pre-line">{item.stepsToReproduce}</p>
                    </div>
                  )}

                  {/* All Admin Updates */}
                  {hasUpdates && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">All Admin Updates:</h4>
                      <div className="space-y-2">
                        {item.comments!.map((comment, index) => (
                          <div key={index} className="p-3 bg-gray-50 rounded-md text-sm">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-medium text-gray-700">{comment.adminName}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-gray-600">{comment.message}</p>
                            <span className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                              comment.type === 'admin_response' ? 'bg-blue-100 text-blue-800' :
                              comment.type === 'status_change' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {comment.type.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Comment Box */}
              {showCommentBox === item.id && (
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-2">Add Progress Update:</h4>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="e.g., We're working on this issue and will have an update soon..."
                  />
                  <div className="flex justify-end space-x-2 mt-2">
                    <button
                      onClick={() => setShowCommentBox(null)}
                      className="px-3 py-1 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const feedbackId = item.id || (item as any)._id;
                        if (feedbackId) {
                          handleAddComment(feedbackId);
                        }
                      }}
                      disabled={!newComment.trim()}
                      className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 text-sm"
                    >
                      Add Comment
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Update Modal */}
      {selectedFeedback && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Update Feedback</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as FeedbackStatus)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Response</label>
                <textarea
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your response to the user..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setSelectedFeedback(null)}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const feedbackId = selectedFeedback?.id || (selectedFeedback as any)?._id;
                  if (feedbackId) {
                    handleUpdateFeedback(feedbackId);
                  } else {
                    setError('No feedback selected or invalid feedback ID');
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFeedbackView;