import React, { useState } from 'react';
import { FeedbackType, FeedbackPriority } from '../types';
import feedbackService from '../services/feedbackService';
import { Modal } from './Modal';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    type: 'general_feedback' as FeedbackType,
    priority: 'medium' as FeedbackPriority,
    title: '',
    description: '',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const submitData = {
        ...formData,
        browserInfo: feedbackService.getBrowserInfo(),
        screenResolution: feedbackService.getScreenResolution()
      };

      await feedbackService.createFeedback(submitData);
      
      // Reset form
      setFormData({
        type: 'general_feedback',
        priority: 'medium',
        title: '',
        description: '',
        stepsToReproduce: '',
        expectedBehavior: '',
        actualBehavior: ''
      });
      
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const priorityOptions = [
    { value: 'low', label: '😌 Not urgent', color: 'gray' },
    { value: 'medium', label: '😐 Somewhat urgent', color: 'blue' },
    { value: 'high', label: '😟 Quite urgent', color: 'orange' },
    { value: 'critical', label: '🚨 Very urgent', color: 'red' }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send us your feedback">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Simplified Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            What would you like to tell us about?
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'general_feedback' }))}
              className={`p-3 text-sm rounded-lg border-2 transition-colors ${
                formData.type === 'general_feedback'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              💬 General Feedback
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'bug' }))}
              className={`p-3 text-sm rounded-lg border-2 transition-colors ${
                formData.type === 'bug'
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              🐛 Report a Problem
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'feature_request' }))}
              className={`p-3 text-sm rounded-lg border-2 transition-colors ${
                formData.type === 'feature_request'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              ✨ Suggest a Feature
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: 'technical_issue' }))}
              className={`p-3 text-sm rounded-lg border-2 transition-colors ${
                formData.type === 'technical_issue'
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              ⚙️ Technical Issue
            </button>
          </div>
        </div>

        {/* Simple Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Quick summary *
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            maxLength={200}
            placeholder="Tell us briefly what this is about..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Main Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tell us more *
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
            maxLength={2000}
            rows={5}
            placeholder={
              formData.type === 'bug' 
                ? "Describe what happened and what you expected to happen..."
                : formData.type === 'feature_request'
                ? "Describe the feature you'd like to see..."
                : "Share your thoughts, suggestions, or concerns..."
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Optional: Simple steps for bugs only */}
        {formData.type === 'bug' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              How can we reproduce this? (optional)
            </label>
            <textarea
              name="stepsToReproduce"
              value={formData.stepsToReproduce}
              onChange={handleChange}
              maxLength={1000}
              rows={3}
              placeholder="1. I was doing...&#10;2. Then I clicked...&#10;3. And this happened..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Priority - simplified and hidden for general feedback */}
        {formData.type !== 'general_feedback' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              How urgent is this?
            </label>
            <div className="flex space-x-2">
              {priorityOptions.map(({ value, label, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, priority: value as FeedbackPriority }))}
                  className={`flex-1 p-2 text-xs rounded border-2 transition-colors ${
                    formData.priority === value
                      ? `border-${color}-500 bg-${color}-50 text-${color}-700`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default FeedbackModal;