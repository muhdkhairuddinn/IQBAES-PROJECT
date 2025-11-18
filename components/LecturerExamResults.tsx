import React, { useMemo, useState } from 'react';
import { Exam, ExamSubmission, User, Question } from '../types';
import { Icon } from './Icon';

interface LecturerExamResultsProps {
  exam: Exam;
  submissions: ExamSubmission[];
  users: User[];
  onGradeSubmission: (submissionId: string) => void;
}

const QuestionAnalysisCard: React.FC<{ question: Question, submissions: ExamSubmission[] }> = ({ question, submissions }) => {
    // FIXED: Handle both id and _id fields for question matching
    const relevantResults = useMemo(() => 
        submissions.flatMap(s => s.results).filter(r => 
            r.question.id === question.id || r.question._id === question.id
        ), [question.id, submissions]);
    
    // Calculate average percentage based on actual points - FIXED: use question.points instead of r.question.points
    const averagePercentage = useMemo(() => {
        if (relevantResults.length === 0) return 0;
        const totalPercentage = relevantResults.reduce((acc, r) => {
            const finalPoints = r.lecturerOverridePoints !== undefined ? r.lecturerOverridePoints : r.pointsAwarded;
            const percentage = (finalPoints / question.points) * 100; // FIXED: use question.points from props
            return acc + percentage;
        }, 0);
        return totalPercentage / relevantResults.length;
    }, [relevantResults, question.points]); // FIXED: add question.points to dependency
    
    // Use lecturerOverridePoints when available for average calculation
    const averagePoints = useMemo(() => {
        if (relevantResults.length === 0) return 0;
        const totalPoints = relevantResults.reduce((acc, r) => {
            const finalPoints = r.lecturerOverridePoints !== undefined ? r.lecturerOverridePoints : r.pointsAwarded;
            return acc + finalPoints;
        }, 0);
        return totalPoints / relevantResults.length;
    }, [relevantResults]);

    const getRateColor = (rate: number) => {
        if (rate >= 75) return 'bg-green-500';
        if (rate >= 40) return 'bg-yellow-500';
        return 'bg-red-500';
    }

    return (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p className="font-semibold text-slate-800 truncate">{question.question || question.text}</p>
            <div className="mt-3 space-y-2">
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-slate-600">Average Score</span>
                        <span className="text-sm font-bold text-slate-800">{Math.round(averagePercentage)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5">
                        <div className={`${getRateColor(averagePercentage)} h-2.5 rounded-full`} style={{ width: `${averagePercentage}%` }}></div>
                    </div>
                </div>
                <div className="text-sm text-slate-600">
                    <span className="font-medium">Average Score:</span> {Math.round(averagePercentage)}% / 100%
                </div>
            </div>
        </div>
    );
};

export const LecturerExamResults: React.FC<LecturerExamResultsProps> = ({ exam, submissions, users, onGradeSubmission }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const examSubmissions = useMemo(() => {
    return submissions
        .filter(s => s.examId === exam.id)
        .sort((a, b) => {
            const scoreA = a.totalPointsPossible > 0 ? (a.totalPointsAwarded / a.totalPointsPossible) : 0;
            const scoreB = b.totalPointsPossible > 0 ? (b.totalPointsAwarded / b.totalPointsPossible) : 0;
            return scoreB - scoreA;
        });
  }, [submissions, exam]);

  const averageScore = useMemo(() => {
    if (examSubmissions.length === 0) return 'N/A';
    const totalPercentage = examSubmissions.reduce((acc, sub) => {
        const percentage = sub.totalPointsPossible > 0 ? (sub.totalPointsAwarded / sub.totalPointsPossible) * 100 : 0;
        return acc + percentage;
    }, 0);
    return `${Math.round(totalPercentage / examSubmissions.length)}%`;
  }, [examSubmissions]);

  const getUserName = (submission: any) => {
    // Handle populated userId object from backend
    if (typeof submission.userId === 'object' && submission.userId?.name) {
      return submission.userId.name;
    }
    // Fallback to users array lookup if userId is just an ID string
    return users.find(u => u.id === submission.userId)?.name || 'Unknown User';
  }

  // Filter submissions based on search term
  const filteredSubmissions = useMemo(() => {
    if (!searchTerm.trim()) {
      return examSubmissions;
    }
    
    const searchLower = searchTerm.toLowerCase().trim();
    return examSubmissions.filter(submission => {
      const studentName = getUserName(submission).toLowerCase();
      return studentName.includes(searchLower);
    });
  }, [examSubmissions, searchTerm, users]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <button onClick={() => window.location.hash = '#'} className="text-indigo-600 hover:text-indigo-800 flex items-center mb-4 font-semibold">
            <Icon path="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" className="w-5 h-5 mr-2"/>
            Back to Dashboard
        </button>
        <h1 className="text-4xl font-bold text-slate-800">Exam Results</h1>
        <p className="text-slate-500 mt-2 text-xl">{exam.title}</p>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-md text-center">
            <p className="text-slate-500 font-semibold">Average Score</p>
            <p className="text-4xl font-bold text-green-500 mt-2">{averageScore}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-md text-center">
            <p className="text-slate-500 font-semibold">Total Submissions</p>
            <p className="text-4xl font-bold text-blue-500 mt-2">{examSubmissions.length}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-md text-center">
            <p className="text-slate-500 font-semibold">Total Questions</p>
            <p className="text-4xl font-bold text-purple-500 mt-2">{exam.questionCount}</p>
          </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-md overflow-hidden mb-8">
        <div className="p-6 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="text-2xl font-bold text-slate-800">Student Submissions</h2>
                {examSubmissions.length > 0 && (
                    <div className="flex-1 sm:max-w-md">
                        <div className="relative">
                            <Icon 
                                path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" 
                                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400"
                            />
                            <input
                                type="text"
                                placeholder="Search by student name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    title="Clear search"
                                >
                                    <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {searchTerm && (
                <p className="mt-2 text-sm text-slate-600">
                    Showing {filteredSubmissions.length} of {examSubmissions.length} submission(s)
                </p>
            )}
        </div>
        <div className="overflow-x-auto">
            {examSubmissions.length > 0 ? (
            <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Student Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted At</th>
                    <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">Actions</span>
                    </th>
                </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                {filteredSubmissions.length > 0 ? (
                    filteredSubmissions.map(submission => {
                        const score = submission.totalPointsPossible > 0 ? Math.round((submission.totalPointsAwarded / submission.totalPointsPossible) * 100) : 0;
                        return (
                            <tr key={submission.id} className="hover:bg-slate-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">{getUserName(submission)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600">{score}% ({submission.totalPointsAwarded}/{submission.totalPointsPossible} pts)</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{new Date(submission.submittedAt).toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button onClick={() => onGradeSubmission(submission.id)} className="text-indigo-600 hover:text-indigo-900 font-semibold">
                                        Grade Manually
                                    </button>
                                </td>
                            </tr>
                        );
                    })
                ) : (
                    <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                            <Icon path="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="mx-auto h-12 w-12 text-slate-400 mb-2"/>
                            <p className="font-semibold">No students found matching "{searchTerm}"</p>
                            <p className="text-sm mt-1">Try a different search term</p>
                        </td>
                    </tr>
                )}
                </tbody>
            </table>
            ) : (
            <div className="text-center py-16 text-slate-500">
                <Icon path="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m-7.289-2.72a3 3 0 00-4.682 2.72 9.094 9.094 0 003.741.479m-4.5-4.5a3 3 0 011.171 5.418M12 12a3 3 0 013 3m-3-3a3 3 0 00-3 3m3-3a3 3 0 013-3m-3 3a3 3 0 00-3-3m0 0a3 3 0 01-1.171-5.418M12 12a3 3 0 01-3-3m3 3a3 3 0 003-3m-3 3a3 3 0 01-1.171 5.418" className="mx-auto h-12 w-12 text-slate-400"/>
                <p className="mt-2 font-semibold">No submissions yet for this exam.</p>
            </div>
            )}
        </div>
      </div>

       <div className="bg-white rounded-2xl shadow-md">
        <div className="p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800">Question-by-Question Analysis</h2>
        </div>
        <div className="p-6">
            {examSubmissions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {exam.questions.map(q => (
                        <QuestionAnalysisCard key={q.id} question={q} submissions={examSubmissions} />
                    ))}
                </div>
            ) : (
                 <div className="text-center py-10 text-slate-500">
                    <p className="font-semibold">Analysis will be available after the first submission.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};