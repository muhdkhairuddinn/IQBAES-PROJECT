import React, { useState, useCallback } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';
import { Question, QuestionType } from '../types';
import { generateBulkQuestionsWithAI } from '../services/geminiService';

interface BulkGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (questions: Partial<Question>[]) => void;
  initialTopic?: string;
}

export const BulkGenerateModal: React.FC<BulkGenerateModalProps> = ({ isOpen, onClose, onSave, initialTopic = '' }) => {
  const [topic, setTopic] = useState(initialTopic);
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [types, setTypes] = useState<QuestionType[]>([QuestionType.MultipleChoice, QuestionType.TrueFalse]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = (type: QuestionType) => {
    setTypes(prev => {
      if (prev.includes(type)) {
        return prev.length > 1 ? prev.filter(t => t !== type) : prev;
      }
      return [...prev, type];
    });
  };

  const handleGenerate = useCallback(async () => {
    if (!topic || count <= 0) {
      setError("Please provide a topic and a valid number of questions.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const generatedQuestions = await generateBulkQuestionsWithAI(topic, count, difficulty, types);
      onSave(generatedQuestions);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [topic, count, difficulty, types, onSave, onClose]);
  
  React.useEffect(() => {
    if (isOpen) {
        setTopic(initialTopic);
        setCount(5);
        setDifficulty('medium');
        setTypes([QuestionType.MultipleChoice, QuestionType.TrueFalse]);
        setIsLoading(false);
        setError(null);
    }
  }, [isOpen, initialTopic]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🚀 AI Bulk Question Generator" zIndex={60}>
      <div className="space-y-6">
        {/* Header Info */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200">
          <div className="flex items-center space-x-2 mb-2">
            <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-semibold text-slate-700">Generate Multiple Questions Instantly</h3>
          </div>
          <p className="text-xs text-slate-600">Create up to 10 questions at once with AI. Specify your topic and preferences below.</p>
        </div>

        {/* Topic Input */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">📚 Topic/Subject</label>
          <input 
            type="text" 
            value={topic} 
            onChange={e => setTopic(e.target.value)} 
            placeholder="e.g., Database Normalization, Python Loops, Calculus Derivatives" 
            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">💡 Be specific for better results</p>
        </div>

        {/* Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">🔢 Number of Questions</label>
            <div className="relative">
              <input 
                type="number" 
                value={count} 
                onChange={e => setCount(parseInt(e.target.value) || 1)} 
                min="1" 
                max="10" 
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
              <span className="absolute right-3 top-3 text-xs text-slate-400">Max: 10</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">⚡ Difficulty Level</label>
            <select 
              value={difficulty} 
              onChange={e => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')} 
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            >
              <option value="easy">🟢 Easy - Basic concepts</option>
              <option value="medium">🟡 Medium - Intermediate level</option>
              <option value="hard">🔴 Hard - Advanced concepts</option>
            </select>
          </div>
        </div>
        {/* Question Types */}
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">🎯 Question Types</label>
            <div className="grid grid-cols-1 gap-3">
                {([QuestionType.MultipleChoice, QuestionType.TrueFalse, QuestionType.ShortAnswer]).map(type => {
                    const icons = {
                        [QuestionType.MultipleChoice]: '🔘',
                        [QuestionType.TrueFalse]: '✅',
                        [QuestionType.ShortAnswer]: '📝'
                    };
                    const descriptions = {
                        [QuestionType.MultipleChoice]: 'Questions with 4 answer options',
                        [QuestionType.TrueFalse]: 'Simple true or false questions',
                        [QuestionType.ShortAnswer]: 'Open-ended text responses'
                    };
                    const displayNames = {
                        [QuestionType.MultipleChoice]: 'Multiple Choice',
                        [QuestionType.TrueFalse]: 'True/False',
                        [QuestionType.ShortAnswer]: 'Short Answer'
                    };
                    return (
                        <label key={type} className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                            types.includes(type) 
                                ? 'border-purple-500 bg-purple-50' 
                                : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}>
                            <input 
                                type="checkbox" 
                                checked={types.includes(type)} 
                                onChange={() => handleTypeChange(type)} 
                                className="mr-3 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                            />
                            <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                    <span className="text-lg">{icons[type]}</span>
                                    <span className="font-medium text-slate-700">{displayNames[type]}</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{descriptions[type]}</p>
                            </div>
                        </label>
                    );
                })}
            </div>
            {types.length === 0 && (
                <p className="text-xs text-amber-600 mt-2 p-2 bg-amber-50 rounded border border-amber-200">
                    ⚠️ Please select at least one question type
                </p>
            )}
        </div>

        {/* Error Display */}
        {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-5 h-5 text-red-500" />
                <p className="text-sm text-red-600">{error}</p>
            </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
        <button 
            onClick={onClose} 
            className="px-6 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium transition-colors duration-200"
        >
            Cancel
        </button>
        <button 
            onClick={handleGenerate} 
            disabled={isLoading || !topic.trim() || types.length === 0} 
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 flex items-center disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200"
        >
            {isLoading ? (
                <>
                    <LoadingSpinner size="h-4 w-4" color="border-white" />
                    <span className="ml-2">Generating {count} questions...</span>
                </>
            ) : (
                <>
                    <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-4 h-4 mr-2" />
                    Generate {count} Question{count > 1 ? 's' : ''}
                </>
            )}
        </button>
      </div>
    </Modal>
  );
};