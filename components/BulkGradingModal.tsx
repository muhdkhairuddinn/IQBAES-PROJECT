import React, { useState, useMemo, useEffect } from 'react';
import { ExamSubmission, Question, QuestionType } from '../types';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { useToast } from './Toast';

interface BulkGradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: ExamSubmission[];
  onBulkGrade: (submissionIds: string[], grades: { [questionId: string]: number }) => void;
}

export const BulkGradingModal: React.FC<BulkGradingModalProps> = ({
  isOpen,
  onClose,
  submissions,
  onBulkGrade
}) => {
  const { showToast } = useToast();
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [selectedAnswerGroup, setSelectedAnswerGroup] = useState<string>('');
  const [bulkGrade, setBulkGrade] = useState<number>(0);
  const [gradingMode, setGradingMode] = useState<'all' | 'similar'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Simple similarity calculation
  const calculateSimilarity = (str1: string, str2: string): number => {
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  };

  // Get all Essay questions from submissions
  const essayQuestions = useMemo(() => {
    const questions = new Map<string, Question>();
    const allQuestionTypes = new Set<string>();
    
    submissions.forEach(submission => {
      submission.results.forEach(result => {
        allQuestionTypes.add(result.question.type);
        // REMOVE: console.log('Question details:', {
        //   id: result.question.id,
        //   type: result.question.type,
        //   typeOf: typeof result.question.type,
        //   question: (result.question.question || result.question.text)?.substring(0, 50)
        // });
        // Include only Essay questions for bulk grading - check for both string and enum values
        if ((result.question.type === 'Essay' || result.question.type === QuestionType.Essay) && !questions.has(result.question.id)) {
          questions.set(result.question.id, result.question);
        }
      });
    });
    
    // REMOVE: console.log('Available question types in submissions:', Array.from(allQuestionTypes));
    // REMOVE: console.log('Essay questions found:', questions.size);
    // REMOVE: console.log('All questions in submissions:', submissions.flatMap(s => s.results.map(r => ({
    //   id: r.question.id,
    //   type: r.question.type,
    //   text: (r.question.question || r.question.text)?.substring(0, 30)
    // }))));
    
    return Array.from(questions.values());
  }, [submissions]);

  // Group similar answers for the selected question
  const groupedAnswers = useMemo(() => {
    if (!selectedQuestion) return [];

    const answerGroups = new Map<string, GroupedAnswer>();

    submissions.forEach(submission => {
      const result = submission.results.find(r => r.question.id === selectedQuestion.id);
      if (result && result.question.type === 'Essay') {
        const answer = result.userAnswer?.answer?.toString()?.toLowerCase().trim() || '';
        
        // Simple similarity grouping
        let groupKey = answer;
        for (const [existingAnswer] of answerGroups) {
          if (calculateSimilarity(answer, existingAnswer) > 0.6) {
            groupKey = existingAnswer;
            break;
          }
        }

        if (!answerGroups.has(groupKey)) {
          answerGroups.set(groupKey, {
            answer: result.userAnswer?.answer?.toString() || '',
            submissionIds: [],
            studentNames: []
          });
        }

        const group = answerGroups.get(groupKey)!;
        group.submissionIds.push(submission.id);
        group.studentNames.push(`Student ${submission.userId}`);
      }
    });

    return Array.from(answerGroups.values()).sort((a, b) => b.submissionIds.length - a.submissionIds.length);
  }, [selectedQuestion, submissions]);

  // Auto-select the first group if there's only one group
  useEffect(() => {
    // REMOVE: console.log('useEffect triggered:', {
    //   gradingMode,
    //   groupedAnswersLength: groupedAnswers.length,
    //   selectedAnswerGroup,
    //   firstGroupAnswer: groupedAnswers[0]?.answer
    // });
    
    if (gradingMode === 'similar' && groupedAnswers.length === 1 && !selectedAnswerGroup) {
      // REMOVE: console.log('Auto-selecting single group:', groupedAnswers[0].answer);
      setSelectedAnswerGroup(groupedAnswers[0].answer);
    }
  }, [gradingMode, groupedAnswers.length, selectedAnswerGroup]);

  const handleBulkGrade = async () => {
    if (!selectedQuestion) return;
    
    // For similar mode, if there's only 1 group and no selection, use that group
    if (gradingMode === 'similar' && !selectedAnswerGroup && groupedAnswers.length === 1) {
      setSelectedAnswerGroup(groupedAnswers[0].answer);
    }
    
    // If multiple groups but no selection, return early
    if (gradingMode === 'similar' && !selectedAnswerGroup && groupedAnswers.length > 1) return;

    setIsLoading(true);
    try {
        let submissionIds = [];
        
        if (gradingMode === 'all') {
            submissionIds = submissions.map(s => s.id);
        } else if (gradingMode === 'similar') {
            // Use selectedAnswerGroup if available, otherwise use the first (and only) group
            const targetAnswer = selectedAnswerGroup || (groupedAnswers.length === 1 ? groupedAnswers[0].answer : '');
            const selectedGroup = groupedAnswers.find(group => group.answer === targetAnswer);
            if (selectedGroup) {
                submissionIds = selectedGroup.submissionIds;
            }
        }

        // REMOVE: console.log('Submitting bulk grade:', {
        //     submissionIds,
        //     questionId: selectedQuestion.id,
        //     grade: bulkGrade,
        //     count: submissionIds.length,
        //     selectedAnswerGroup: selectedAnswerGroup || (groupedAnswers.length === 1 ? groupedAnswers[0].answer : ''),
        //     gradingMode
        // });

        const grades = { [selectedQuestion.id]: bulkGrade };
        
        const result = await onBulkGrade(submissionIds, grades);
        
        if (result && result.updatedSubmissions) {
            showToast({
                message: '✅ Grading Successfully!',
                subtitle: `Successfully graded ${result.updatedSubmissions.length} submission${result.updatedSubmissions.length > 1 ? 's' : ''} with ${bulkGrade} points`,
                type: 'success',
                duration: 4000
            });
        } else {
            showToast({
                message: '✅ Grading Successfully!',
                subtitle: 'Bulk grading completed successfully',
                type: 'success',
                duration: 4000
            });
        }
        
        onClose();
    } catch (error) {
        console.error('Bulk grading failed:', error);
        showToast({
            message: '❌ Grading Failed',
            subtitle: 'Failed to apply bulk grade. Please try again.',
            type: 'error',
            duration: 5000
        });
    } finally {
        setIsLoading(false);
    }
  };

  const getSubmissionCount = () => {
    if (gradingMode === 'all') return submissions.length;
    if (gradingMode === 'similar') {
      if (selectedAnswerGroup && selectedQuestion) {
        // Find the group that contains the selected answer and return its count
        const selectedGroup = groupedAnswers.find(group => group.answer === selectedAnswerGroup);
        return selectedGroup ? selectedGroup.submissionIds.length : 0;
      } else if (groupedAnswers.length === 1 && selectedQuestion) {
        // If there's only one group, use that group's count
        return groupedAnswers[0].submissionIds.length;
      }
    }
    return 0;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📝 Quick Bulk Grading">
      <div className="space-y-6 max-h-[70vh] overflow-y-auto p-2 -mr-2 pr-4">
        {/* Step 1: Question Selection */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-3 flex items-center">
            <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">1</span>
            Choose Question to Grade
          </h3>
          
          {essayQuestions.length === 0 ? (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded-lg">
              <div className="flex items-center">
                <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="w-5 h-5 mr-2" />
                <div>
                  <p className="font-medium">No gradeable questions found</p>
                  <p className="text-sm">Only Essay questions can be bulk graded. Make sure your exam contains Essay questions.</p>
                </div>
              </div>
            </div>
          ) : (
            <select
              value={selectedQuestion?.id || ''}
              onChange={(e) => {
                const question = essayQuestions.find(q => q.id === e.target.value);
                setSelectedQuestion(question || null);
                setSelectedAnswerGroup('');
                setBulkGrade(0);
              }}
              className="w-full p-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Select a question...</option>
              {essayQuestions.map(question => (
                <option key={question.id} value={question.id}>
                  {(question.question || question.text).length > 50 ? `${(question.question || question.text).substring(0, 50)}...` : (question.question || question.text)} 
                  ({question.points} points) - Essay
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedQuestion && (
          <>
            {/* Step 2: Choose Grading Method */}
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-3 flex items-center">
                <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">2</span>
                How do you want to grade?
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setGradingMode('all');
                    setSelectedAnswerGroup('');
                  }}
                  className={`p-4 text-left border-2 rounded-lg transition-all ${
                    gradingMode === 'all'
                      ? 'border-green-500 bg-green-100 text-green-800'
                      : 'border-gray-300 hover:border-gray-400 bg-white'
                  }`}
                >
                  <div className="font-medium">🎯 Grade All Students</div>
                  <div className="text-sm text-gray-600 mt-1">Give the same score to everyone</div>
                  <div className="text-xs text-green-600 mt-2 font-medium">
                    {submissions.length} students
                  </div>
                </button>

                <button
                  onClick={() => setGradingMode('similar')}
                  className={`p-4 text-left border-2 rounded-lg transition-all ${
                    gradingMode === 'similar'
                      ? 'border-green-500 bg-green-100 text-green-800'
                      : 'border-gray-300 hover:border-gray-400 bg-white'
                  }`}
                >
                  <div className="font-medium">📋 Grade Similar Answers</div>
                  <div className="text-sm text-gray-600 mt-1">Grade groups of similar responses</div>
                  <div className="text-xs text-green-600 mt-2 font-medium">
                    {groupedAnswers.length} groups found
                  </div>
                </button>
              </div>
            </div>

            {/* Step 3: Similar Answer Groups (if selected) */}
            {gradingMode === 'similar' && (
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-800 mb-3 flex items-center">
                  <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">3</span>
                  Select Answer Group ({groupedAnswers.length} groups)
                </h3>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {groupedAnswers.map((group, index) => (
                    <div
                      key={index}
                      className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedAnswerGroup === group.answer
                          ? 'border-purple-500 bg-purple-100'
                          : 'border-gray-300 hover:border-gray-400 bg-white'
                      }`}
                      onClick={() => setSelectedAnswerGroup(group.answer)}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-sm">
                          Group {index + 1} ({group.submissionIds.length} students)
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {group.answer.length > 100 ? `${group.answer.substring(0, 100)}...` : group.answer}
                      </p>
                    </div>
                  ))}
                </div>

                {selectedAnswerGroup && (
                  <div className="mt-2 text-xs text-purple-600">
                    Selected: {selectedAnswerGroup.substring(0, 50)}...
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Set Grade */}
            {(gradingMode === 'all' || (gradingMode === 'similar' && (selectedAnswerGroup || groupedAnswers.length === 1))) && (
              <div className="bg-orange-50 p-4 rounded-lg">
                <h3 className="font-semibold text-orange-800 mb-3 flex items-center">
                  <span className="bg-orange-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm mr-2">
                    {gradingMode === 'similar' ? '4' : '3'}
                  </span>
                  Set Grade (0 - {selectedQuestion.points} points)
                </h3>

                <div className="flex items-center space-x-4 mb-4">
                  <input
                    type="number"
                    min="0"
                    max={selectedQuestion.points}
                    value={bulkGrade}
                    onChange={(e) => setBulkGrade(Number(e.target.value))}
                    className="w-20 p-2 text-lg font-bold text-center border-2 border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <span className="text-orange-700 font-medium">/ {selectedQuestion.points} points</span>
                </div>

                {/* Quick grade buttons */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm text-gray-600 mr-2">Quick select:</span>
                  {[0, Math.ceil(selectedQuestion.points * 0.25), Math.ceil(selectedQuestion.points * 0.5), Math.ceil(selectedQuestion.points * 0.75), selectedQuestion.points].map(points => (
                    <button
                      key={points}
                      onClick={() => setBulkGrade(points)}
                      className={`px-3 py-1 text-sm rounded-lg border-2 transition-all ${
                        bulkGrade === points
                          ? 'border-orange-500 bg-orange-100 text-orange-800'
                          : 'border-gray-300 hover:border-gray-400 bg-white'
                      }`}
                    >
                      {points}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            {(gradingMode === 'all' || selectedAnswerGroup) && (
              <div className="bg-gray-100 p-4 rounded-lg border-l-4 border-indigo-500">
                <h4 className="font-semibold text-gray-800 mb-2">📋 Preview</h4>
                <p className="text-gray-700">
                  Will give <span className="font-bold text-indigo-600">{bulkGrade} points</span> to{' '}
                  <span className="font-bold text-indigo-600">{getSubmissionCount()} students</span>{' '}
                  for this question.
                </p>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-2 text-gray-600 hover:text-gray-800 font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              handleBulkGrade();
            }}
            disabled={!selectedQuestion || (gradingMode === 'similar' && !selectedAnswerGroup && groupedAnswers.length > 1) || isLoading}
            className="px-8 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Grading...
              </>
            ) : (
              <>
                <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 mr-2" />
                Apply Grade to {getSubmissionCount()} Students
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};