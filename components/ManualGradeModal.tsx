import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from './Modal';
import { ExamSubmission, Result } from '../types';

interface ManualGradeModalProps {
  submission: ExamSubmission;
  studentName: string;
  onClose: () => void;
  onSave: (submissionId: string, updatedResults: Result[]) => void;
}

const QuestionResultCard: React.FC<{
    result: Result;
    index: number;
    onOverridePoints: (points: number) => void;
    onFeedbackChange: (feedback: string) => void;
}> = ({ result, index, onOverridePoints, onFeedbackChange }) => {
    const { question, userAnswer, pointsAwarded, gradingJustification, lecturerOverridePoints, lecturerFeedback } = result;

    const displayPoints = lecturerOverridePoints !== undefined ? lecturerOverridePoints : pointsAwarded;

    return (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex justify-between items-start">
                <p className="font-bold text-md text-slate-800 flex-1">Q{index + 1}: {question.question || question.text}</p>
                <span className={`font-bold text-lg ml-4 ${displayPoints >= question.points * 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                    {displayPoints}/{question.points} Points
                </span>
            </div>
            <div className="mt-3 text-sm space-y-2">
                <p><span className="font-semibold">Student's Answer:</span> {
                    question.type === 'MCQ' && question.options && typeof userAnswer.answer === 'number' 
                        ? question.options[userAnswer.answer] || `Option ${userAnswer.answer}` 
                        : question.type === 'TF' && typeof userAnswer.answer === 'number'
                        ? (userAnswer.answer === 1 ? 'True' : 'False')
                        : String(userAnswer.answer)
                }</p>
                <p><span className="font-semibold">Correct Answer:</span> {
                    question.type === 'MCQ' && question.options && question.correctAnswer !== undefined 
                        ? question.options[question.correctAnswer] 
                        : question.type === 'TF' && question.correctAnswer !== undefined
                        ? (question.correctAnswer === 1 ? 'True' : 'False')
                        : question.type === 'SA' && question.options && question.correctAnswer !== undefined
                        ? question.options[question.correctAnswer]
                        : question.type === 'Essay'
                        ? 'Manual grading required'
                        : 'N/A'
                }</p>
                {gradingJustification && (
                    <p className="text-xs italic bg-yellow-100 p-2 rounded-md"><span className="font-semibold">AI Rationale:</span> {gradingJustification}</p>
                )}
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor={`override-${question.id}`} className="block text-sm font-medium text-slate-700">Override Points</label>
                    <input
                        id={`override-${question.id}`}
                        type="number"
                        min="0"
                        max={question.points}
                        value={lecturerOverridePoints ?? ''}
                        onChange={(e) => onOverridePoints(parseInt(e.target.value))}
                        placeholder={`${pointsAwarded} (current)`}
                        className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"
                    />
                </div>
                <div>
                    <label htmlFor={`feedback-${question.id}`} className="block text-sm font-medium text-slate-700">Lecturer Feedback</label>
                    <textarea
                        id={`feedback-${question.id}`}
                        value={lecturerFeedback || ''}
                        onChange={(e) => onFeedbackChange(e.target.value)}
                        placeholder="Add specific feedback..."
                        rows={2}
                        className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm"
                    />
                </div>
            </div>
        </div>
    );
};


export const ManualGradeModal: React.FC<ManualGradeModalProps> = ({ submission, studentName, onClose, onSave }) => {
    const [updatedResults, setUpdatedResults] = useState<Result[]>([]);

    useEffect(() => {
        setUpdatedResults(submission.results);
    }, [submission]);
    
    const handleResultChange = (index: number, field: 'lecturerOverridePoints' | 'lecturerFeedback', value: number | string) => {
        const newResults = [...updatedResults];
        const resultToUpdate = { ...newResults[index] };
        
        if (field === 'lecturerOverridePoints' && typeof value === 'number') {
            resultToUpdate.lecturerOverridePoints = isNaN(value) ? undefined : Math.max(0, Math.min(resultToUpdate.question.points, value));
        } else if (field === 'lecturerFeedback' && typeof value === 'string') {
            resultToUpdate.lecturerFeedback = value;
        }

        newResults[index] = resultToUpdate;
        setUpdatedResults(newResults);
    };

    const handleSaveChanges = () => {
        onSave(submission.id, updatedResults);
    };

    const totalOverriddenPoints = useMemo(() => {
        return updatedResults.reduce((acc, res) => {
            const points = res.lecturerOverridePoints !== undefined ? res.lecturerOverridePoints : res.pointsAwarded;
            return acc + points;
        }, 0);
    }, [updatedResults]);

    return (
        <Modal isOpen={true} onClose={onClose} title={`Grading Submission for: ${studentName}`}>
             <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-4 -mr-4">
                <div className="sticky top-0 bg-white py-3 border-b mb-4 flex justify-between items-center z-10">
                    <h3 className="text-lg font-bold text-slate-800">Total Score</h3>
                    <p className="text-2xl font-bold text-indigo-600">
                        {totalOverriddenPoints} / {submission.totalPointsPossible}
                    </p>
                </div>
                {updatedResults.map((result, index) => (
                    <QuestionResultCard 
                        key={result.question.id}
                        result={result}
                        index={index}
                        onOverridePoints={(points) => handleResultChange(index, 'lecturerOverridePoints', points)}
                        onFeedbackChange={(feedback) => handleResultChange(index, 'lecturerFeedback', feedback)}
                    />
                ))}
            </div>
             <div className="flex justify-end pt-6 mt-4 border-t">
                <button onClick={onClose} className="text-slate-600 font-semibold py-2 px-4 rounded-lg mr-2">Cancel</button>
                <button onClick={handleSaveChanges} className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-indigo-700">Save Changes</button>
            </div>
        </Modal>
    );
};