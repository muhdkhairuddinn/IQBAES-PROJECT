import React, { useState, useEffect } from 'react';
import { Exam, Course, ExamSubmission } from '../types';
import { Icon } from './Icon';
import { PracticeCenter } from './PracticeCenter';
import { PerformanceAnalytics } from './PerformanceAnalytics';
import { HistoryView } from './HistoryView';
import { useAuth } from '../contexts/AuthContext';

interface StudentDashboardProps {
  exams: Exam[];
  allExams: Exam[];
  courses: Course[];
  submissions: ExamSubmission[];
  onStartExam: (examId: string) => void;
  onGeneratePracticeQuiz: (courseId: string, questionCount: number, difficulty: 'easy' | 'medium' | 'hard' | 'mix', focusOnWeaknesses: boolean) => void;
}

type ActiveTab = 'exams' | 'practice' | 'history' | 'analytics';

const TabButton: React.FC<{ icon: string; label: string; isActive: boolean; onClick: () => void; }> = ({ icon, label, isActive, onClick }) => (
    <button onClick={onClick} className={`flex items-center space-x-3 px-4 py-3 rounded-xl font-semibold transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-200'}`}>
        <Icon path={icon} className="w-6 h-6" />
        <span>{label}</span>
    </button>
);

const ExamsView: React.FC<Pick<StudentDashboardProps, 'exams' | 'courses' | 'submissions' | 'onStartExam'>> = ({ exams, courses, submissions, onStartExam }) => {
  const { refreshData, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const getCourseById = (id: string) => courses.find(c => c.id === id);

  const getExamStatus = (exam: Exam) => {
    if (!user) return { isRetake: false, attemptNumber: 0 };
    
    // Get ALL submissions for this exam (including placeholders for retake permission checking)
    // Placeholder submissions are used to track retake permissions but don't appear in history
    const examSubmissions = submissions
      .filter(s => s.examId === exam.id && s.userId === user.id)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()); // Sort by most recent first
    
    // Check for retake permission on the MOST RECENT submission (could be a placeholder)
    // IMPORTANT: If isRetakeAllowed is true, it means a lecturer/admin explicitly granted permission
    // This overrides any previous flagged status (flagged is cleared when granting retake)
    // So we only check isRetakeAllowed, not the flagged status
    // NOTE: Placeholder submissions can have isRetakeAllowed: true, which is used to show retake option
    const mostRecentSubmission = examSubmissions[0];
    const hasRetakePermission = mostRecentSubmission 
      ? Boolean(mostRecentSubmission.isRetakeAllowed)
      : false;
    
    // Calculate attempt number - only count non-placeholder submissions
    // Placeholder submissions don't count as attempts since the student hasn't taken the exam yet
    const nonPlaceholderSubmissions = examSubmissions.filter(s => !Boolean((s as any).isPlaceholder));
    const attemptNumber = nonPlaceholderSubmissions.length > 0 
      ? ((nonPlaceholderSubmissions[0].attemptNumber || nonPlaceholderSubmissions.length) + 1)
      : 1;
    
    return { isRetake: hasRetakePermission, attemptNumber };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Available Exams</h2>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors disabled:opacity-50"
        >
          <Icon 
            path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" 
            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} 
          />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>
      
      {exams.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <ul className="divide-y divide-slate-200">
            {exams.map(exam => {
              const { isRetake, attemptNumber } = getExamStatus(exam);
              return (
                <li key={exam.id} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-xl font-semibold text-indigo-600">{exam.title}</h3>
                        {isRetake && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className="w-3 h-3 mr-1" />
                            Retake Available
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 mt-1">{getCourseById(exam.courseId)?.name}</p>
                      <div className="flex items-center space-x-6 mt-3 text-sm text-slate-600">
                        <span className="flex items-center"><Icon path="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" className="w-5 h-5 mr-2 text-slate-400"/> {exam.questionCount} Questions</span>
                        <span className="flex items-center"><Icon path="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" className="w-5 h-5 mr-2 text-slate-400"/> {exam.durationMinutes} Minutes</span>
                        {isRetake && (
                          <span className="flex items-center text-orange-600">
                            <Icon path="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" className="w-5 h-5 mr-2" />
                            Attempt #{attemptNumber}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onStartExam(exam.id)}
                      className={`mt-4 sm:mt-0 font-bold py-2 px-6 rounded-lg shadow-md transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center ${
                        isRetake 
                          ? 'bg-orange-600 text-white hover:bg-orange-700 focus:ring-orange-500' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
                      }`}
                    >
                      {isRetake ? 'Retake Exam' : 'Start Exam'}
                      <Icon path="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" className="w-5 h-5 ml-2"/>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl shadow-md">
          <Icon path="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.852l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-lg font-medium text-slate-900">No Exams Available</h3>
          <p className="mt-1 text-sm text-slate-500">Check back later for upcoming exams.</p>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      )}
    </div>
  );
};


export const StudentDashboard: React.FC<StudentDashboardProps> = (props) => {
  // Persist activeTab in sessionStorage to prevent reset on refresh/data updates
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = sessionStorage.getItem('studentDashboardActiveTab') as ActiveTab | null;
    return (saved && ['exams', 'practice', 'history', 'analytics'].includes(saved))
      ? (saved as ActiveTab)
      : 'exams';
  });
  
  // Save activeTab to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem('studentDashboardActiveTab', activeTab);
  }, [activeTab]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <img src="/fcom.png" alt="FCOM Logo" className="h-12 w-12 object-contain"/>
          <h1 className="text-4xl font-bold text-slate-800">Student Dashboard</h1>
        </div>
        <p className="text-slate-500 mt-2">Welcome back! Here's your hub for exams, practice, and performance.</p>
      </header>
      
      <div className="bg-white rounded-2xl shadow-md p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <TabButton icon="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h4.5m0-6.25C8.25 8.946 7.007 8 5.5 8S2.75 8.946 2.75 12.5s1.243 4.5 2.75 4.5 2.75-2.054 2.75-4.5z" label="Available Exams" isActive={activeTab === 'exams'} onClick={() => setActiveTab('exams')} />
              <TabButton icon="M12 6.253v11.494m-9-5.747h18" label="Practice Center" isActive={activeTab === 'practice'} onClick={() => setActiveTab('practice')} />
              <TabButton icon="M3 4.5h14.25M3 9h14.25m-14.25 4.5h14.25M3 18h14.25" label="Exam History" isActive={activeTab === 'history'} onClick={() => setActiveTab('history')} />
              <TabButton icon="M10.5 6a7.5 7.5 0 100 15 7.5 7.5 0 000-15zM10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15zM13.5 10.5a3 3 0 11-6 0 3 3 0 016 0z" label="Analytics" isActive={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
          </div>
      </div>
      
      {activeTab === 'exams' && <ExamsView exams={props.exams} courses={props.courses} submissions={props.submissions} onStartExam={props.onStartExam} />}
      {activeTab === 'practice' && <PracticeCenter courses={props.courses} onGenerate={props.onGeneratePracticeQuiz} />}
      {activeTab === 'history' && <HistoryView submissions={props.submissions} courses={props.courses} allExams={props.allExams} />}
      {activeTab === 'analytics' && <PerformanceAnalytics submissions={props.submissions} courses={props.courses} allExams={props.allExams} />}
    </div>
  );
};