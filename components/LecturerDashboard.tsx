
import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from './Icon';
import { Exam, Course, BankQuestion } from '../types';
import { CreateExamModal } from './CreateExamModal';
import { QuestionBankView } from './QuestionBankView';
import { LecturerAnalyticsDashboard } from './LecturerAnalyticsDashboard';
import ExamMonitoringDashboard from './ExamMonitoringDashboard';
// REMOVED: import { LiveCameraMonitoring } from './LiveCameraMonitoring';
import { BulkGradingModal } from './BulkGradingModal';
import { RetakeManagementModal } from './RetakeManagementModal';
import { Pagination } from './Pagination';
import { useToast } from './Toast';

type ActiveTab = 'exams' | 'bank' | 'analytics' | 'monitoring' | 'grading' | 'retakes';
type ExamStatus = 'Active' | 'Scheduled' | 'Expired' | 'Unscheduled';

const ITEMS_PER_PAGE = 5;

interface LecturerDashboardProps {
  exams: Exam[];
  courses: Course[];
  bankQuestions: BankQuestion[];
  submissions: {
    id: string;
    examId: string;
    userId: string;
    results: {
      question: {
        type: string;
      };
      pointsAwarded?: number;
    }[];
  }[];
  users: { id: string; name: string; email: string; role: string }[];
  addExam: (exam: Exam) => void;
  updateExam: (exam: Exam) => void;
  deleteExam: (examId: string) => void;
  addQuestionToBank: (question: Omit<BankQuestion, 'id'>) => void;
  updateQuestionInBank: (question: BankQuestion) => void;
  deleteQuestionFromBank: (questionId: string) => void;
  onBulkGrade?: (submissionIds: string[], grades: { [questionId: string]: number }) => void;
}

const getExamStatus = (exam: Exam): { status: ExamStatus; color: string } => {
    const now = new Date();
    const from = exam.availableFrom ? new Date(exam.availableFrom) : null;
    const until = exam.availableUntil ? new Date(exam.availableUntil) : null;

    if (!from || !until) return { status: 'Unscheduled', color: 'bg-gray-100 text-gray-800' };
    if (now < from) return { status: 'Scheduled', color: 'bg-yellow-100 text-yellow-800' };
    if (now > until) return { status: 'Expired', color: 'bg-red-100 text-red-800' };
    return { status: 'Active', color: 'bg-green-100 text-green-800' };
};

