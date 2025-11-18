
import React, { useState, useMemo } from 'react';
import { Icon } from './Icon';
import { BankQuestion, QuestionType } from '../types';
import { QuestionModal } from './QuestionModal';
import { Pagination } from './Pagination';
import { useToast } from './Toast';

const ITEMS_PER_PAGE = 10;



interface QuestionBankViewProps {
  courseId: string;
  questions: BankQuestion[];
  addQuestion: (question: Omit<BankQuestion, 'id'>) => void;
  updateQuestion: (question: BankQuestion) => void;
  deleteQuestion: (questionId: string) => void;
  courses?: { id: string; name: string }[];
  onNavigateTab?: (tab: string) => void;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  courseId,
  questions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  courses = [],
  onNavigateTab,
}) => {
  const { showToast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [questionToEdit, setQuestionToEdit] = useState<BankQuestion | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<QuestionType | 'all'>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<'easy' | 'medium' | 'hard' | 'all'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'difficulty' | 'points'>('newest');
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);

  const filteredAndSortedQuestions = useMemo(() => {
    let filtered = questions.filter(q => {
      const matchesSearch = q.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           q.topic?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || q.type === filterType;
      const matchesDifficulty = filterDifficulty === 'all' || q.difficulty === filterDifficulty;
      return matchesSearch && matchesType && matchesDifficulty;
    });

    // Sort questions
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return objectIdToDateMs(b.id) - objectIdToDateMs(a.id);
        case 'oldest':
          return objectIdToDateMs(a.id) - objectIdToDateMs(b.id);
        case 'difficulty':
          const difficultyOrder = { 'easy': 1, 'medium': 2, 'hard': 3 };
          return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
        case 'points':
          return b.points - a.points;
        default:
          return 0;
      }
    });

    return filtered;
  }, [questions, searchTerm, filterType, filterDifficulty, sortBy]);

  const paginatedQuestions = useMemo(() => 
    filteredAndSortedQuestions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE), 
    [filteredAndSortedQuestions, currentPage]
  );

  const handleOpenCreateModal = () => {
    setQuestionToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (question: BankQuestion) => {
    setQuestionToEdit(question);
    setIsModalOpen(true);
  };

  const handleDeleteQuestion = (questionId: string) => {
    if (window.confirm("Are you sure you want to delete this question from the bank? It will not be removed from existing exams.")) {
      deleteQuestion(questionId);
    }
  };

  const handleSelectQuestion = (questionId: string) => {
    setSelectedQuestions(prev => 
      prev.includes(questionId) 
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  const handleSelectAll = () => {
    if (selectedQuestions.length === paginatedQuestions.length) {
      setSelectedQuestions([]);
    } else {
      setSelectedQuestions(paginatedQuestions.map(q => q.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedQuestions.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedQuestions.length} selected questions?`)) {
      selectedQuestions.forEach(id => deleteQuestion(id));
      setSelectedQuestions([]);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setFilterDifficulty('all');
    setSortBy('newest');
    setCurrentPage(1);
  };
  
  const handleSaveQuestion = (data: Omit<BankQuestion, 'id'> | BankQuestion) => {
      try {
          if ('id' in data) {
              updateQuestion(data);
              showToast({
                  message: '✅ Question Updated Successfully!',
                  subtitle: 'Question has been updated in the bank',
                  type: 'success'
              });
          } else {
              if (!courseId) {
                  showToast({
                      message: '⚠️ Course Selection Required',
                      subtitle: 'Please select a course before adding a question',
                      type: 'warning'
                  });
                  return;
              }
              addQuestion({ ...data, courseId });
              showToast({
                  message: '✅ Question Added Successfully!',
                  subtitle: 'Question has been added to the bank',
                  type: 'success'
              });
          }
          setIsModalOpen(false);
          setQuestionToEdit(null);
      } catch (error: any) {
          showToast({
              message: '❌ Failed to Save Question',
              subtitle: error?.message || 'An error occurred',
              type: 'error'
          });
      }
  }

  return (
    <>
      <QuestionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveQuestion}
        questionToEdit={questionToEdit}
        courses={courses}
        defaultCourseId={courseId}
      />
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold text-slate-700">Question Bank</h3>
            <p className="text-sm text-slate-500 mt-1">
              {filteredAndSortedQuestions.length} of {questions.length} questions
              {selectedQuestions.length > 0 && ` • ${selectedQuestions.length} selected`}
            </p>
          </div>
          <div className="flex gap-2">
            {selectedQuestions.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 flex items-center text-sm"
              >
                <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4 mr-2" />
                Delete ({selectedQuestions.length})
              </button>
            )}
            <button
              onClick={handleOpenCreateModal}
              className="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 flex items-center text-sm"
            >
              <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5 mr-2" />
              Add Question
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-slate-50 p-4 rounded-lg mb-6 space-y-4">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search questions or topics..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as QuestionType | 'all')}
              className="px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
            >
              <option value="all">All Types</option>
              <option value={QuestionType.MultipleChoice}>Multiple Choice</option>
              <option value={QuestionType.TrueFalse}>True/False</option>
              <option value={QuestionType.ShortAnswer}>Short Answer</option>
            </select>

            {/* Difficulty Filter */}
            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value as 'easy' | 'medium' | 'hard' | 'all')}
              className="px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'difficulty' | 'points')}
              className="px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="difficulty">By Difficulty</option>
              <option value="points">By Points</option>
            </select>

            {/* Clear Filters */}
            {(searchTerm || filterType !== 'all' || filterDifficulty !== 'all' || sortBy !== 'newest') && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-slate-600 hover:text-slate-800 font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3">
                  <input
                    type="checkbox"
                    checked={paginatedQuestions.length > 0 && selectedQuestions.length === paginatedQuestions.length}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-slate-300 rounded"
                  />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Question</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Details</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Topic</th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {paginatedQuestions.map((q) => (
                <tr key={q.id} className={`hover:bg-slate-50 transition-colors ${
                  selectedQuestions.includes(q.id) ? 'bg-purple-50 border-purple-200' : ''
                }`}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedQuestions.includes(q.id)}
                      onChange={() => handleSelectQuestion(q.id)}
                      className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-slate-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-slate-900 max-w-md">
                      {q.text.length > 100 ? `${q.text.substring(0, 100)}...` : q.text}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col space-y-1">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        q.type === QuestionType.MultipleChoice ? 'bg-blue-100 text-blue-800' :
                        q.type === QuestionType.TrueFalse ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {q.type === QuestionType.MultipleChoice ? 'Multiple Choice' :
                         q.type === QuestionType.TrueFalse ? 'True/False' : 'Short Answer'}
                      </span>
                      <div className="flex items-center space-x-2 text-xs text-slate-500">
                        <span className={`px-1.5 py-0.5 rounded ${
                          q.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                          q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {q.difficulty}
                        </span>
                        <span className="font-medium">{q.points} pts</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium">
                      {q.topic || 'No topic'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button 
                        onClick={() => handleOpenEditModal(q)} 
                        className="text-slate-500 hover:text-slate-700 font-semibold px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDeleteQuestion(q.id)} 
                        className="text-red-600 hover:text-red-900 font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAndSortedQuestions.length === 0 && questions.length > 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-500">
                    <div className="flex flex-col items-center space-y-2">
                      <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="h-8 w-8 text-slate-300" />
                      <p>No questions match your current filters.</p>
                      <button onClick={clearFilters} className="text-purple-600 hover:text-purple-700 font-medium">
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {questions.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-500">
                    <div className="flex flex-col items-center space-y-2">
                      <Icon path="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" className="h-8 w-8 text-slate-300" />
                      <p>The question bank for this course is empty.</p>
                      <button onClick={handleOpenCreateModal} className="text-purple-600 hover:text-purple-700 font-medium">
                        Add your first question
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination 
          currentPage={currentPage} 
          totalPages={Math.ceil(filteredAndSortedQuestions.length / ITEMS_PER_PAGE)} 
          onPageChange={setCurrentPage} 
        />
      </div>
    </>
  );
};

// Helper to sort by Mongo ObjectId timestamp (first 4 bytes)
const objectIdToDateMs = (id: string) => {
  try {
    if (!id || id.length < 8) return 0;
    const tsHex = id.substring(0, 8);
    const seconds = parseInt(tsHex, 16);
    return seconds * 1000;
  } catch {
    return 0;
  }
};