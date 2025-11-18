import React, { useState, useMemo } from 'react';
import { ExamSubmission, Course, Exam } from '../types';
import { Icon } from './Icon';
import { Pagination } from './Pagination';
import { useAuth } from '../contexts/AuthContext';

const ITEMS_PER_PAGE = 5;

interface HistoryViewProps {
  submissions: ExamSubmission[];
  courses: Course[];
  allExams: Exam[];
}

export const HistoryView: React.FC<HistoryViewProps> = ({ submissions, courses, allExams }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { refreshData } = useAuth();

  const extractId = (val: any): string | undefined => {
    if (!val) return undefined;
    if (typeof val === 'string') return val;
    return val.id || val._id || undefined;
  };

  const getCourseName = (courseId: any) => {
    // Handle both populated object and string ID
    if (typeof courseId === 'object' && courseId?.name) {
      return courseId.name;
    }
    return courses.find(c => c.id === courseId)?.name || 'Unknown Course';
  };
  
  const getExamTitle = (examId: any) => {
    // Handle both populated object and string ID
    if (typeof examId === 'object' && examId?.title) {
      return examId.title;
    }
    return allExams.find(e => e.id === examId)?.title || 'Unknown Exam';
  };

  const filteredExams = useMemo(() => {
    if (!selectedCourseId) return allExams;
    return allExams.filter(e => extractId(e.courseId) === selectedCourseId);
  }, [allExams, selectedCourseId]);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      // Filter out placeholder submissions - these should NOT appear in history
      // Placeholder submissions are created only for retake permission tracking
      // They should only appear in history if the student actually takes the exam
      const isPlaceholder = Boolean((s as any).isPlaceholder);
      if (isPlaceholder) {
        return false; // Don't show placeholder submissions in history
      }
      
      const matchesCourse = !selectedCourseId || extractId(s.courseId) === selectedCourseId;
      const matchesExam = !selectedExamId || extractId(s.examId) === selectedExamId;
      return matchesCourse && matchesExam;
    });
  }, [submissions, selectedCourseId, selectedExamId]);

  const paginatedSubmissions = useMemo(() => {
    const sortedSubmissions = [...filteredSubmissions].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return sortedSubmissions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [filteredSubmissions, currentPage]);

  const handleRefresh = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // CRITICAL: Prevent any default behavior or navigation
    e.preventDefault();
    e.stopPropagation();
    
    // Store current hash to prevent navigation
    const currentHash = window.location.hash || '#/';
    
    setIsRefreshing(true);
    try {
      // Refresh data - this should only update state, not navigate
      await refreshData();
      
      // Double-check: Ensure we stay on the same page after refresh
      // Use setTimeout to ensure this runs after any potential navigation
      setTimeout(() => {
        if (window.location.hash !== currentHash) {
          console.log(`🔧 Preventing navigation: restoring hash from ${window.location.hash} to ${currentHash}`);
          window.location.hash = currentHash;
        }
      }, 100);
    } catch (error) {
      console.error('Error refreshing data:', error);
      // Even on error, stay on the same page
      setTimeout(() => {
        if (window.location.hash !== currentHash) {
          window.location.hash = currentHash;
        }
      }, 100);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (submissions.length === 0) {
    return (
        <div className="text-center py-12 bg-white rounded-2xl shadow-md mt-6">
            <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="mx-auto h-12 w-12 text-slate-400" />
            <h3 className="mt-2 text-lg font-medium text-slate-900">No Exam History</h3>
            <p className="mt-1 text-sm text-slate-500">
                Your completed exams will appear here.
            </p>
        </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Exam History</h2>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh exam history"
        >
          <Icon 
            path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" 
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} 
          />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-md p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Course</label>
            <select
              value={selectedCourseId}
              onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedExamId(''); setCurrentPage(1); }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Courses</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Filter by Exam</label>
            <select
              value={selectedExamId}
              onChange={(e) => { setSelectedExamId(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Exams{selectedCourseId ? ' in Course' : ''}</option>
              {filteredExams.map(exam => (
                <option key={exam.id} value={exam.id}>{exam.title}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <p className="text-sm text-slate-600">Showing {filteredSubmissions.length} submission(s)</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exam Title</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Course</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Score</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted</th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">View Results</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {paginatedSubmissions.map(submission => {
                // Check if submission is flagged/invalidated
                const isFlagged = Boolean((submission as any).flagged);
                const flagReason = (submission as any).flagReason;
                
                // Calculate score - use totalPointsAwarded for flagged submissions (should be 0)
                const totalPoints = isFlagged 
                  ? (submission.totalPointsAwarded || 0)
                  : submission.results.reduce((acc, r) => acc + (r.lecturerOverridePoints !== undefined ? r.lecturerOverridePoints : r.pointsAwarded), 0);
                const score = submission.totalPointsPossible > 0 ? Math.round((totalPoints / submission.totalPointsPossible) * 100) : 0;
                
                return (
                  <tr key={submission.id} className={`hover:bg-slate-50 ${isFlagged ? 'bg-red-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-semibold text-slate-900">{getExamTitle(submission.examId)}</span>
                        {isFlagged && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                            <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" className="w-3 h-3 mr-1" />
                            Invalidated
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{getCourseName(submission.courseId)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-bold ${isFlagged ? 'text-red-600' : 'text-indigo-600'}`}>
                        {isFlagged ? '0%' : `${score}%`}
                      </span>
                      {isFlagged && flagReason && (
                        <div className="text-xs text-red-600 mt-1">Reason: {flagReason}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{new Date(submission.submittedAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => window.location.hash = `#/results/${submission.id}`}
                        className="text-indigo-600 hover:text-indigo-900 font-semibold"
                      >
                        View Results
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination 
            currentPage={currentPage} 
            totalPages={Math.ceil(filteredSubmissions.length / ITEMS_PER_PAGE)} 
            onPageChange={setCurrentPage} 
        />
      </div>
    </div>
  );
};