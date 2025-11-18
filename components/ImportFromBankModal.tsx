import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { BankQuestion } from '../types';

interface ImportFromBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (questions: BankQuestion[]) => void;
  questionBank: BankQuestion[];
}

export const ImportFromBankModal: React.FC<ImportFromBankModalProps> = ({ isOpen, onClose, onSave, questionBank }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Reset selections and search when the question list changes (e.g., course changed)
  useEffect(() => {
    setSelectedIds([]);
    setSearchTerm('');
  }, [questionBank]);

  // Also clear when closing the modal
  useEffect(() => {
    if (!isOpen) {
      setSelectedIds([]);
      setSearchTerm('');
    }
  }, [isOpen]);

  const filteredQuestions = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return questionBank.filter(q => {
      const text = (q.question || q.text || '').toLowerCase();
      const topic = (q.topic || '').toLowerCase();
      return text.includes(term) || topic.includes(term);
    });
  }, [questionBank, searchTerm]);

  const handleToggle = (questionId: string) => {
    setSelectedIds(prev =>
      prev.includes(questionId)
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleSave = () => {
    const selectedQuestions = questionBank.filter(q => selectedIds.includes(q.id));
    onSave(selectedQuestions);
    setSelectedIds([]);
    setSearchTerm('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📚 Import Questions from Bank" zIndex={60}>
      <div className="space-y-6">
        {/* Header Info */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Icon path="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v3.776" className="w-5 h-5 text-green-600" />
              <h3 className="text-sm font-semibold text-slate-700">Select from Your Question Bank</h3>
            </div>
            <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-full">{selectedIds.length} selected</span>
          </div>
          <p className="text-xs text-slate-600">Choose existing questions from your question bank to add to this exam.</p>
        </div>

        {/* Search and Filters */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">🔍 Search Questions</label>
            <div className="relative">
              <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input 
                type="text" 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
                placeholder="Search by question text, topic, or type..." 
                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-slate-700">Available Questions ({filteredQuestions.length})</h4>
                {filteredQuestions.length > 0 && (
                    <button 
                        onClick={() => {
                            const allIds = filteredQuestions.map(q => q.id);
                            const allSelected = allIds.every(id => selectedIds.includes(id));
                            if (allSelected) {
                                setSelectedIds(selectedIds.filter(id => !allIds.includes(id)));
                            } else {
                                setSelectedIds([...new Set([...selectedIds, ...allIds])]);
                            }
                        }}
                        className="text-xs text-green-600 hover:text-green-700 font-medium"
                    >
                        {filteredQuestions.every(q => selectedIds.includes(q.id)) ? 'Deselect All' : 'Select All'}
                    </button>
                )}
            </div>
            
            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50">
                {filteredQuestions.length === 0 ? (
                    <div className="p-8 text-center">
                        <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                        <p className="text-slate-500 text-sm">No questions found matching your search.</p>
                        <p className="text-slate-400 text-xs mt-1">Try adjusting your search terms.</p>
                    </div>
                ) : (
                    <div className="space-y-2 p-3">
                        {filteredQuestions.map(question => {
                            const isSelected = selectedIds.includes(question.id);
                            const typeIcons: Record<string, string> = {
                                MCQ: '🔘',
                                TF: '✅',
                                SA: '📝',
                                Essay: '🖊️'
                            };
                            const difficultyColors: Record<string, string> = {
                                easy: 'text-green-600 bg-green-100',
                                medium: 'text-yellow-600 bg-yellow-100',
                                hard: 'text-red-600 bg-red-100'
                            };
                            
                            return (
                                <div 
                                    key={question.id} 
                                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                                        isSelected 
                                            ? 'bg-green-50 border-green-300 shadow-sm' 
                                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                    }`} 
                                    onClick={() => handleToggle(question.id)}
                                >
                                    <div className="flex items-start space-x-3">
                                        <input 
                                            type="checkbox" 
                                            checked={isSelected} 
                                            onChange={() => handleToggle(question.id)} 
                                            className="mt-1 w-4 h-4 text-green-600 rounded focus:ring-green-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900 mb-2 line-clamp-2">{question.question || question.text}</p>
                                            <div className="flex items-center space-x-3 text-xs">
                                                <span className="flex items-center space-x-1">
                                                    <span>{typeIcons[question.type] || '❓'}</span>
                                                    <span className="text-slate-600">{question.type}</span>
                                                </span>
                                                <span className={`px-2 py-1 rounded-full font-medium ${difficultyColors[question.difficulty] || 'text-slate-600 bg-slate-100'}`}>
                                                    {question.difficulty}
                                                </span>
                                                {question.topic && (
                                                    <span className="text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                                                        📚 {question.topic}
                                                    </span>
                                                )}
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
      </div>
      
      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4 border-t border-slate-200">
        <div className="text-sm text-slate-600">
            {selectedIds.length > 0 ? (
                <span className="flex items-center space-x-1">
                    <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 text-green-600" />
                    <span><strong>{selectedIds.length}</strong> question{selectedIds.length > 1 ? 's' : ''} selected</span>
                </span>
            ) : (
                <span className="text-slate-400">No questions selected</span>
            )}
        </div>
        <div className="flex space-x-3">
            <button 
                onClick={onClose} 
                className="px-6 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium transition-colors duration-200"
            >
                Cancel
            </button>
            <button 
                onClick={handleSave} 
                disabled={selectedIds.length === 0} 
                className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center"
            >
                <Icon path="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v3.776" className="w-4 h-4 mr-2" />
                Import {selectedIds.length} Question{selectedIds.length > 1 ? 's' : ''}
            </button>
        </div>
      </div>
    </Modal>
  );
};