export const LecturerDashboard: React.FC<LecturerDashboardProps> = (props) => {
  const { exams, courses, bankQuestions, submissions, users, addExam, updateExam, deleteExam, onBulkGrade } = props;
  const { showToast } = useToast();
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [isBulkGradingOpen, setIsBulkGradingOpen] = useState(false);
  const [isRetakeModalOpen, setIsRetakeModalOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [examToEdit, setExamToEdit] = useState<Exam | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = sessionStorage.getItem('lecturerDashboardActiveTab') as ActiveTab | null;
    return (saved && ['exams','bank','analytics','monitoring','grading','retakes'].includes(saved))
      ? (saved as ActiveTab)
      : 'exams';
  });
  const [examsPage, setExamsPage] = useState(1);
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('iqbaes-selected-course');
    if (saved && courses.some(c => c.id === saved)) {
      setSelectedCourseId(saved);
    }
  }, [courses]);

  useEffect(() => {
    localStorage.setItem('iqbaes-selected-course', selectedCourseId || '');
  }, [selectedCourseId]);

  useEffect(() => {
    sessionStorage.setItem('lecturerDashboardActiveTab', activeTab);
  }, [activeTab]);

  // Show cross-tab toast messages (e.g., after creating a question)
  useEffect(() => {
    const lastAction = sessionStorage.getItem('iqbaes-last-action');
    if (lastAction === 'question-created') {
      setGlobalToast('Question created successfully');
      sessionStorage.removeItem('iqbaes-last-action');
    } else if (lastAction === 'question-updated') {
      setGlobalToast('Question updated successfully');
      sessionStorage.removeItem('iqbaes-last-action');
    } else if (lastAction === 'exam-created') {
      setGlobalToast('Exam created successfully');
      sessionStorage.removeItem('iqbaes-last-action');
    } else if (lastAction === 'exam-updated') {
      setGlobalToast('Exam updated successfully');
      sessionStorage.removeItem('iqbaes-last-action');
    }
  }, [activeTab]);

  useEffect(() => {
    if (globalToast) {
      const t = setTimeout(() => setGlobalToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [globalToast]);

  const handleSaveExam = async (examData: Exam) => {
    try {
      if (examToEdit) {
        await updateExam(examData);
        showToast({
          message: '✅ Exam Updated Successfully!',
          subtitle: `Exam "${examData.title}" has been updated`,
          type: 'success'
        });
      } else {
        await addExam(examData as any);
        showToast({
          message: '✅ Exam Created Successfully!',
          subtitle: `Exam "${examData.title}" has been created`,
          type: 'success'
        });
      }
      setIsExamModalOpen(false);
      setExamToEdit(null);
    } catch (error: any) {
      console.error('Failed to save exam:', error);
      showToast({
        message: '❌ Failed to Save Exam',
        subtitle: error?.message || 'An error occurred',
        type: 'error'
      });
    }
  };

  const handleOpenCreateModal = () => {
    setExamToEdit(null);
    setIsExamModalOpen(true);
  };

  const handleOpenEditModal = (exam: Exam) => {
    setExamToEdit(exam);
    setIsExamModalOpen(true);
  };
  
  const handleDeleteExam = (examId: string) => {
      if (window.confirm("Are you sure you want to delete this exam? This will remove it for all students.")) {
          deleteExam(examId);
      }
  }

  const handleBulkGrade = (submissionIds: string[], grades: { [questionId: string]: number }) => {
    if (onBulkGrade) {
      onBulkGrade(submissionIds, grades);
    }
    setIsBulkGradingOpen(false);
  };

  const filteredExams = useMemo(() => {
    if (!selectedCourseId) return exams;
    return exams.filter(exam => exam.courseId === selectedCourseId);
  }, [exams, selectedCourseId]);

  const paginatedExams = useMemo(() => filteredExams.slice((examsPage - 1) * ITEMS_PER_PAGE, examsPage * ITEMS_PER_PAGE), [filteredExams, examsPage]);
  
  const filteredBankQuestions = useMemo(() => {
    if (!selectedCourseId) return bankQuestions;
    return bankQuestions.filter(q => q.courseId === selectedCourseId);
  }, [bankQuestions, selectedCourseId]);

  const filteredSubmissions = useMemo(() => {
    if (!selectedCourseId) return submissions;
    return submissions.filter(submission => {
      const exam = exams.find(e => e.id === submission.examId);
      return exam?.courseId === selectedCourseId;
    });
  }, [submissions, exams, selectedCourseId]);

  // Quick stats for the header
  const quickStats = useMemo(() => {
    const totalSubmissions = filteredSubmissions.length;
    const pendingGrading = filteredSubmissions.filter(s => 
      s.results.some(r => r.question.type === 'Essay' && (r.pointsAwarded === undefined || r.pointsAwarded === 0))
    ).length;
    const activeExams = filteredExams.filter(exam => {
      const now = new Date();
      const from = exam.availableFrom ? new Date(exam.availableFrom) : null;
      const until = exam.availableUntil ? new Date(exam.availableUntil) : null;
      return from && until && now >= from && now <= until;
    }).length;

    return { totalSubmissions, pendingGrading, activeExams };
  }, [filteredSubmissions, filteredExams]);

  const tabs = [
    { key: 'exams', label: 'My Exams', icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h4.5m0-6.25C8.25 8.946 7.007 8 5.5 8S2.75 8.946 2.75 12.5s1.243 4.5 2.75 4.5 2.75-2.054 2.75-4.5z' },
    { key: 'bank', label: 'Question Bank', icon: 'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125' },
    { key: 'analytics', label: 'Analytics', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
    { key: 'monitoring', label: 'Live Monitoring', icon: 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-1.036.84-1.875 1.875-1.875H8.25A2.25 2.25 0 0110.5 8.25v1.5h8.75V9.75c0-1.036.84-1.875 1.875-1.875H22.5A2.25 2.25 0 0124.75 10.5v6.75a2.25 2.25 0 01-2.25 2.25H15.75z' },
    { key: 'grading', label: 'Bulk Grading', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'retakes', label: 'Retake Management', icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99' }
  ];

  return (
    <>
      <CreateExamModal 
        isOpen={isExamModalOpen} 
        onClose={() => setIsExamModalOpen(false)} 
        onSave={handleSaveExam} 
        lecturerCourses={courses}
        examToEdit={examToEdit}
        questionBank={bankQuestions}
        initialCourseId={selectedCourseId}
      />
      
      <BulkGradingModal
        isOpen={isBulkGradingOpen}
        onClose={() => setIsBulkGradingOpen(false)}
        submissions={filteredSubmissions}
        onBulkGrade={handleBulkGrade}
      />

      <RetakeManagementModal
        isOpen={isRetakeModalOpen}
        onClose={() => setIsRetakeModalOpen(false)}
        exams={filteredExams}
        submissions={filteredSubmissions}
        users={users}
        courses={courses}
      />

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {globalToast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span>{globalToast}</span>
          </div>
        )}
        <header className="mb-8">
          <div className="md:flex justify-between items-start mb-6">
            <div className="mb-4 md:mb-0">
                <div className="flex items-center space-x-3 mb-2">
                  <img src="/fcom.png" alt="FCOM Logo" className="h-12 w-12 object-contain"/>
                  <h1 className="text-4xl font-bold text-slate-800">Lecturer Dashboard</h1>
                </div>
                <p className="text-slate-500 mt-2">Comprehensive exam management and analytics platform.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => setIsRetakeModalOpen(true)}
                className="bg-purple-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-purple-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 flex items-center"
              >
                  <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className="w-5 h-5 mr-2" />
                  Manage Retakes
              </button>
              <button 
                onClick={() => setIsBulkGradingOpen(true)}
                disabled={filteredSubmissions.length === 0}
                className="bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-green-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 flex items-center disabled:bg-green-300 disabled:cursor-not-allowed"
              >
                  <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 mr-2" />
                  Bulk Grade
              </button>
              <button 
                onClick={handleOpenCreateModal}
                disabled={courses.length === 0}
                className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-indigo-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center disabled:bg-indigo-300 disabled:cursor-not-allowed"
              >
                  <Icon path="M12 4.5v15m7.5-7.5h-15" className="w-5 h-5 mr-2" />
                  Create New Exam
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-xl text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">Total Submissions</p>
                  <p className="text-3xl font-bold">{quickStats.totalSubmissions}</p>
                </div>
                <Icon path="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h4.5m0-6.25C8.25 8.946 7.007 8 5.5 8S2.75 8.946 2.75 12.5s1.243 4.5 2.75 4.5 2.75-2.054 2.75-4.5z" className="w-8 h-8" />
              </div>
            </div>
            <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-6 rounded-xl text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-yellow-100">Pending Grading</p>
                  <p className="text-3xl font-bold">{quickStats.pendingGrading}</p>
                </div>
                <Icon path="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-8 h-8" />
              </div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-xl text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">Active Exams</p>
                  <p className="text-3xl font-bold">{quickStats.activeExams}</p>
                </div>
                <Icon path="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-1.036.84-1.875 1.875-1.875H8.25A2.25 2.25 0 0110.5 8.25v1.5h8.75V9.75c0-1.036.84-1.875 1.875-1.875H22.5A2.25 2.25 0 0124.75 10.5v6.75a2.25 2.25 0 01-2.25 2.25H15.75z" className="w-8 h-8" />
              </div>
            </div>
          </div>
        </header>
        
        {courses.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-md overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                     <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                        <nav className="flex flex-wrap gap-2" aria-label="Tabs">
                            {tabs.map(tab => (
                              <button 
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as ActiveTab)} 
                                className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                                  activeTab === tab.key 
                                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <Icon path={tab.icon} className="w-4 h-4 mr-2" />
                                {tab.label}
                              </button>
                            ))}
                        </nav>
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-slate-500">Course:</label>
                          <select
                            value={selectedCourseId}
                            onChange={(e) => setSelectedCourseId(e.target.value)}
                            className="px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                          >
                            <option value="">All Courses</option>
                            {courses.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="p-6">
                  {activeTab === 'exams' && (
                    <div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Exam Title</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Questions</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Duration</th>
                                        <th scope="col" className="relative px-6 py-3">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {paginatedExams.map((exam) => {
                                        const { status, color } = getExamStatus(exam);
                                        return (
                                            <tr key={exam.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-semibold text-slate-900">{exam.title}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>
                                                        {status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                                        {exam.questionCount}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                                    {exam.durationMinutes} mins
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                                                    <button onClick={() => window.location.hash = `#/lecturer/results/${exam.id}`} className="text-indigo-600 hover:text-indigo-900 font-semibold">View Results</button>
                                                    <button onClick={() => handleOpenEditModal(exam)} className="text-slate-500 hover:text-slate-700 font-semibold">Edit</button>
                                                    <button onClick={() => handleDeleteExam(exam.id)} className="text-red-600 hover:text-red-900 font-semibold">Delete</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredExams.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="text-center py-10 text-slate-500">
                                                    No exams created for this course yet.
                                                </td>
                                            </tr>
                                        )}
                                </tbody>
                            </table>
                        </div>
                        <Pagination currentPage={examsPage} totalPages={Math.ceil(filteredExams.length / ITEMS_PER_PAGE)} onPageChange={setExamsPage} />
                    </div>
                  )}

                  {activeTab === 'bank' && (
                    <QuestionBankView 
                        courseId={selectedCourseId}
                        questions={filteredBankQuestions}
                        addQuestion={props.addQuestionToBank}
                        updateQuestion={props.updateQuestionInBank}
                        deleteQuestion={props.deleteQuestionFromBank}
                        courses={courses}
                        onNavigateTab={(tab) => setActiveTab(tab as ActiveTab)}
                    />
                  )}

                  {activeTab === 'analytics' && (
                    <LecturerAnalyticsDashboard
                      exams={filteredExams}
                      submissions={filteredSubmissions}
                      users={users}
                      courses={courses}
                    />
                  )}

                  {activeTab === 'monitoring' && (
                    <div>
                      {/* REMOVED: Live Camera Monitoring section */}
                      
                      {/* Keep only Exam Monitoring Dashboard */}
                      <div>
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">📊 Live Exam Monitoring</h2>
                        <ExamMonitoringDashboard
                          exams={filteredExams}
                          submissions={filteredSubmissions}
                          userRole="lecturer"
                        />
                      </div>
                    </div>
                  )}

                  {activeTab === 'grading' && (
                    <div className="text-center py-12">
                      <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="mx-auto h-16 w-16 text-slate-400 mb-4" />
                      <h3 className="text-lg font-medium text-slate-900 mb-2">Bulk Grading Assistant</h3>
                      <p className="text-slate-500 mb-6">
                        Grade multiple submissions efficiently with AI-powered similarity detection.
                      </p>
                      <button 
                        onClick={() => setIsBulkGradingOpen(true)}
                        disabled={filteredSubmissions.length === 0}
                        className="bg-green-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-green-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 flex items-center mx-auto disabled:bg-green-300 disabled:cursor-not-allowed"
                      >
                          <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 mr-2" />
                          Start Bulk Grading
                      </button>
                      {filteredSubmissions.length === 0 && (
                        <p className="text-sm text-slate-400 mt-4">No submissions available for grading.</p>
                      )}
                    </div>
                  )}
                  {activeTab === 'retakes' && (
                    <div className="text-center py-12">
                      <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className="mx-auto h-16 w-16 text-slate-400 mb-4" />
                      <h3 className="text-lg font-medium text-slate-900 mb-2">Retake Management</h3>
                      <p className="text-slate-500 mb-6">
                        Allow students to retake exams and manage retake permissions.
                      </p>
                      <button 
                        onClick={() => setIsRetakeModalOpen(true)}
                        className="bg-purple-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-purple-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 flex items-center mx-auto"
                      >
                          <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className="w-5 h-5 mr-2" />
                          Open Retake Manager
                      </button>
                    </div>
                  )}
                </div>
            </div>
        ) : (
            <div className="text-center py-20 bg-white rounded-2xl shadow-md">
                <Icon path="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-medium text-slate-900">No Courses Assigned</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Please contact an administrator to be assigned to a course before creating an exam.
                </p>
            </div>
        )}
      </div>
    </>
  );
};