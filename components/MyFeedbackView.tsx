import React, { useState, useEffect } from 'react';
import feedbackService from '../services/feedbackService';
import { Feedback } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { Pagination } from './Pagination';

const MyFeedbackView: React.FC = () => {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchMyFeedback();
  }, [currentPage]);

  const fetchMyFeedback = async () => {
    try {
      setLoading(true);
      const response = await feedbackService.getMyFeedback(currentPage, 10);
      setFeedback(response.feedback);
      setTotalPages(response.pagination.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch feedback');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await feedbackService.markAsRead(id);
      setFeedback(prev => prev.map(item => 
        item.id === id ? { ...item, hasUnreadResponse: false } : item
      ));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const deleteFeedback = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this feedback? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingItems(prev => new Set(prev).add(id));
      await feedbackService.deleteFeedback(id);
      setFeedback(prev => prev.filter(item => item.id !== id));
      setError(null);
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
        type: latest.type
      };
    }
    return null;
  };

  const canDelete = (item: Feedback) => {
    // Users can delete their own feedback if it's still open or has no admin response
    return item.status === 'open' || (!item.adminResponse && (!item.comments || item.comments.length === 0));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">My Feedback</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {feedback.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No feedback submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => {
            const isExpanded = expandedItems.has(item.id);
            const latestUpdate = getLatestUpdate(item);
            const hasUpdates = item.comments && item.comments.length > 0;
            const isDeleting = deletingItems.has(item.id);
            const isDeletable = canDelete(item);

            return (
              <div 
                key={item.id} 
                className={`bg-white border rounded-lg p-4 shadow-sm relative ${
                  item.hasUnreadResponse ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                } ${isDeleting ? 'opacity-50' : ''}`}
                onClick={() => item.hasUnreadResponse && markAsRead(item.id)}
              >
                {/* Unread indicator */}
                {item.hasUnreadResponse && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    NEW
                  </div>
                )}

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
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-gray-500">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                    {isDeletable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFeedback(item.id);
                        }}
                        disabled={isDeleting}
                        className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete feedback"
                      >
                        {isDeleting ? 'Deleting...' : '🗑️ Delete'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Latest Update Summary */}
                {latestUpdate && (
                  <div className="mb-3 p-2 bg-gray-50 rounded border-l-4 border-blue-400">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Latest Update:</span>
                      <span className="text-xs text-gray-500">
                        {new Date(latestUpdate.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{latestUpdate.message}</p>
                  </div>
                )}

                {/* Final Admin Response (if exists and resolved) */}
                {item.adminResponse && item.status === 'resolved' && (
                  <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded">
                    <span className="text-sm font-medium text-green-800">✓ Resolved:</span>
                    <p className="text-sm text-green-700 mt-1">{item.adminResponse}</p>
                  </div>
                )}

                {/* Expand/Collapse Button */}
                <div className="flex justify-between items-center">
                  <div className="flex gap-2 text-xs text-gray-500">
                    {hasUpdates && (
                      <span>{item.comments!.length} update{item.comments!.length > 1 ? 's' : ''}</span>
                    )}
                    {!isDeletable && (
                      <span className="text-orange-600">Cannot delete - has admin response</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(item.id);
                    }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    {isExpanded ? 'Show Less' : 'Show Details'}
                  </button>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="mb-4">
                      <h4 className="font-medium text-gray-900 mb-2">Description:</h4>
                      <p className="text-gray-700 text-sm">{item.description}</p>
                    </div>

                    {item.stepsToReproduce && (
                      <div className="mb-4">
                        <h4 className="font-medium text-gray-900 mb-2">Steps to Reproduce:</h4>
                        <p className="text-gray-700 text-sm whitespace-pre-line">{item.stepsToReproduce}</p>
                      </div>
                    )}

                    {/* All Updates */}
                    {hasUpdates && (
                      <div className="mb-4">
                        <h4 className="font-medium text-gray-900 mb-2">All Updates:</h4>
                        <div className="space-y-2">
                          {item.comments!.map((comment, index) => (
                            <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-medium text-gray-700">{comment.adminName}</span>
                                <span className="text-xs text-gray-500">
                                  {new Date(comment.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-gray-600">{comment.message}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Final Response (if different from latest update) */}
                    {item.adminResponse && item.status !== 'resolved' && (
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <h4 className="font-medium text-blue-900 mb-2">Final Admin Response:</h4>
                        <p className="text-blue-800 text-sm">{item.adminResponse}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      )}
    </div>
  );
};

export default MyFeedbackView;